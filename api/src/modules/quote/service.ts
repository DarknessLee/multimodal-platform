// 询价/报价：创建（价格引擎自动算价）、列表、详情、发送、接受转订单
import {
  CALC_METHOD_LABELS,
  MODE_LABELS,
  ORDER_TYPE_LABELS,
  QUOTE_STATUS_LABELS,
} from '../../config/labels';
import { queryOne, queryRows, txExec, txQueryOne, txQueryRows, withTransaction } from '../../db/pool';
import { ApiError } from '../../errors';
import { writeAudit } from '../../middleware/audit';
import { emitEvent } from '../../platform/eventBus';
import { calculatePrice, type PriceItemResult } from '../../platform/priceEngine';
import { nextDocNo } from '../../platform/sequence';
import type {
  AuthUser,
  ContainerTypeRow,
  CustomerRow,
  GoodsCatalogRow,
  OrderType,
  QuoteItemRow,
  QuoteRow,
  RouteTemplateRow,
} from '../../types';
import { addDaysDate, formatDateTime, nowDate, todayCompact, todayDateString } from '../../utils/datetime';
import { containerNoForOrder, sealNoForOrder } from '../../utils/containerNo';
import { parseJson, round2 } from '../../utils/json';
import { optionalString, pageResult, parsePage } from '../shared/pagination';

export interface CreateQuoteInput {
  customerId: number;
  orderType?: OrderType;
  routeTemplateId: number;
  containerTypeCode: string;
  containerCount: number;
  goodsCode?: string | null;
  cargoName: string;
  cargoWeight: number;
  requiredDate: string;
  remark?: string | null;
}

interface QuoteJoinedRow extends QuoteRow {
  customer_name: string;
  customer_short_name: string;
  container_type_code: string;
  route_name: string;
  route_modes: unknown;
  route_distance_km: number;
  route_transit_days: number;
}

const QUOTE_JOINED_SELECT = `
  SELECT q.*, c.name AS customer_name, c.short_name AS customer_short_name,
         ct.code AS container_type_code, rt.route_name, rt.modes AS route_modes,
         rt.distance_km AS route_distance_km, rt.transit_days AS route_transit_days
    FROM quote q
    JOIN customer c ON c.id = q.customer_id
    JOIN container_type ct ON ct.id = q.container_type_id
    JOIN route_template rt ON rt.id = q.route_template_id`;

function orderTypeFromModes(modes: string[]): OrderType {
  const hasRoad = modes.includes('ROAD');
  const hasSea = modes.includes('SEA');
  const hasRail = modes.includes('RAIL');
  if (hasRoad && hasSea && hasRail) return 'ROAD_RAIL_SEA';
  if (hasRoad) return 'ROAD_RAIL';
  return 'RAIL_SEA';
}

function quoteItemsDto(items: QuoteItemRow[]) {
  return items.map((item) => {
    const calculation = parseJson<Record<string, unknown>>(item.calculation, {});
    const calcMethod = typeof calculation.method === 'string' ? calculation.method : 'PER_CONTAINER';
    return {
      seq: Number(item.seq),
      mode: item.mode,
      modeLabel: MODE_LABELS[item.mode],
      chargeType: item.charge_type,
      description: item.description,
      quantity: Number(item.quantity),
      unit: item.unit,
      unitPrice: Number(item.unit_price),
      amount: Number(item.amount),
      costAmount: Number(item.cost_amount),
      calcMethod,
      calcMethodLabel: CALC_METHOD_LABELS[calcMethod as keyof typeof CALC_METHOD_LABELS] ?? calcMethod,
    };
  });
}

