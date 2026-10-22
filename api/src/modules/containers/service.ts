// 箱管中心：箱列表/详情、放箱、动态登记、还箱、维修、堆存
import {
  CONTAINER_MOVEMENT_LABELS,
  CONTAINER_STATUS_LABELS,
  STORAGE_STATUS_LABELS,
  WAYBILL_EVENT_LABELS,
} from '../../config/labels';
import { queryOne, queryRows, txExec, txQueryOne, txQueryRows, withTransaction } from '../../db/pool';
import { ApiError } from '../../errors';
import { writeAudit } from '../../middleware/audit';
import { insertIntegrationMessage, portCodecoMessage, portCoarriMessage } from '../../platform/edi';
import type {
  AuthUser,
  ContainerMovementType,
  ContainerRow,
  ContainerStatus,
  StorageStatus,
  WaybillEventType,
  WaybillRow,
} from '../../types';
import { formatDateTime, nowDate } from '../../utils/datetime';
import { round2 } from '../../utils/json';
import { appendContainerMovement, appendWaybillEvent } from '../waybill/events';
import { optionalString, pageResult, parsePage } from '../shared/pagination';

/** 堆存费单价（元/天，Mock） */
const STORAGE_FEE_PER_DAY = 80;
const DAY_MS = 86400000;

const ALLOWED_MOVEMENTS: ContainerMovementType[] = [
  'PICKUP',
  'GATE_IN',
  'LOAD',
  'DEPART',
  'ARRIVE',
  'DISCHARGE',
  'GATE_OUT',
];

const MOVEMENT_STATUS: Partial<Record<ContainerMovementType, ContainerStatus>> = {
  PICKUP: 'RELEASED',
  GATE_IN: 'GATE_IN',
  LOAD: 'LOADED',
  DEPART: 'IN_TRANSIT',
  ARRIVE: 'ARRIVED',
  DISCHARGE: 'AT_DEPOT',
  GATE_OUT: 'AT_DEPOT',
};

const MOVEMENT_EVENT: Partial<Record<ContainerMovementType, WaybillEventType>> = {
  RELEASE: 'RELEASE',
  PICKUP: 'PICKUP',
  GATE_IN: 'GATE_IN',
  LOAD: 'LOAD',
  DEPART: 'DEPART',
  ARRIVE: 'ARRIVE',
  DISCHARGE: 'DISCHARGE',
  GATE_OUT: 'HANDOVER',
  RETURN: 'HANDOVER',
};

interface ContainerJoinedRow extends ContainerRow {
  node_name: string | null;
  waybill_no: string | null;
  owner_name: string | null;
  order_no: string | null;
}

function containerListDto(row: ContainerJoinedRow) {
  return {
    id: Number(row.id),
    containerNo: row.container_no,
    type: row.type,
    status: row.status,
    statusLabel: CONTAINER_STATUS_LABELS[row.status],
    currentNode: row.node_name,
    currentNodeId: row.current_node_id === null ? null : Number(row.current_node_id),
    currentWaybillId: row.current_waybill_id === null ? null : Number(row.current_waybill_id),
    currentWaybillNo: row.waybill_no,
    ownerPartnerName: row.owner_name,
    conditionText: row.condition_text,
    repairFee: Number(row.repair_fee ?? 0),
    sealNo: row.seal_no,
    orderId: Number(row.order_id),
    orderNo: row.order_no,
  };
}

const CONTAINER_JOINED_SELECT = `
  SELECT c.*, n.node_name, w.waybill_no, p.name AS owner_name, o.order_no
    FROM container c
    LEFT JOIN port_station n ON n.id = c.current_node_id
    LEFT JOIN waybill w ON w.id = c.current_waybill_id
    LEFT JOIN partner p ON p.id = c.owner_partner_id
    LEFT JOIN orders o ON o.id = c.order_id`;

