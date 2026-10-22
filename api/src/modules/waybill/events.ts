// 一单制运行事件：waybill_event + 哈希链存证；箱动态；分段运单状态联动
import type { PoolConnection } from 'mysql2/promise';
import { txExec, txQueryOne, txQueryRows } from '../../db/pool';
import { appendNotarize, type NotarizeResult } from '../../platform/notary';
import type {
  ContainerMovementType,
  SegmentMode,
  WaybillEventType,
  WaybillRow,
  WaybillStatus,
} from '../../types';
import { formatDateTime, nowDate } from '../../utils/datetime';

export interface AppendWaybillEventParams {
  waybillId: number;
  segmentId?: number | null;
  eventType: WaybillEventType;
  nodeId?: number | null;
  operatorUserId?: number | null;
  description?: string | null;
  payload?: Record<string, unknown>;
  occurredAt?: string;
}

export interface AppendedEvent extends NotarizeResult {
  eventId: number;
  occurredAt: string;
}

/** 追加交接事件（写 waybill_event + 全局哈希链存证，并刷新运单最新存证 txId） */
export async function appendWaybillEvent(
  conn: PoolConnection,
  params: AppendWaybillEventParams,
): Promise<AppendedEvent> {
  const occurredAt = params.occurredAt ?? formatDateTime(nowDate());
  const notarized = await appendNotarize(conn, {
    bizType: 'WAYBILL',
    bizId: Number(params.waybillId),
    eventType: params.eventType,
    payload: params.payload ?? {},
    occurredAt,
  });
  const inserted = await txExec(
    conn,
    `INSERT INTO waybill_event (waybill_id, segment_id, event_type, occurred_at, node_id, operator_user_id,
       description, payload, prev_hash, hash, tx_id, block_height, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.waybillId,
      params.segmentId ?? null,
      params.eventType,
      occurredAt,
      params.nodeId ?? null,
      params.operatorUserId ?? null,
      params.description ?? null,
      JSON.stringify(params.payload ?? {}),
      notarized.prevHash,
      notarized.hash,
      notarized.txId,
      notarized.blockHeight,
      occurredAt,
    ],
  );
  await txExec(conn, 'UPDATE waybill SET notarize_tx_id = ?, updated_at = ? WHERE id = ?', [
    notarized.txId,
    occurredAt,
    params.waybillId,
  ]);
  return { ...notarized, eventId: Number(inserted.insertId), occurredAt };
}

export interface AppendMovementParams {
  containerId: number;
  waybillId?: number | null;
  movementType: ContainerMovementType;
  nodeId?: number | null;
  operatorUserId?: number | null;
  conditionText?: string | null;
  photoUrl?: string | null;
  remark?: string | null;
  occurredAt?: string;
}

/** 追加箱动态 */
export async function appendContainerMovement(
  conn: PoolConnection,
  params: AppendMovementParams,
): Promise<{ id: number; occurredAt: string }> {
  const occurredAt = params.occurredAt ?? formatDateTime(nowDate());
  const inserted = await txExec(
    conn,
    `INSERT INTO container_movement (container_id, waybill_id, movement_type, node_id, occurred_at,
       operator_user_id, condition_text, photo_url, remark, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.containerId,
      params.waybillId ?? null,
      params.movementType,
      params.nodeId ?? null,
      occurredAt,
      params.operatorUserId ?? null,
      params.conditionText ?? null,
      params.photoUrl ?? null,
      params.remark ?? null,
      occurredAt,
    ],
  );
  return { id: Number(inserted.insertId), occurredAt };
}

/** 按节点名称查港站 id */
export async function findNodeIdByName(
  conn: PoolConnection,
  nodeName: string | null | undefined,
): Promise<number | null> {
  if (!nodeName) return null;
  const row = await txQueryOne<{ id: number }>(
    conn,
    'SELECT id FROM port_station WHERE node_name = ? LIMIT 1',
    [nodeName],
  );
  return row ? Number(row.id) : null;
}

/** 取主运单及其分段运单 */
export async function listWaybillFamily(
  conn: PoolConnection,
  waybillId: number,
): Promise<{ master: WaybillRow | null; children: WaybillRow[]; familyIds: number[] }> {
  const current = await txQueryOne<WaybillRow>(conn, 'SELECT * FROM waybill WHERE id = ?', [waybillId]);
  if (!current) {
    return { master: null, children: [], familyIds: [] };
  }
  const masterId =
    current.waybill_type === 'SEGMENT' && current.parent_waybill_id
      ? Number(current.parent_waybill_id)
      : Number(current.id);
  const master =
    Number(current.id) === masterId
      ? current
      : await txQueryOne<WaybillRow>(conn, 'SELECT * FROM waybill WHERE id = ?', [masterId]);
  const children = await txQueryRows<WaybillRow>(
    conn,
    "SELECT * FROM waybill WHERE parent_waybill_id = ? AND waybill_type = 'SEGMENT' ORDER BY id ASC",
    [masterId],
  );
  return {
    master: master ?? current,
    children,
    familyIds: [masterId, ...children.map((child) => Number(child.id))],
  };
}

/** 分段运单状态联动（按父运单 + mode 唯一定位） */
export async function updateSegmentWaybillStatus(
  conn: PoolConnection,
  masterWaybillId: number,
  mode: SegmentMode,
  status: WaybillStatus,
  extra?: { signerName?: string | null; signedAt?: string | null },
): Promise<void> {
  const at = formatDateTime(nowDate());
  await txExec(
    conn,
    `UPDATE waybill SET status = ?, signer_name = COALESCE(?, signer_name),
       signed_at = COALESCE(?, signed_at), updated_at = ?
     WHERE parent_waybill_id = ? AND waybill_type = 'SEGMENT' AND mode = ?`,
    [status, extra?.signerName ?? null, extra?.signedAt ?? null, at, masterWaybillId, mode],
  );
}

/** 主运单签收时，全部分段运单同步 SIGNED */
export async function signAllSegmentWaybills(
  conn: PoolConnection,
  masterWaybillId: number,
  signerName: string,
  signedAt: string,
): Promise<void> {
  await txExec(
    conn,
    `UPDATE waybill SET status = 'SIGNED', signer_name = ?, signed_at = ?, updated_at = ?
     WHERE parent_waybill_id = ? AND waybill_type = 'SEGMENT'`,
    [signerName, signedAt, signedAt, masterWaybillId],
  );
}

/** 运单关联的集装箱（master 级） */
export async function listWaybillContainers(conn: PoolConnection, waybillId: number) {
  return txQueryRows<{
    id: number;
    container_no: string;
    type: string;
    status: string;
    condition_text: string | null;
    seal_no: string | null;
    current_node_id: number | null;
    node_name: string | null;
    repair_fee: number;
  }>(
    conn,
    `SELECT c.id, c.container_no, c.type, c.status, c.condition_text, wc.seal_no,
            c.current_node_id, n.node_name, c.repair_fee
       FROM waybill_container wc
       JOIN container c ON c.id = wc.container_id
       LEFT JOIN port_station n ON n.id = c.current_node_id
      WHERE wc.waybill_id = ?
      ORDER BY c.id ASC`,
    [waybillId],
  );
}