export async function getQuoteDetail(id: number, user?: AuthUser) {
  const quote = await queryOne<QuoteJoinedRow>(`${QUOTE_JOINED_SELECT} WHERE q.id = ?`, [id]);
  if (!quote) {
    throw new ApiError(40401, '报价单不存在');
  }
  if (user?.role === 'SHIPPER' && Number(quote.customer_id) !== Number(user.customer_id)) {
    throw new ApiError(40301, '无权查看该报价单');
  }
  const items = await queryRows<QuoteItemRow>('SELECT * FROM quote_item WHERE quote_id = ? ORDER BY seq ASC', [id]);
  const totalAmount = Number(quote.total_amount);
  const costAmount = Number(quote.cost_amount);
  return {
    id: Number(quote.id),
    quoteNo: quote.quote_no,
    customer: { id: Number(quote.customer_id), name: quote.customer_name },
    orderType: quote.order_type,
    orderTypeLabel: ORDER_TYPE_LABELS[quote.order_type],
    route: {
      id: Number(quote.route_template_id),
      routeName: quote.route_name,
      modes: parseJson<string[]>(quote.route_modes, []),
      transitDays: Number(quote.route_transit_days),
      distanceKm: Number(quote.route_distance_km),
    },
    containerType: quote.container_type_code,
    containerCount: Number(quote.container_count),
    goodsCode: quote.goods_code,
    cargoName: quote.cargo_name,
    cargoWeight: Number(quote.cargo_weight),
    requiredDate: quote.required_date,
    transitDays: Number(quote.transit_days),
    validUntil: quote.valid_until,
    totalAmount,
    costAmount,
    marginRate: totalAmount > 0 ? round2(((totalAmount - costAmount) / totalAmount) * 100) : 0,
    status: quote.status,
    statusLabel: QUOTE_STATUS_LABELS[quote.status],
    remark: quote.remark,
    items: quoteItemsDto(items),
    createdBy: Number(quote.created_by),
    createdAt: quote.created_at,
    sentAt: quote.sent_at,
    acceptedAt: quote.accepted_at,
    orderId: quote.order_id === null ? null : Number(quote.order_id),
  };
}

