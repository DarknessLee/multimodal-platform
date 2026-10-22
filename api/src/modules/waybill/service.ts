// 运单中心（一单制）：主运单/分段运单列表、聚合详情、事件链、单证
import {
  CONTAINER_STATUS_LABELS,
  WAYBILL_EVENT_LABELS,
  WAYBILL_STATUS_LABELS,
  WAYBILL_TYPE_LABELS,
  MODE_LABELS,
  segmentStatusLabel,
} from '../../config/labels';
import { queryOne, queryRows } from '../../db/pool';
import { ApiError } from '../../errors';
import { documentDto, documentsForWaybills } from '../documents/service';
import { notarizeSummaryFor } from '../../platform/notary';
import type {
  AuthUser,
  ContainerRow,
  ContainerStatus,
  DocumentRow,
  SegmentRow,
  SegmentStatus,
  WaybillEventRow,
  WaybillEventType,
  WaybillRow,
  WaybillStatus,
  WaybillType,
} from '../../types';
import { parseJson } from '../../utils/json';
import { optionalString, pageResult, parsePage } from '../shared/pagination';

interface WaybillJoinedRow extends WaybillRow {
  order_no: string;
  order_status: string;
  cargo_name: string;
  customer_name: string | null;
  segment_count: number;
  document_count: number;
  notarized_count: number;
  linked_container_count: number;
  container_count: number;
}

interface Scope {
  where: string;
  params: unknown[];
}

function scopeForRole(user: AuthUser): Scope {
  switch (user.role) {
    case 'SHIPPER':
      return { where: '(o.customer_id = ? OR o.shipper_id = ?)', params: [user.customer_id ?? -1, user.uid] };
    case 'CARRIER':
      return {
        where: `((w.waybill_type = 'MASTER' AND EXISTS (SELECT 1 FROM waybill_segment s WHERE s.waybill_id = w.id AND s.carrier_user_id = ?))
                OR (w.waybill_type = 'SEGMENT' AND w.carrier_partner_id = ?))`,
        params: [user.uid, user.partner_id ?? -1],
      };
    case 'RAIL_CARRIER':
      return {
        where: `((w.waybill_type = 'MASTER' AND EXISTS (SELECT 1 FROM waybill_segment s WHERE s.waybill_id = w.id AND s.mode = 'RAIL'))
                OR (w.waybill_type = 'SEGMENT' AND w.mode = 'RAIL'))`,
        params: [],
      };
    case 'SEA_CARRIER':
      return {
        where: `((w.waybill_type = 'MASTER' AND EXISTS (SELECT 1 FROM waybill_segment s WHERE s.waybill_id = w.id AND s.mode = 'SEA'))
                OR (w.waybill_type = 'SEGMENT' AND w.mode = 'SEA'))`,
        params: [],
      };
    case 'TERMINAL':
      return { where: "w.waybill_type = 'MASTER' AND w.status IN ('IN_TRANSIT', 'ARRIVED')", params: [] };
    case 'SETTLEMENT':
      return {
        where: "w.waybill_type = 'MASTER' AND (w.status = 'SIGNED' OR o.status = 'BILLED')",
        params: [],
      };
    case 'MTO':
    case 'ADMIN':
    case 'FORWARDER':
    default:
      return { where: '1 = 1', params: [] };
  }
}

const WAYBILL_LIST_SELECT = `
  SELECT w.*, o.order_no, o.status AS order_status, o.cargo_name, o.container_count,
         c.name AS customer_name,
         (SELECT COUNT(*) FROM waybill_segment s WHERE s.waybill_id = w.id) AS segment_count,
         (SELECT COUNT(*) FROM waybill_container wc WHERE wc.waybill_id = w.id) AS linked_container_count,
         (SELECT COUNT(*) FROM document d WHERE d.biz_type = 'WAYBILL' AND d.biz_id IN
            (SELECT id FROM waybill w2 WHERE w2.id = w.id OR w2.parent_waybill_id = w.id)) AS document_count,
         (SELECT COUNT(*) FROM notarize_record nr WHERE nr.biz_type = 'WAYBILL' AND nr.biz_id IN
            (SELECT id FROM waybill w3 WHERE w3.id = w.id OR w3.parent_waybill_id = w.id)) AS notarized_count
    FROM waybill w
    JOIN orders o ON o.id = w.order_id
    LEFT JOIN customer c ON c.id = o.customer_id`;

