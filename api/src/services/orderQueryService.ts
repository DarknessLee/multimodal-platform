import {
  CONTRACT_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  QUOTE_STATUS_LABELS,
  SOURCE_LABELS,
  PRIORITY_LABELS,
} from '../config/labels';
import { queryOne, queryRows } from '../db/pool';
import { ApiError } from '../errors';
import { ROAD_CARRIERS } from '../mock/carriers';
import { orderScopeForRole } from '../modules/shared/scope';
import type {
  AuthUser,
  BillRow,
  ContainerRow,
  ContractRow,
  CustomerRow,
  OrderCargoRow,
  OrderJoinedRow,
  OrderListRow,
  OrderSource,
  OrderStatus,
  OrderType,
  QuoteRow,
  RouteTemplateRow,
  SegmentRow,
  TrackPointRow,
  WaybillRow,
} from '../types';
import { parseJson } from '../utils/json';
import {
  dtoBillHeader,
  dtoContainer,
  dtoCurrentSegment,
  dtoOrderListItem,
  dtoSegment,
  dtoTrackPoint,
  dtoWaybill,
} from './mappers';

const ORDER_SELECT = `
  SELECT o.*, u.display_name AS shipper_name,
         c.name AS customer_name, c.credit_level AS customer_credit_level,
         cc.name AS consignee_name, cc.contact_name AS consignee_contact_name,
         ct.contract_no, q.quote_no, q.total_amount AS quote_total_amount,
         rt.route_name, rt.modes AS route_modes
    FROM orders o
    JOIN user u ON u.id = o.shipper_id
    LEFT JOIN customer c ON c.id = o.customer_id
    LEFT JOIN customer cc ON cc.id = o.consignee_customer_id
    LEFT JOIN contract ct ON ct.id = o.contract_id
    LEFT JOIN quote q ON q.id = o.quote_id
    LEFT JOIN route_template rt ON rt.id = o.route_template_id`;

const ORDER_LIST_SELECT = `
  SELECT o.id, o.order_no, o.status, o.cargo_name, o.cargo_weight, o.container_type, o.container_count,
         o.origin, o.destination, o.required_pickup_date, o.created_at, o.order_type, o.source, o.priority,
         o.total_amount, o.currency, u.display_name AS shipper_name,
         c.name AS customer_name, ct.contract_no, q.quote_no,
         w.id AS waybill_id, w.waybill_no, w.status AS waybill_status,
         b.id AS bill_id, b.bill_no
    FROM orders o
    JOIN user u ON u.id = o.shipper_id
    LEFT JOIN customer c ON c.id = o.customer_id
    LEFT JOIN contract ct ON ct.id = o.contract_id
    LEFT JOIN quote q ON q.id = o.quote_id
    LEFT JOIN waybill w ON w.order_id = o.id
    LEFT JOIN bill b ON b.order_id = o.id`;

export interface OrderListFilters {
  status?: OrderStatus;
  keyword?: string;
  orderType?: OrderType;
  source?: OrderSource;
  customerId?: number;
}