/** GET /api/containers */
export async function listContainers(user: AuthUser, query: Record<string, unknown>) {
  const pager = parsePage(query, 10);
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (user.role === 'CARRIER') {
    conditions.push(`(EXISTS (
      SELECT 1 FROM waybill w2 JOIN waybill_segment s ON s.waybill_id = w2.id
       WHERE w2.id = c.current_waybill_id AND s.carrier_user_id = ?
    ) OR c.owner_partner_id = ?)`);
    params.push(user.uid, user.partner_id ?? -1);
  }
  const status = optionalString(query.status);
  const keyword = optionalString(query.keyword);
  if (status) {
    conditions.push('c.status = ?');
    params.push(status);
  }
  if (keyword) {
    conditions.push('(c.container_no LIKE ? OR w.waybill_no LIKE ? OR o.order_no LIKE ?)');
    const like = `%${keyword}%`;
    params.push(like, like, like);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM container c
       LEFT JOIN waybill w ON w.id = c.current_waybill_id
       LEFT JOIN orders o ON o.id = c.order_id ${where}`,
    params,
  );
  const rows = await queryRows<ContainerJoinedRow>(
    `${CONTAINER_JOINED_SELECT} ${where} ORDER BY c.id ASC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  return pageResult(rows.map(containerListDto), Number(totalRow?.total ?? 0), pager);
}

function movementDto(row: {
  id: number;
  waybill_id: number | null;
  movement_type: ContainerMovementType;
  occurred_at: string;
  condition_text: string | null;
  photo_url: string | null;
  remark: string | null;
  node_name: string | null;
  operator_name: string | null;
}) {
  return {
    id: Number(row.id),
    waybillId: row.waybill_id === null ? null : Number(row.waybill_id),
    movementType: row.movement_type,
    movementLabel: CONTAINER_MOVEMENT_LABELS[row.movement_type],
    nodeName: row.node_name,
    occurredAt: row.occurred_at,
    conditionText: row.condition_text,
    photoUrl: row.photo_url,
    remark: row.remark,
    operator: row.operator_name,
  };
}

/** GET /api/containers/:id */
export async function getContainerDetail(id: number) {
  const container = await queryOne<ContainerJoinedRow>(`${CONTAINER_JOINED_SELECT} WHERE c.id = ?`, [id]);
  if (!container) {
    throw new ApiError(40401, '集装箱不存在');
  }
  const movements = await queryRows<{
    id: number;
    waybill_id: number | null;
    movement_type: ContainerMovementType;
    occurred_at: string;
    condition_text: string | null;
    photo_url: string | null;
    remark: string | null;
    node_name: string | null;
    operator_name: string | null;
  }>(
    `SELECT m.*, n.node_name, u.display_name AS operator_name
       FROM container_movement m
       LEFT JOIN port_station n ON n.id = m.node_id
       LEFT JOIN user u ON u.id = m.operator_user_id
      WHERE m.container_id = ? ORDER BY m.occurred_at ASC, m.id ASC`,
    [id],
  );
  const storage = await queryRows<{
    id: number;
    node_id: number;
    start_at: string;
    end_at: string | null;
    storage_days: number;
    fee_amount: number;
    status: StorageStatus;
    node_name: string | null;
  }>(
    `SELECT ds.*, n.node_name
       FROM depot_storage ds
       LEFT JOIN port_station n ON n.id = ds.node_id
      WHERE ds.container_id = ? ORDER BY ds.start_at ASC, ds.id ASC`,
    [id],
  );
  const waybill = container.current_waybill_id
    ? await queryOne<WaybillRow>('SELECT * FROM waybill WHERE id = ?', [container.current_waybill_id])
    : null;

  return {
    container: {
      id: Number(container.id),
      containerNo: container.container_no,
      type: container.type,
      status: container.status,
      statusLabel: CONTAINER_STATUS_LABELS[container.status],
      currentNode: container.node_name,
      currentNodeId: container.current_node_id === null ? null : Number(container.current_node_id),
      conditionText: container.condition_text,
      repairFee: Number(container.repair_fee ?? 0),
      sealNo: container.seal_no,
      ownerPartnerName: container.owner_name,
      orderId: Number(container.order_id),
      orderNo: container.order_no,
    },
    waybill: waybill
      ? {
          id: Number(waybill.id),
          waybillNo: waybill.waybill_no,
          waybillType: waybill.waybill_type,
          status: waybill.status,
        }
      : null,
    movements: movements.map(movementDto),
    storage: storage.map((row) => ({
      id: Number(row.id),
      nodeId: Number(row.node_id),
      nodeName: row.node_name,
      startAt: row.start_at,
      endAt: row.end_at,
      storageDays: Number(row.storage_days),
      feeAmount: Number(row.fee_amount),
      status: row.status,
      statusLabel: STORAGE_STATUS_LABELS[row.status],
    })),
  };
}

async function loadContainerForUpdate(conn: import('mysql2/promise').PoolConnection, id: number) {
  const row = await txQueryOne<ContainerRow>(conn, 'SELECT * FROM container WHERE id = ? FOR UPDATE', [id]);
  if (!row) {
    throw new ApiError(40401, '集装箱不存在');
  }
  return row;
}

async function assertNode(conn: import('mysql2/promise').PoolConnection, nodeId: number | null | undefined) {
  if (!nodeId) return null;
  const node = await txQueryOne<{ id: number; node_code: string; node_name: string }>(
    conn,
    'SELECT id, node_code, node_name FROM port_station WHERE id = ?',
    [nodeId],
  );
  if (!node) {
    throw new ApiError(40401, '港站节点不存在');
  }
  return node;
}

async function loadWaybillLite(conn: import('mysql2/promise').PoolConnection, waybillId: number | null) {
  if (!waybillId) return null;
  const waybill = await txQueryOne<WaybillRow>(conn, 'SELECT * FROM waybill WHERE id = ?', [waybillId]);
  if (!waybill) {
    throw new ApiError(40401, '关联运单不存在');
  }
  return waybill;
}

async function applyMovementSideEffects(params: {
  conn: import('mysql2/promise').PoolConnection;
  container: ContainerRow;
  waybill: WaybillRow | null;
  movementType: ContainerMovementType;
  node: { id: number; node_code: string; node_name: string } | null;
  operatorUserId: number;
  occurredAt: string;
}) {
  const { conn, container, waybill, movementType, node, operatorUserId, occurredAt } = params;
  const nextStatus = MOVEMENT_STATUS[movementType];
  if (nextStatus) {
    await txExec(conn, 'UPDATE container SET status = ?, updated_at = ? WHERE id = ?', [
      nextStatus,
      occurredAt,
      container.id,
    ]);
  }
  const eventType = MOVEMENT_EVENT[movementType];
  if (waybill && eventType) {
    await appendWaybillEvent(conn, {
      waybillId: Number(waybill.id),
      eventType,
      nodeId: node?.id ?? null,
      operatorUserId,
      description: `${WAYBILL_EVENT_LABELS[eventType]}（箱 ${container.container_no}）`,
      payload: { containerId: Number(container.id), containerNo: container.container_no, movementType },
      occurredAt,
    });
  }
  if (waybill && node) {
    const containerNos = [container.container_no];
    if (movementType === 'GATE_IN') {
      await insertIntegrationMessage(
        conn,
        portCodecoMessage({
          waybillId: Number(waybill.id),
          waybillNo: waybill.waybill_no,
          portCode: node.node_code,
          moveType: 'GATE_IN',
          containerNos,
          eventTime: occurredAt,
        }),
      );
    } else if (movementType === 'LOAD') {
      await insertIntegrationMessage(
        conn,
        portCoarriMessage({
          waybillId: Number(waybill.id),
          waybillNo: waybill.waybill_no,
          portCode: node.node_code,
          moveType: 'LOAD',
          containerNos,
          eventTime: occurredAt,
        }),
      );
    } else if (movementType === 'DISCHARGE') {
      await insertIntegrationMessage(
        conn,
        portCodecoMessage({
          waybillId: Number(waybill.id),
          waybillNo: waybill.waybill_no,
          portCode: node.node_code,
          moveType: 'DISCHARGE',
          containerNos,
          eventTime: occurredAt,
        }),
      );
    }
  }
}

export interface ReleaseContainerInput {
  waybillId?: number | null;
  nodeId?: number | null;
}

/** POST /api/containers/:id/release：放箱 EMPTY → RELEASED */
export async function releaseContainer(id: number, input: ReleaseContainerInput, user: AuthUser, ip: string | null) {
  const released = await withTransaction(async (conn) => {
    const container = await loadContainerForUpdate(conn, id);
    if (!['EMPTY', 'RELEASED'].includes(container.status)) {
      throw new ApiError(
        40901,
        `当前箱状态（${CONTAINER_STATUS_LABELS[container.status]}）不允许放箱`,
      );
    }
    const waybill = await loadWaybillLite(conn, input.waybillId ?? container.current_waybill_id);
    const node = await assertNode(conn, input.nodeId);
    const at = formatDateTime(nowDate());
    await txExec(
      conn,
      `UPDATE container SET status = 'RELEASED', current_node_id = COALESCE(?, current_node_id),
         current_waybill_id = COALESCE(?, current_waybill_id), updated_at = ? WHERE id = ?`,
      [node?.id ?? null, waybill ? Number(waybill.id) : null, at, id],
    );
    if (waybill) {
      await txExec(
        conn,
        'INSERT IGNORE INTO waybill_container (waybill_id, container_id, seal_no, loaded_at) VALUES (?, ?, ?, NULL)',
        [waybill.id, id, container.seal_no],
      );
    }
    const movement = await appendContainerMovement(conn, {
      containerId: id,
      waybillId: waybill ? Number(waybill.id) : null,
      movementType: 'RELEASE',
      nodeId: node?.id ?? null,
      operatorUserId: user.uid,
      conditionText: container.condition_text,
      remark: '放箱',
      occurredAt: at,
    });
    if (waybill) {
      await appendWaybillEvent(conn, {
        waybillId: Number(waybill.id),
        eventType: 'RELEASE',
        nodeId: node?.id ?? null,
        operatorUserId: user.uid,
        description: `放箱（箱 ${container.container_no}）`,
        payload: { containerId: id, containerNo: container.container_no, movementType: 'RELEASE' },
        occurredAt: at,
      });
    }
    await writeAudit(conn, {
      user,
      action: 'CONTAINER_RELEASE',
      actionLabel: '放箱',
      module: 'container',
      targetType: 'CONTAINER',
      targetId: id,
      detail: { containerNo: container.container_no, waybillId: waybill?.id ?? null, nodeId: node?.id ?? null },
      ip,
    });
    return { movementId: movement.id, occurredAt: at };
  });
  // 事务提交后再读详情，避免读到旧快照
  const detail = await getContainerDetail(id);
  return {
    ...detail,
    movement: { id: released.movementId, movementType: 'RELEASE', occurredAt: released.occurredAt },
  };
}

export interface MovementInput {
  movementType: ContainerMovementType;
  nodeId?: number | null;
  conditionText?: string | null;
  photoUrl?: string | null;
  remark?: string | null;
}

/** POST /api/containers/:id/movements：登记箱动态（含港口 EDI 联动） */
export async function addContainerMovement(id: number, input: MovementInput, user: AuthUser, ip: string | null) {
  if (!ALLOWED_MOVEMENTS.includes(input.movementType)) {
    throw new ApiError(40001, '不支持的箱动态类型');
  }
  return withTransaction(async (conn) => {
    const container = await loadContainerForUpdate(conn, id);
    const waybill = await loadWaybillLite(conn, container.current_waybill_id);
    const node = await assertNode(conn, input.nodeId);
    const at = formatDateTime(nowDate());
    await txExec(
      conn,
      `UPDATE container SET current_node_id = COALESCE(?, current_node_id),
         condition_text = COALESCE(?, condition_text), updated_at = ? WHERE id = ?`,
      [node?.id ?? null, input.conditionText ?? null, at, id],
    );
    const movement = await appendContainerMovement(conn, {
      containerId: id,
      waybillId: waybill ? Number(waybill.id) : null,
      movementType: input.movementType,
      nodeId: node?.id ?? null,
      operatorUserId: user.uid,
      conditionText: input.conditionText ?? null,
      photoUrl: input.photoUrl ?? null,
      remark: input.remark ?? CONTAINER_MOVEMENT_LABELS[input.movementType],
      occurredAt: at,
    });
    if (waybill) {
      if (input.movementType === 'LOAD') {
        await txExec(
          conn,
          'UPDATE waybill_container SET loaded_at = COALESCE(loaded_at, ?) WHERE waybill_id = ? AND container_id = ?',
          [at, waybill.id, id],
        );
      }
      if (input.movementType === 'DISCHARGE') {
        await txExec(
          conn,
          'UPDATE waybill_container SET discharged_at = ? WHERE waybill_id = ? AND container_id = ?',
          [at, waybill.id, id],
        );
      }
    }
    await applyMovementSideEffects({
      conn,
      container,
      waybill,
      movementType: input.movementType,
      node,
      operatorUserId: user.uid,
      occurredAt: at,
    });
    await writeAudit(conn, {
      user,
      action: 'CONTAINER_MOVEMENT',
      actionLabel: '箱动态登记',
      module: 'container',
      targetType: 'CONTAINER',
      targetId: id,
      detail: { containerNo: container.container_no, movementType: input.movementType, nodeId: node?.id ?? null },
      ip,
    });
    const updated = await txQueryOne<ContainerRow>(conn, 'SELECT * FROM container WHERE id = ?', [id]);
    return {
      container: updated
        ? {
            id: Number(updated.id),
            containerNo: updated.container_no,
            status: updated.status,
            statusLabel: CONTAINER_STATUS_LABELS[updated.status],
            currentNode: node?.node_name ?? null,
            conditionText: updated.condition_text,
          }
        : null,
      movement: { id: movement.id, movementType: input.movementType, occurredAt: at },
    };
  });
}

function daysBetween(startAt: string, endAt: string): number {
  const start = new Date(startAt.replace(' ', 'T')).getTime();
  const end = new Date(endAt.replace(' ', 'T')).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 1;
  return Math.max(1, Math.ceil((end - start) / DAY_MS));
}

export interface ReturnContainerInput {
  nodeId: number;
  conditionText?: string | null;
}

/** POST /api/containers/:id/return：还箱 + 堆存记录（费用 Mock） */
export async function returnContainer(id: number, input: ReturnContainerInput, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const container = await loadContainerForUpdate(conn, id);
    const waybill = await loadWaybillLite(conn, container.current_waybill_id);
    const node = await assertNode(conn, input.nodeId);
    if (!node) {
      throw new ApiError(40001, '还箱节点不能为空');
    }
    const at = formatDateTime(nowDate());
    await txExec(
      conn,
      `UPDATE container SET status = 'RETURNED', current_node_id = ?, updated_at = ?,
         condition_text = COALESCE(?, condition_text) WHERE id = ?`,
      [node.id, at, input.conditionText ?? null, id],
    );
    const movement = await appendContainerMovement(conn, {
      containerId: id,
      waybillId: waybill ? Number(waybill.id) : null,
      movementType: 'RETURN',
      nodeId: node.id,
      operatorUserId: user.uid,
      conditionText: input.conditionText ?? null,
      remark: '还箱',
      occurredAt: at,
    });

    // 堆存记录：优先关闭在堆记录，否则按最近到场时间补一条
    const openStorage = await txQueryOne<{ id: number; start_at: string }>(
      conn,
      'SELECT id, start_at FROM depot_storage WHERE container_id = ? AND end_at IS NULL ORDER BY id DESC LIMIT 1',
      [id],
    );
    let storageId: number;
    if (openStorage) {
      const days = daysBetween(openStorage.start_at, at);
      await txExec(
        conn,
        'UPDATE depot_storage SET end_at = ?, storage_days = ?, fee_amount = ?, status = ? WHERE id = ?',
        [at, days, round2(days * STORAGE_FEE_PER_DAY), 'RELEASED', openStorage.id],
      );
      storageId = Number(openStorage.id);
    } else {
      const lastArrival = await txQueryOne<{ occurred_at: string }>(
        conn,
        `SELECT occurred_at FROM container_movement WHERE container_id = ? AND movement_type IN ('ARRIVE', 'DISCHARGE', 'GATE_OUT')
          ORDER BY occurred_at DESC LIMIT 1`,
        [id],
      );
      const startAt = lastArrival?.occurred_at ?? formatDateTime(nowDate());
      const days = daysBetween(startAt, at);
      const inserted = await txExec(
        conn,
        `INSERT INTO depot_storage (container_id, node_id, waybill_id, start_at, end_at, storage_days, fee_amount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'RELEASED')`,
        [id, node.id, waybill?.id ?? null, startAt, at, days, round2(days * STORAGE_FEE_PER_DAY)],
      );
      storageId = Number(inserted.insertId);
    }

    if (waybill) {
      await appendWaybillEvent(conn, {
        waybillId: Number(waybill.id),
        eventType: 'HANDOVER',
        nodeId: node.id,
        operatorUserId: user.uid,
        description: `还箱交接（箱 ${container.container_no}）`,
        payload: { containerId: id, containerNo: container.container_no, nodeId: node.id, storageId },
        occurredAt: at,
      });
    }
    await writeAudit(conn, {
      user,
      action: 'CONTAINER_RETURN',
      actionLabel: '还箱',
      module: 'container',
      targetType: 'CONTAINER',
      targetId: id,
      detail: { containerNo: container.container_no, nodeId: node.id, storageId, waybillId: waybill?.id ?? null },
      ip,
    });
    const storage = await txQueryOne<{
      id: number;
      start_at: string;
      end_at: string | null;
      storage_days: number;
      fee_amount: number;
    }>(conn, 'SELECT id, start_at, end_at, storage_days, fee_amount FROM depot_storage WHERE id = ?', [storageId]);
    return {
      container: {
        id: Number(container.id),
        containerNo: container.container_no,
        status: 'RETURNED',
        statusLabel: CONTAINER_STATUS_LABELS.RETURNED,
        currentNode: node.node_name,
      },
      movement: { id: movement.id, movementType: 'RETURN', occurredAt: at },
      storage: storage
        ? {
            id: Number(storage.id),
            startAt: storage.start_at,
            endAt: storage.end_at,
            storageDays: Number(storage.storage_days),
            feeAmount: Number(storage.fee_amount),
          }
        : null,
    };
  });
}

