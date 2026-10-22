import { ORDER_STATUS_LABELS } from '../config/labels';
import { queryOne, queryRows } from '../db/pool';
import { ApiError } from '../errors';
import { ROAD_CARRIERS } from '../mock/carriers';
import type {
  AuthUser,
  BillRow,
  ContainerRow,
  OrderJoinedRow,
  OrderListRow,
  OrderStatus,
  SegmentRow,
  TrackPointRow,
  WaybillRow,
} from '../types';
import { dtoBillHeader, dtoContainer, dtoCurrentSegment, dtoOrderListItem, dtoSegment, dtoTrackPoint, dtoWaybill } from './mappers';

const ORDER_SELECT = `
  SELECT o.id, o.shipper_id, o.order_no, o.status, o.cargo_name, o.cargo_weight, o.container_type,
         o.container_count, o.origin, o.destination, o.required_pickup_date, o.remark,
         o.created_at, o.updated_at, u.display_name AS shipper_name
  FROM orders o
  JOIN user u ON u.id = o.shipper_id`;

const ORDER_LIST_SELECT = `
  SELECT o.id, o.order_no, o.status, o.cargo_name, o.cargo_weight, o.container_type, o.container_count,
         o.origin, o.destination, o.required_pickup_date, o.created_at, u.display_name AS shipper_name,
         w.id AS waybill_id, w.waybill_no, w.status AS waybill_status,
         b.id AS bill_id, b.bill_no
  FROM orders o
  JOIN user u ON u.id = o.shipper_id
  LEFT JOIN waybill w ON w.order_id = o.id
  LEFT JOIN bill b ON b.order_id = o.id`;

export interface OrderListFilters {
  status?: OrderStatus;
  keyword?: string;
}

/** GET /api/orders：按角色过滤 + 可选状态/关键字筛选 */
export async function listOrders(user: AuthUser, filters: OrderListFilters) {
  const conditions: string[] = [];
  const params: unknown[] = [];

  switch (user.role) {
    case 'SHIPPER':
      conditions.push('o.shipper_id = ?');
      params.push(user.uid);
      break;
    case 'MTO':
      break;
    case 'CARRIER':
      conditions.push(
        'EXISTS (SELECT 1 FROM waybill w2 JOIN waybill_segment s2 ON s2.waybill_id = w2.id WHERE w2.order_id = o.id AND s2.carrier_user_id = ?)',
      );
      params.push(user.uid);
      break;
    case 'TERMINAL':
      conditions.push("o.status IN ('DISPATCHED', 'IN_TRANSIT', 'ARRIVED')");
      break;
    case 'SETTLEMENT':
      conditions.push("o.status IN ('SIGNED', 'BILLED')");
      break;
    default:
      conditions.push('1 = 0');
      break;
  }

  if (filters.status) {
    conditions.push('o.status = ?');
    params.push(filters.status);
  }
  if (filters.keyword) {
    const keyword = `%${filters.keyword}%`;
    conditions.push('(o.order_no LIKE ? OR o.cargo_name LIKE ? OR o.origin LIKE ? OR o.destination LIKE ?)');
    params.push(keyword, keyword, keyword, keyword);
  }

  const sql = `${ORDER_LIST_SELECT}
    ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY o.created_at DESC, o.id DESC`;
  const rows = await queryRows<OrderListRow>(sql, params);
  if (rows.length === 0) {
    return [];
  }

  const orderIds = rows.map((row) => Number(row.id));
  const segmentRows = await queryRows<SegmentRow & { order_id: number }>(
    `SELECT s.*, w.order_id
       FROM waybill_segment s
       JOIN waybill w ON w.id = s.waybill_id
      WHERE w.order_id IN (?)
      ORDER BY s.seq ASC`,
    [orderIds],
  );

  const currentByOrder = new Map<number, SegmentRow>();
  for (const segment of segmentRows) {
    const orderId = Number(segment.order_id);
    if (!currentByOrder.has(orderId) && segment.status !== 'COMPLETED') {
      currentByOrder.set(orderId, segment);
    }
  }

  return rows.map((row) => {
    const orderId = Number(row.id);
    const current = currentByOrder.get(orderId);
    return dtoOrderListItem(row, current ? dtoCurrentSegment(current) : null);
  });
}

/** GET /api/orders/:id：聚合详情（订单 + 箱 + 运单 + 分段 + 最近 5 条轨迹 + 账单 + MTO 可见承运商） */
export async function getOrderDetail(orderId: number, user: AuthUser) {
  const orderRow = await queryOne<OrderJoinedRow>(`${ORDER_SELECT} WHERE o.id = ?`, [orderId]);
  if (!orderRow) {
    throw new ApiError(40401, '订单不存在');
  }

  const containers = await queryRows<ContainerRow>(
    'SELECT * FROM container WHERE order_id = ? ORDER BY id ASC',
    [orderId],
  );
  const waybillRow = await queryOne<WaybillRow>(
    'SELECT * FROM waybill WHERE order_id = ? ORDER BY id ASC LIMIT 1',
    [orderId],
  );

  let segments: SegmentRow[] = [];
  let latestTrack: TrackPointRow[] = [];
  if (waybillRow) {
    segments = await queryRows<SegmentRow>(
      'SELECT * FROM waybill_segment WHERE waybill_id = ? ORDER BY seq ASC',
      [waybillRow.id],
    );
    latestTrack = await queryRows<TrackPointRow>(
      'SELECT * FROM track_point WHERE waybill_id = ? ORDER BY occurred_at DESC, seq DESC LIMIT 5',
      [waybillRow.id],
    );
  }

  const billRow = await queryOne<BillRow>('SELECT * FROM bill WHERE order_id = ? LIMIT 1', [orderId]);

  return {
    order: {
      id: Number(orderRow.id),
      orderNo: orderRow.order_no,
      status: orderRow.status,
      statusLabel: ORDER_STATUS_LABELS[orderRow.status],
      shipper: { id: Number(orderRow.shipper_id), displayName: orderRow.shipper_name },
      cargoName: orderRow.cargo_name,
      cargoWeight: Number(orderRow.cargo_weight),
      containerType: orderRow.container_type,
      containerCount: Number(orderRow.container_count),
      origin: orderRow.origin,
      destination: orderRow.destination,
      requiredPickupDate: orderRow.required_pickup_date,
      remark: orderRow.remark,
      createdAt: orderRow.created_at,
      updatedAt: orderRow.updated_at,
    },
    containers: containers.map(dtoContainer),
    waybill: waybillRow ? dtoWaybill(waybillRow) : null,
    segments: segments.map(dtoSegment),
    latestTrack: latestTrack.map(dtoTrackPoint),
    bill: billRow ? dtoBillHeader(billRow) : null,
    availableRoadCarriers: user.role === 'MTO' ? ROAD_CARRIERS.map((carrier) => ({ ...carrier })) : [],
  };
}