/** POST /quotes：创建询价并按价格规则自动算价 */
export async function createQuote(input: CreateQuoteInput, user: AuthUser, ip: string | null) {
  const customer = await queryOne<CustomerRow>('SELECT * FROM customer WHERE id = ?', [input.customerId]);
  if (!customer || customer.status !== 'ACTIVE') {
    throw new ApiError(40401, '客户不存在或已停用');
  }
  if (user.role === 'SHIPPER' && Number(customer.id) !== Number(user.customer_id)) {
    throw new ApiError(40301, '只能为本人所属客户创建询价');
  }
  const route = await queryOne<RouteTemplateRow>('SELECT * FROM route_template WHERE id = ?', [
    input.routeTemplateId,
  ]);
  if (!route || route.status !== 'ACTIVE') {
    throw new ApiError(40401, '线路模板不存在或已停用');
  }
  const containerType = await queryOne<ContainerTypeRow>('SELECT * FROM container_type WHERE code = ?', [
    input.containerTypeCode,
  ]);
  if (!containerType) {
    throw new ApiError(40401, '箱型不存在');
  }
  let goods: GoodsCatalogRow | null = null;
  if (input.goodsCode) {
    goods = await queryOne<GoodsCatalogRow>('SELECT * FROM goods_catalog WHERE goods_code = ?', [
      input.goodsCode,
    ]);
    if (!goods) {
      throw new ApiError(40401, '货物不存在');
    }
  }
  const requiredDate = input.requiredDate;
  if (requiredDate < todayDateString()) {
    throw new ApiError(42201, '要求发运日期不能早于今天');
  }

  const quoteId = await withTransaction(async (conn) => {
    const price = await calculatePrice(conn, {
      route,
      containerType,
      containerCount: input.containerCount,
      cargoWeight: input.cargoWeight,
      customerId: Number(customer.id),
    });
    const quoteNo = await nextDocNo(conn, {
      table: 'quote',
      column: 'quote_no',
      prefix: `BJ${todayCompact()}`,
      width: 5,
    });
    const modes = parseJson<string[]>(route.modes, []);
    const orderType = orderTypeFromModes(modes);
    const validUntil = addDaysDate(7);
    const at = formatDateTime(nowDate());
    const result = await txExec(
      conn,
      `INSERT INTO quote (quote_no, customer_id, order_type, route_template_id, origin_node_id, destination_node_id,
         container_type_id, container_count, goods_code, cargo_name, cargo_weight, required_date, transit_days, valid_until,
         total_amount, cost_amount, currency, status, created_by, remark, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CNY', 'DRAFT', ?, ?, ?, ?)`,
      [
        quoteNo,
        Number(customer.id),
        orderType,
        Number(route.id),
        Number(route.origin_node_id),
        Number(route.destination_node_id),
        Number(containerType.id),
        input.containerCount,
        goods?.goods_code ?? input.goodsCode ?? null,
        input.cargoName,
        input.cargoWeight,
        requiredDate,
        Number(route.transit_days),
        validUntil,
        price.totalAmount,
        price.costAmount,
        user.uid,
        input.remark ?? null,
        at,
        at,
      ],
    );
    const newQuoteId = Number(result.insertId);
    for (const item of price.items) {
      await txExec(
        conn,
        `INSERT INTO quote_item (quote_id, seq, mode, charge_type, description, quantity, unit, unit_price, amount, cost_amount, calculation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newQuoteId,
          item.seq,
          item.mode,
          item.chargeType,
          item.description,
          item.quantity,
          item.unit,
          item.unitPrice,
          item.amount,
          item.costAmount,
          JSON.stringify(item.calculation),
        ],
      );
    }
    await writeAudit(conn, {
      user,
      action: 'QUOTE_CREATE',
      actionLabel: '创建询价',
      module: 'quote',
      targetType: 'QUOTE',
      targetId: newQuoteId,
      detail: { quoteNo, totalAmount: price.totalAmount, items: price.items.length },
      ip,
    });
    return newQuoteId;
  });

  return getQuoteDetail(quoteId, user);
}

/** GET /quotes：分页列表（按角色过滤） */
export async function listQuotes(query: Record<string, unknown>, user: AuthUser) {
  const pager = parsePage(query, 10);
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (user.role === 'SHIPPER') {
    conditions.push('q.customer_id = ?');
    params.push(user.customer_id ?? -1);
  }
  const status = optionalString(query.status);
  const keyword = optionalString(query.keyword);
  if (status) {
    conditions.push('q.status = ?');
    params.push(status);
  }
  if (keyword) {
    conditions.push('(q.quote_no LIKE ? OR q.cargo_name LIKE ? OR c.name LIKE ?)');
    const like = `%${keyword}%`;
    params.push(like, like, like);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM quote q JOIN customer c ON c.id = q.customer_id ${where}`,
    params,
  );
  const rows = await queryRows<QuoteJoinedRow>(
    `${QUOTE_JOINED_SELECT} ${where} ORDER BY q.created_at DESC, q.id DESC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  const list = rows.map((quote) => ({
    id: Number(quote.id),
    quoteNo: quote.quote_no,
    customer: { id: Number(quote.customer_id), name: quote.customer_name },
    orderType: quote.order_type,
    orderTypeLabel: ORDER_TYPE_LABELS[quote.order_type],
    routeName: quote.route_name,
    containerType: quote.container_type_code,
    containerCount: Number(quote.container_count),
    cargoName: quote.cargo_name,
    totalAmount: Number(quote.total_amount),
    status: quote.status,
    statusLabel: QUOTE_STATUS_LABELS[quote.status],
    validUntil: quote.valid_until,
    createdAt: quote.created_at,
  }));
  return pageResult(list, Number(totalRow?.total ?? 0), pager);
}

/** POST /quotes/:id/send：DRAFT → SENT（通知客户） */
export async function sendQuote(id: number, user: AuthUser, ip: string | null) {
  await withTransaction(async (conn) => {
    const quote = await txQueryOne<QuoteRow>(conn, 'SELECT * FROM quote WHERE id = ? FOR UPDATE', [id]);
    if (!quote) {
      throw new ApiError(40401, '报价单不存在');
    }
    if (quote.status === 'SENT') {
      throw new ApiError(40902, '报价单已发送，请勿重复操作');
    }
    if (quote.status !== 'DRAFT') {
      throw new ApiError(40901, `当前报价单状态（${QUOTE_STATUS_LABELS[quote.status]}）不允许发送`);
    }
    const customer = await txQueryOne<CustomerRow>(conn, 'SELECT * FROM customer WHERE id = ?', [
      quote.customer_id,
    ]);
    const at = formatDateTime(nowDate());
    await txExec(conn, 'UPDATE quote SET status = ?, sent_at = ?, updated_at = ? WHERE id = ?', [
      'SENT',
      at,
      at,
      id,
    ]);
    await emitEvent(conn, {
      eventType: 'quote.sent',
      aggregateType: 'QUOTE',
      aggregateId: Number(quote.id),
      payload: {
        quoteId: Number(quote.id),
        quoteNo: quote.quote_no,
        customerId: Number(quote.customer_id),
        customerName: customer?.name ?? '',
        totalAmount: Number(quote.total_amount),
        sentAt: at,
      },
    });
    await writeAudit(conn, {
      user,
      action: 'QUOTE_SEND',
      actionLabel: '发送报价',
      module: 'quote',
      targetType: 'QUOTE',
      targetId: Number(quote.id),
      detail: { quoteNo: quote.quote_no, totalAmount: Number(quote.total_amount) },
      ip,
    });
  });
  // 事务提交后再读取详情，避免读到旧快照
  return getQuoteDetail(id, user);
}

interface AcceptQuoteOptions {
  contractId?: number | null;
}

/** 报价接受转订单（事务内公共逻辑；POST /quotes/:id/accept 与 POST /orders?quoteId 复用） */
export async function createOrderFromQuote(
  conn: import('mysql2/promise').PoolConnection,
  quote: QuoteRow,
  contractId: number | null,
  user: AuthUser,
): Promise<{ orderId: number; orderNo: string }> {
  const route = await txQueryOne<RouteTemplateRow>(conn, 'SELECT * FROM route_template WHERE id = ?', [
    quote.route_template_id,
  ]);
  if (!route) {
    throw new ApiError(40401, '线路模板不存在');
  }
  const originNode = await txQueryOne<{ id: number; node_name: string }>(
    conn,
    'SELECT id, node_name FROM port_station WHERE id = ?',
    [quote.origin_node_id],
  );
  const destinationNode = await txQueryOne<{ id: number; node_name: string }>(
    conn,
    'SELECT id, node_name FROM port_station WHERE id = ?',
    [quote.destination_node_id],
  );
  const containerType = await txQueryOne<ContainerTypeRow>(conn, 'SELECT * FROM container_type WHERE id = ?', [
    quote.container_type_id,
  ]);
  if (!containerType) {
    throw new ApiError(40401, '箱型不存在');
  }
  const customer = await txQueryOne<CustomerRow>(conn, 'SELECT * FROM customer WHERE id = ?', [
    quote.customer_id,
  ]);
  let goods: GoodsCatalogRow | null = null;
  if (quote.goods_code) {
    goods = await txQueryOne<GoodsCatalogRow>(conn, 'SELECT * FROM goods_catalog WHERE goods_code = ?', [
      quote.goods_code,
    ]);
  }

  const orderNo = await nextDocNo(conn, {
    table: 'orders',
    column: 'order_no',
    prefix: `MO${todayCompact()}`,
    width: 4,
  });
  const status = contractId ? 'CONTRACTED' : 'CONFIRMED';
  const at = formatDateTime(nowDate());
  const result = await txExec(
    conn,
    `INSERT INTO orders (order_no, shipper_id, status, cargo_name, cargo_weight, container_type, container_count,
       origin, destination, required_pickup_date, remark, order_type, customer_id, consignee_customer_id,
       notify_customer_id, contract_id, quote_id, route_template_id, priority, source, total_amount, currency,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, 'NORMAL', 'QUOTE', ?, 'CNY', ?, ?)`,
    [
      orderNo,
      user.uid,
      status,
      quote.cargo_name,
      Number(quote.cargo_weight),
      containerType.code,
      Number(quote.container_count),
      originNode?.node_name ?? '',
      destinationNode?.node_name ?? '',
      quote.required_date,
      quote.remark,
      quote.order_type,
      Number(quote.customer_id),
      contractId,
      Number(quote.id),
      Number(quote.route_template_id),
      Number(quote.total_amount),
      at,
      at,
    ],
  );
  const orderId = Number(result.insertId);

  // 订单货物行（报价是单货物，复制一行）
  await txExec(
    conn,
    `INSERT INTO order_cargo (order_id, seq, goods_code, goods_name, quantity, unit, weight_t, volume_cbm,
       container_type_id, container_count, dangerous_flag, packaging)
     VALUES (?, 1, ?, ?, ?, '箱', ?, ?, ?, ?, ?, ?)`,
    [
      orderId,
      quote.goods_code,
      quote.cargo_name,
      Number(quote.container_count),
      Number(quote.cargo_weight),
      round2(Number(containerType.inner_volume_cbm) * Number(quote.container_count)),
      Number(containerType.id),
      Number(quote.container_count),
      goods && Boolean(Number(goods.dangerous_flag)) ? 1 : 0,
      goods?.packaging ?? null,
    ],
  );

  // 箱档案
  for (let index = 1; index <= Number(quote.container_count); index += 1) {
    await txExec(
      conn,
      `INSERT INTO container (order_id, container_no, type, seal_no, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'EMPTY', ?, ?)`,
      [orderId, containerNoForOrder(orderId, index), containerType.code, sealNoForOrder(orderId, index), at, at],
    );
  }

  await txExec(conn, 'UPDATE quote SET status = ?, accepted_at = ?, order_id = ?, updated_at = ? WHERE id = ?', [
    'ACCEPTED',
    at,
    orderId,
    at,
    quote.id,
  ]);

  await emitEvent(conn, {
    eventType: 'quote.accepted',
    aggregateType: 'QUOTE',
    aggregateId: Number(quote.id),
    payload: {
      quoteId: Number(quote.id),
      quoteNo: quote.quote_no,
      orderId,
      orderNo,
      customerId: Number(quote.customer_id),
      customerName: customer?.name ?? '',
      containerType: containerType.code,
      containerCount: Number(quote.container_count),
      acceptedAt: at,
    },
  });

  return { orderId, orderNo };
}

/** POST /quotes/:id/accept：SENT → ACCEPTED，生成订单 */
export async function acceptQuote(id: number, options: AcceptQuoteOptions, user: AuthUser, ip: string | null) {
  const contractId = options.contractId ?? null;
  return withTransaction(async (conn) => {
    const quote = await txQueryOne<QuoteRow>(conn, 'SELECT * FROM quote WHERE id = ? FOR UPDATE', [id]);
    if (!quote) {
      throw new ApiError(40401, '报价单不存在');
    }
    if (user.role === 'SHIPPER' && Number(quote.customer_id) !== Number(user.customer_id)) {
      throw new ApiError(40301, '只能接受本人所属客户的报价');
    }
    if (quote.status === 'ACCEPTED') {
      throw new ApiError(40902, '报价单已接受，请勿重复操作');
    }
    if (quote.status !== 'SENT') {
      throw new ApiError(40901, `当前报价单状态（${QUOTE_STATUS_LABELS[quote.status]}）不允许接受`);
    }
    let contractRow: { id: number; status: string; customer_id: number; contract_no: string } | null = null;
    if (contractId) {
      contractRow = await txQueryOne<{ id: number; status: string; customer_id: number; contract_no: string }>(
        conn,
        'SELECT id, status, customer_id, contract_no FROM contract WHERE id = ?',
        [contractId],
      );
      if (!contractRow) {
        throw new ApiError(40401, '合同不存在');
      }
      if (Number(contractRow.customer_id) !== Number(quote.customer_id)) {
        throw new ApiError(42201, '合同客户与报价客户不一致');
      }
      if (contractRow.status !== 'SIGNED') {
        throw new ApiError(42201, '合同未签署，不能关联报价');
      }
    }
    const created = await createOrderFromQuote(conn, quote, contractId, user);
    await writeAudit(conn, {
      user,
      action: 'QUOTE_ACCEPT',
      actionLabel: '接受报价',
      module: 'quote',
      targetType: 'QUOTE',
      targetId: Number(quote.id),
      detail: {
        quoteNo: quote.quote_no,
        orderId: created.orderId,
        orderNo: created.orderNo,
        contractId,
      },
      ip,
    });
    return created;
  });
}