export interface RepairContainerInput {
  nodeId?: number | null;
  fee: number;
  remark?: string | null;
}

/** POST /api/containers/:id/repair：箱损维修登记 */
export async function repairContainer(id: number, input: RepairContainerInput, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const container = await loadContainerForUpdate(conn, id);
    const waybill = await loadWaybillLite(conn, container.current_waybill_id);
    const node = await assertNode(conn, input.nodeId);
    const at = formatDateTime(nowDate());
    const fee = round2(Number(input.fee));
    if (!Number.isFinite(fee) || fee < 0) {
      throw new ApiError(40001, '维修费用不合法');
    }
    await txExec(
      conn,
      `UPDATE container SET status = 'IN_REPAIR', repair_fee = repair_fee + ?,
         condition_text = COALESCE(?, condition_text), current_node_id = COALESCE(?, current_node_id),
         updated_at = ? WHERE id = ?`,
      [fee, input.remark ?? null, node?.id ?? null, at, id],
    );
    const movement = await appendContainerMovement(conn, {
      containerId: id,
      waybillId: waybill ? Number(waybill.id) : null,
      movementType: 'REPAIR',
      nodeId: node?.id ?? null,
      operatorUserId: user.uid,
      conditionText: input.remark ?? null,
      remark: input.remark ?? '箱损维修',
      occurredAt: at,
    });
    await writeAudit(conn, {
      user,
      action: 'CONTAINER_REPAIR',
      actionLabel: '箱损维修',
      module: 'container',
      targetType: 'CONTAINER',
      targetId: id,
      detail: { containerNo: container.container_no, fee, remark: input.remark ?? null },
      ip,
    });
    const updated = await txQueryOne<ContainerRow>(conn, 'SELECT * FROM container WHERE id = ?', [id]);
    return {
      container: updated
        ? {
            id: Number(updated.id),
            containerNo: updated.container_no,
            status: updated.status,
            statusLabel: CONTAINER_STATUS_LABELS[updated.status],
            repairFee: Number(updated.repair_fee ?? 0),
            conditionText: updated.condition_text,
          }
        : null,
      movement: { id: movement.id, movementType: 'REPAIR', occurredAt: at },
    };
  });
}