export function waybillTypeLabel(type: WaybillType): string {
  return WAYBILL_TYPE_LABELS[type] ?? type;
}

function waybillListDto(row: WaybillJoinedRow) {
  const linked = Number(row.linked_container_count ?? 0);
  return {
    id: Number(row.id),
    waybillNo: row.waybill_no,
    waybillType: row.waybill_type,
    waybillTypeLabel: waybillTypeLabel(row.waybill_type),
    parentWaybillId: row.parent_waybill_id === null ? null : Number(row.parent_waybill_id),
    mode: row.mode,
    modeLabel: row.mode ? MODE_LABELS[row.mode] : null,
    orderId: Number(row.order_id),
    orderNo: row.order_no,
    customerName: row.customer_name,
    cargoName: row.cargo_name,
    containerCount: linked > 0 ? linked : Number(row.container_count ?? 0),
    segmentCount: Number(row.segment_count ?? 0),
    status: row.status,
    statusLabel: WAYBILL_STATUS_LABELS[row.status],
    issuedAt: row.issued_at,
    documentCount: Number(row.document_count ?? 0),
    notarizedCount: Number(row.notarized_count ?? 0),
  };
}

/** GET /api/waybills：一单制运单列表（主运单/分段运单，按角色过滤） */
export async function listWaybills(user: AuthUser, query: Record<string, unknown>) {
  const pager = parsePage(query, 10);
  const scope = scopeForRole(user);
  const conditions: string[] = [scope.where];
  const params: unknown[] = [...scope.params];
  const type = optionalString(query.type);
  const status = optionalString(query.status);
  const keyword = optionalString(query.keyword);
  if (type) {
    conditions.push('w.waybill_type = ?');
    params.push(type);
  }
  if (status) {
    conditions.push('w.status = ?');
    params.push(status);
  }
  if (keyword) {
    conditions.push('(w.waybill_no LIKE ? OR o.order_no LIKE ? OR o.cargo_name LIKE ?)');
    const like = `%${keyword}%`;
    params.push(like, like, like);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM waybill w JOIN orders o ON o.id = w.order_id LEFT JOIN customer c ON c.id = o.customer_id ${where}`,
    params,
  );
  const rows = await queryRows<WaybillJoinedRow>(
    `${WAYBILL_LIST_SELECT} ${where} ORDER BY w.created_at DESC, w.id DESC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  return pageResult(rows.map(waybillListDto), Number(totalRow?.total ?? 0), pager);
}

function segmentSummaryDto(segment: SegmentRow) {
  return {
    id: Number(segment.id),
    seq: Number(segment.seq),
    mode: segment.mode,
    modeLabel: MODE_LABELS[segment.mode],
    carrierName: segment.carrier_name,
    startNode: segment.start_node,
    endNode: segment.end_node,
    status: segment.status,
    statusLabel: segmentStatusLabel(segment.mode, segment.status as SegmentStatus),
  };
}

function segmentWaybillDto(row: WaybillRow, carrierName: string) {
  return {
    id: Number(row.id),
    waybillNo: row.waybill_no,
    mode: row.mode,
    modeLabel: row.mode ? MODE_LABELS[row.mode] : null,
    carrierName,
    status: row.status,
    statusLabel: WAYBILL_STATUS_LABELS[row.status],
    issuedAt: row.issued_at,
  };
}

function eventDto(
  row: WaybillEventRow,
  nodeName: string | null,
  operatorName: string | null,
) {
  return {
    id: Number(row.id),
    waybillId: Number(row.waybill_id),
    segmentId: row.segment_id === null ? null : Number(row.segment_id),
    eventType: row.event_type,
    eventTypeLabel: WAYBILL_EVENT_LABELS[row.event_type as WaybillEventType],
    occurredAt: row.occurred_at,
    nodeId: row.node_id === null ? null : Number(row.node_id),
    nodeName,
    operator: operatorName,
    description: row.description,
    payload: parseJson<unknown>(row.payload, null),
    prevHash: row.prev_hash,
    hash: row.hash,
    txId: row.tx_id,
    blockHeight: row.block_height === null ? null : Number(row.block_height),
  };
}

const EVENT_SELECT = `
  SELECT e.*, n.node_name, u.display_name AS operator_name
    FROM waybill_event e
    LEFT JOIN port_station n ON n.id = e.node_id
    LEFT JOIN user u ON u.id = e.operator_user_id`;

async function loadEvents(waybillId: number, limit: number, offset: number, desc = true) {
  const totalRow = await queryOne<{ total: number }>(
    'SELECT COUNT(*) AS total FROM waybill_event WHERE waybill_id = ?',
    [waybillId],
  );
  const rows = await queryRows<WaybillEventRow & { node_name: string | null; operator_name: string | null }>(
    `${EVENT_SELECT} WHERE e.waybill_id = ? ORDER BY e.occurred_at ${desc ? 'DESC' : 'ASC'}, e.id ${desc ? 'DESC' : 'ASC'} LIMIT ? OFFSET ?`,
    [waybillId, limit, offset],
  );
  return {
    total: Number(totalRow?.total ?? 0),
    list: rows.map((row) => eventDto(row, row.node_name, row.operator_name)),
  };
}

interface ContainerLinkRow {
  id: number;
  container_no: string;
  type: string;
  status: ContainerStatus;
  condition_text: string | null;
  seal_no: string | null;
  current_node_id: number | null;
  node_name: string | null;
  repair_fee: number;
}

function containerLinkDto(row: ContainerLinkRow) {
  return {
    id: Number(row.id),
    containerNo: row.container_no,
    type: row.type,
    status: row.status,
    statusLabel: CONTAINER_STATUS_LABELS[row.status],
    currentNode: row.node_name,
    currentNodeId: row.current_node_id === null ? null : Number(row.current_node_id),
    sealNo: row.seal_no,
    conditionText: row.condition_text,
    repairFee: Number(row.repair_fee ?? 0),
  };
}

async function loadFamilyContainersPlaceholder(): Promise<void> {
  // 保留空实现：容器查询在 getWaybillDetail 内直接完成
}

/** GET /api/waybills/:id：一单制聚合详情 */
export async function getWaybillDetail(id: number) {
  const current = await queryOne<WaybillRow>('SELECT * FROM waybill WHERE id = ?', [id]);
  if (!current) {
    throw new ApiError(40401, '运单不存在');
  }
  const masterId = current.waybill_type === 'SEGMENT' && current.parent_waybill_id
    ? Number(current.parent_waybill_id)
    : Number(current.id);
  const master =
    masterId === Number(current.id)
      ? current
      : await queryOne<WaybillRow>('SELECT * FROM waybill WHERE id = ?', [masterId]);
  if (!master) {
    throw new ApiError(40401, '运单不存在');
  }
  const children = await queryRows<WaybillRow>(
    "SELECT * FROM waybill WHERE parent_waybill_id = ? AND waybill_type = 'SEGMENT' ORDER BY id ASC",
    [masterId],
  );
  const familyIds = [masterId, ...children.map((child) => Number(child.id))];

  const order = await queryOne<{ id: number; order_no: string; cargo_name: string; customer_id: number | null }>(
    'SELECT id, order_no, cargo_name, customer_id FROM orders WHERE id = ?',
    [master.order_id],
  );
  const customer = order?.customer_id
    ? await queryOne<{ name: string }>('SELECT name FROM customer WHERE id = ?', [order.customer_id])
    : null;

  const segments = await queryRows<SegmentRow>(
    'SELECT * FROM waybill_segment WHERE waybill_id = ? ORDER BY seq ASC',
    [masterId],
  );
  const segmentByMode = new Map(segments.map((segment) => [segment.mode, segment]));

  const containers = await queryRows<ContainerLinkRow>(
    `SELECT c.id, c.container_no, c.type, c.status, c.condition_text, wc.seal_no,
            c.current_node_id, n.node_name, c.repair_fee
       FROM waybill_container wc
       JOIN container c ON c.id = wc.container_id
       LEFT JOIN port_station n ON n.id = c.current_node_id
      WHERE wc.waybill_id = ?
      ORDER BY c.id ASC`,
    [masterId],
  );

  const eventPage = await loadEvents(Number(current.id), 30, 0, false);
  const docs = await documentsForWaybills(current.waybill_type === 'MASTER' ? familyIds : [Number(current.id)]);
  const notarize = await notarizeSummaryFor(
    'WAYBILL',
    current.waybill_type === 'MASTER' ? familyIds : [Number(current.id)],
  );

  return {
    waybill: {
      id: Number(current.id),
      waybillNo: current.waybill_no,
      waybillType: current.waybill_type,
      waybillTypeLabel: waybillTypeLabel(current.waybill_type),
      parentWaybillId: current.parent_waybill_id === null ? null : Number(current.parent_waybill_id),
      mode: current.mode,
      modeLabel: current.mode ? MODE_LABELS[current.mode] : null,
      status: current.status,
      statusLabel: WAYBILL_STATUS_LABELS[current.status],
      orderId: Number(current.order_id),
      signerName: current.signer_name,
      signedAt: current.signed_at,
      issuedAt: current.issued_at,
      documentNo: current.document_no,
      notarizeTxId: current.notarize_tx_id ?? notarize.lastTxId,
    },
    order: order
      ? {
          id: Number(order.id),
          orderNo: order.order_no,
          customerName: customer?.name ?? null,
          cargoName: order.cargo_name,
        }
      : null,
    segments: segments.map(segmentSummaryDto),
    segmentWaybills: children.map((child) =>
      segmentWaybillDto(child, segmentByMode.get(child.mode ?? 'ROAD')?.carrier_name ?? ''),
    ),
    containers: containers.map(containerLinkDto),
    events: eventPage.list,
    documents: docs.map((doc: DocumentRow) => documentDto(doc)),
    notarize,
  };
}

/** GET /api/waybills/:id/events */
export async function listWaybillEvents(id: number, query: Record<string, unknown>) {
  const waybill = await queryOne<{ id: number }>('SELECT id FROM waybill WHERE id = ?', [id]);
  if (!waybill) {
    throw new ApiError(40401, '运单不存在');
  }
  const pager = parsePage(query, 20, 100);
  const page = await loadEvents(id, pager.pageSize, pager.offset, true);
  return pageResult(page.list, page.total, pager);
}

/** GET /api/waybills/:id/documents（主运单 + 分段运单关联单证） */
export async function listWaybillDocuments(id: number) {
  const current = await queryOne<WaybillRow>('SELECT * FROM waybill WHERE id = ?', [id]);
  if (!current) {
    throw new ApiError(40401, '运单不存在');
  }
  const familyIds = [Number(current.id)];
  if (current.waybill_type === 'MASTER') {
    const children = await queryRows<{ id: number }>(
      'SELECT id FROM waybill WHERE parent_waybill_id = ?',
      [id],
    );
    familyIds.push(...children.map((child) => Number(child.id)));
  } else if (current.parent_waybill_id) {
    familyIds.push(Number(current.parent_waybill_id));
  }
  const docs = await documentsForWaybills(familyIds);
  return docs.map((doc) => documentDto(doc));
}

export function waybillStatusLabel(status: WaybillStatus): string {
  return WAYBILL_STATUS_LABELS[status];
}