/** GET /api/orders：按角色过滤 + 状态/关键字/订单类型/来源/客户筛选（v0 数组返回保持） */
export async function listOrders(user: AuthUser, filters: OrderListFilters) {
  const scope = orderScopeForRole(user);
  const conditions: string[] = [scope.where];
  const params: unknown[] = [...scope.params];

  if (filters.status) {
    conditions.push('o.status = ?');
    params.push(filters.status);
  }
  if (filters.orderType) {
    conditions.push('o.order_type = ?');
    params.push(filters.orderType);
  }
  if (filters.source) {
    conditions.push('o.source = ?');
    params.push(filters.source);
  }
  if (filters.customerId) {
    conditions.push('o.customer_id = ?');
    params.push(filters.customerId);
  }
  if (filters.keyword) {
    const keyword = `%${filters.keyword}%`;
    conditions.push('(o.order_no LIKE ? OR o.cargo_name LIKE ? OR o.origin LIKE ? OR o.destination LIKE ?)');
    params.push(keyword, keyword, keyword, keyword);
  }

  const sql = `${ORDER_LIST_SELECT}
    WHERE ${conditions.join(' AND ')}
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

/** GET /api/orders/:id：v0 聚合结构 + Stage 1 新增字段（cargoLines/contract/quote/route/customer） */
export async function getOrderDetail(orderId: number, user: AuthUser) {
  const orderRow = await queryOne<OrderJoinedRow>(`${ORDER_SELECT} WHERE o.id = ?`, [orderId]);
  if (!orderRow) {
    throw new ApiError(40401, '订单不存在');
  }

  const containers = await queryRows<ContainerRow>(
    'SELECT * FROM container WHERE order_id = ? ORDER BY id ASC',
    [orderId],
  );
  const cargoLines = await queryRows<OrderCargoRow & { container_type_code: string | null }>(
    `SELECT oc.*, ctt.code AS container_type_code
       FROM order_cargo oc
       LEFT JOIN container_type ctt ON ctt.id = oc.container_type_id
      WHERE oc.order_id = ?
      ORDER BY oc.seq ASC`,
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
  const contractRow = orderRow.contract_id
    ? await queryOne<ContractRow>('SELECT * FROM contract WHERE id = ?', [orderRow.contract_id])
    : null;
  const quoteRow = orderRow.quote_id
    ? await queryOne<QuoteRow>('SELECT * FROM quote WHERE id = ?', [orderRow.quote_id])
    : null;
  const routeRow = orderRow.route_template_id
    ? await queryOne<RouteTemplateRow>('SELECT * FROM route_template WHERE id = ?', [orderRow.route_template_id])
    : null;
  const consignee = orderRow.consignee_customer_id
    ? await queryOne<CustomerRow>('SELECT * FROM customer WHERE id = ?', [orderRow.consignee_customer_id])
    : null;

  const canDispatch = ['MTO', 'ADMIN'].includes(user.role);

  return {
    order: {
      // v0 字段
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
      // Stage 1 新增字段
      orderType: orderRow.order_type,
      orderTypeLabel: ORDER_TYPE_LABELS[orderRow.order_type],
      source: orderRow.source,
      sourceLabel: SOURCE_LABELS[orderRow.source],
      priority: orderRow.priority,
      priorityLabel: PRIORITY_LABELS[orderRow.priority],
      totalAmount: Number(orderRow.total_amount),
      currency: orderRow.currency,
      customer: orderRow.customer_id
        ? {
            id: Number(orderRow.customer_id),
            name: orderRow.customer_name,
            creditLevel: orderRow.customer_credit_level,
          }
        : null,
      consignee: consignee
        ? { id: Number(consignee.id), name: consignee.name, contactName: consignee.contact_name }
        : null,
    },
    containers: containers.map(dtoContainer),
    cargoLines: cargoLines.map((line) => ({
      seq: Number(line.seq),
      goodsCode: line.goods_code,
      goodsName: line.goods_name,
      quantity: Number(line.quantity),
      unit: line.unit,
      weightT: Number(line.weight_t),
      volumeCbm: line.volume_cbm === null ? null : Number(line.volume_cbm),
      containerType: line.container_type_code ?? null,
      containerTypeId: line.container_type_id === null ? null : Number(line.container_type_id),
      containerCount: Number(line.container_count),
      dangerousFlag: Boolean(Number(line.dangerous_flag)),
      packaging: line.packaging,
      remark: line.remark,
    })),
    waybill: waybillRow ? dtoWaybill(waybillRow) : null,
    segments: segments.map(dtoSegment),
    latestTrack: latestTrack.map(dtoTrackPoint),
    bill: billRow ? dtoBillHeader(billRow) : null,
    availableRoadCarriers: canDispatch ? ROAD_CARRIERS.map((carrier) => ({ ...carrier })) : [],
    // Stage 1 关联对象
    contract: contractRow
      ? {
          id: Number(contractRow.id),
          contractNo: contractRow.contract_no,
          status: contractRow.status,
          statusLabel: CONTRACT_STATUS_LABELS[contractRow.status],
          title: contractRow.title,
        }
      : null,
    quote: quoteRow
      ? {
          id: Number(quoteRow.id),
          quoteNo: quoteRow.quote_no,
          totalAmount: Number(quoteRow.total_amount),
          status: quoteRow.status,
          statusLabel: QUOTE_STATUS_LABELS[quoteRow.status],
        }
      : null,
    route: routeRow
      ? {
          id: Number(routeRow.id),
          routeCode: routeRow.route_code,
          routeName: routeRow.route_name,
          modes: parseJson<string[]>(routeRow.modes, []),
          transitDays: Number(routeRow.transit_days),
          distanceKm: Number(routeRow.distance_km),
        }
      : null,
  };
}