/** GET /api/depots/storage?nodeId=&status= */
export async function listDepotStorage(query: Record<string, unknown>) {
  const pager = parsePage(query, 20, 100);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const nodeId = optionalString(query.nodeId);
  const status = optionalString(query.status);
  if (nodeId) {
    conditions.push('ds.node_id = ?');
    params.push(Number(nodeId));
  }
  if (status) {
    conditions.push('ds.status = ?');
    params.push(status);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM depot_storage ds ${where}`,
    params,
  );
  const rows = await queryRows<{
    id: number;
    container_id: number;
    container_no: string;
    node_id: number;
    node_name: string | null;
    start_at: string;
    end_at: string | null;
    storage_days: number;
    fee_amount: number;
    status: StorageStatus;
  }>(
    `SELECT ds.*, c.container_no, n.node_name
       FROM depot_storage ds
       JOIN container c ON c.id = ds.container_id
       LEFT JOIN port_station n ON n.id = ds.node_id
       ${where}
      ORDER BY ds.start_at DESC, ds.id DESC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  const list = rows.map((row) => ({
    id: Number(row.id),
    containerId: Number(row.container_id),
    containerNo: row.container_no,
    nodeId: Number(row.node_id),
    nodeName: row.node_name,
    startAt: row.start_at,
    endAt: row.end_at,
    storageDays: Number(row.storage_days),
    feeAmount: Number(row.fee_amount),
    status: row.status,
    statusLabel: STORAGE_STATUS_LABELS[row.status],
  }));
  return pageResult(list, Number(totalRow?.total ?? 0), pager);
}

export { txQueryRows };
