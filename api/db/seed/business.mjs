// Stage 1 业务数据种子：合同/报价/订单/履约/账单/集成报文/审计/通知/事件
import { addDays, containerNo, dateStr, dateTimeStr, docNo, round2 } from './lib.mjs';

const QUOTE_DEFS = [
  { customer: 0, route: 0, ct: '40HQ', count: 2, goods: 0, status: 'DRAFT', cargo: '光伏组件', weight: 22.5 },
  { customer: 1, route: 0, ct: '40HQ', count: 1, goods: 1, status: 'DRAFT', cargo: '汽车零部件', weight: 18.2 },
  { customer: 2, route: 2, ct: '40HQ', count: 2, goods: 2, status: 'DRAFT', cargo: '家用电器', weight: 15.8 },
  { customer: 3, route: 1, ct: '20GP', count: 3, goods: 3, status: 'DRAFT', cargo: '精细化工品', weight: 20.0 },
  { customer: 4, route: 0, ct: '40HQ', count: 2, goods: 4, status: 'SENT', cargo: '粮油食品', weight: 24.0 },
  { customer: 5, route: 1, ct: '20GP', count: 4, goods: 5, status: 'SENT', cargo: '特种钢材', weight: 26.0 },
  { customer: 6, route: 0, ct: '40RF', count: 1, goods: 6, status: 'SENT', cargo: '医药制剂', weight: 12.0 },
  { customer: 7, route: 2, ct: '40HQ', count: 2, goods: 7, status: 'SENT', cargo: '电子元器件', weight: 10.0 },
  { customer: 0, route: 0, ct: '40HQ', count: 2, goods: 0, status: 'ACCEPTED', cargo: '光伏组件', weight: 22.5 },
  { customer: 1, route: 0, ct: '40HQ', count: 1, goods: 1, status: 'ACCEPTED', cargo: '汽车零部件', weight: 18.2 },
  { customer: 2, route: 0, ct: '20GP', count: 3, goods: 2, status: 'ACCEPTED', cargo: '家用电器', weight: 15.8 },
  { customer: 8, route: 2, ct: '40HQ', count: 1, goods: 8, status: 'EXPIRED', cargo: '纺织面料', weight: 16.0 },
];

const QUICK_ORDERS = [
  ['BILLED', '40HQ', 2, 0], ['BILLED', '40HQ', 1, 1], ['BILLED', '20GP', 3, 2], ['BILLED', '40HQ', 2, 3],
  ['BILLED', '40RF', 1, 6], ['BILLED', '40HQ', 1, 7], ['SIGNED', '40HQ', 2, 9], ['SIGNED', '20GP', 1, 10],
  ['ARRIVED', '40HQ', 2, 11], ['IN_TRANSIT', '40HQ', 1, 2], ['IN_TRANSIT', '20GP', 2, 4], ['IN_TRANSIT', '40HQ', 2, 5],
  ['DISPATCHED', '40HQ', 1, 8], ['DISPATCHED', '20GP', 2, 12], ['CONFIRMED', '40HQ', 1, 13], ['CREATED', '40HQ', 2, 14], ['CREATED', '20GP', 1, 3],
];

const BASE_PRICES = {
  ROAD: { '20GP': 900, '40HQ': 1400, '40RF': 1800 },
  SEA: { '20GP': 4200, '40HQ': 5200, '40RF': 7200 },
  RAIL: { '20GP': 6800, '40HQ': 8600, '40RF': 10800 },
};

const MODE_LABELS = { ROAD: '公路', SEA: '海运', RAIL: '铁路', PORT: '港杂' };
const MODE_CARRIER = {
  ROAD: { code: 'AJ-001', name: '安捷卡车队', start: '上海嘉定工厂', end: '上海洋山港' },
  SEA: { code: 'COSCO-EDI', name: '中远海运集运', start: '上海洋山港', end: '武汉阳逻港' },
  RAIL: { code: 'CR-95306', name: '中铁集装箱', start: '武汉吴家山站', end: '成都城厢站' },
};
const TRACK_NODES = {
  ROAD: [
    { name: '上海嘉定工厂', lng: 121.265, lat: 31.375 },
    { name: '外环高速', lng: 121.45, lat: 31.32 },
    { name: '东海大桥', lng: 121.9, lat: 30.78 },
    { name: '上海洋山港', lng: 122.045, lat: 30.625 },
  ],
  SEA: [
    { name: '上海洋山港', lng: 122.045, lat: 30.625 },
    { name: '长江口', lng: 121.5, lat: 31.0 },
    { name: '武汉阳逻港', lng: 114.55, lat: 30.7 },
  ],
  RAIL: [
    { name: '武汉吴家山站', lng: 114.13, lat: 30.61 },
    { name: '襄阳', lng: 112.14, lat: 32.04 },
    { name: '安康', lng: 109.03, lat: 32.69 },
    { name: '成都城厢站', lng: 104.3, lat: 30.87 },
  ],
};

async function insert(conn, sql, params) {
  const [result] = await conn.execute(sql, params);
  return result.insertId;
}

function pickRule(ref, mode, routeId, ctId, customerId) {
  const candidates = ref.priceRules.filter(
    (r) => r.mode === mode && (!r.routeId || r.routeId === routeId) && r.containerTypeId === ctId && (!r.chargeType || r.chargeType === 'BASE'),
  );
  const preferred = candidates.find((r) => r.customerId === customerId);
  return preferred ?? candidates.sort((a, b) => (b.priority ?? 100) - (a.priority ?? 100))[0] ?? null;
}

function buildItems(ref, route, ctCode, count, customerId) {
  const ct = ref.ctBy[ctCode];
  const items = [];
  let total = 0;
  let cost = 0;
  let seq = 0;
  for (const mode of route.modes) {
    const rule = pickRule(ref, mode, route.id, ct.id, customerId);
    const unitPrice = rule?.unitPrice ?? BASE_PRICES[mode]?.[ctCode] ?? 0;
    const amount = round2(unitPrice * count);
    seq += 1;
    items.push({
      seq, mode, chargeType: 'BASE',
      description: `${route.name.split('（')[0]} ${MODE_LABELS[mode]}段`,
      quantity: count, unit: '箱', unitPrice, amount,
      costAmount: round2(amount * 0.86),
      calculation: { method: 'PER_CONTAINER', containerCount: count, unitPrice },
    });
    total += amount;
    cost += round2(amount * 0.86);
  }
  const portRule = ref.priceRules.find((r) => r.mode === 'PORT' && r.containerTypeId === ct.id);
  if (portRule) {
    seq += 1;
    const quantity = count * 2;
    const amount = round2(portRule.unitPrice * quantity);
    items.push({
      seq, mode: 'PORT', chargeType: 'BASE', description: '港口装卸/堆存/理货',
      quantity, unit: '箱次', unitPrice: portRule.unitPrice, amount,
      costAmount: round2(amount * 0.9),
      calculation: { method: 'PER_CONTAINER', quantity, unitPrice: portRule.unitPrice },
    });
    total += amount;
    cost += round2(amount * 0.9);
  }
  for (const surcharge of ref.priceRules.filter((r) => r.chargeType === 'SURCHARGE' && r.containerTypeId === ct.id)) {
    seq += 1;
    const amount = round2(surcharge.unitPrice * count);
    items.push({
      seq, mode: surcharge.mode, chargeType: 'SURCHARGE', description: `${MODE_LABELS[surcharge.mode]}附加费`,
      quantity: count, unit: '箱', unitPrice: surcharge.unitPrice, amount,
      costAmount: amount,
      calculation: { method: surcharge.calcMethod, containerCount: count, unitPrice: surcharge.unitPrice },
    });
    total += amount;
    cost += amount;
  }
  return { items, total: round2(total), cost: round2(cost) };
}

function trackSeeds(mode, state) {
  const nodes = TRACK_NODES[mode];
  const source = mode === 'ROAD' ? 'CARRIER_REPORT' : mode === 'SEA' ? 'TERMINAL_REPORT' : 'TERMINAL_REPORT';
  if (state === 'PENDING') return [];
  if (state === 'IN_TRANSIT') {
    return [
      { nodeName: nodes[0].name, lng: nodes[0].lng, lat: nodes[0].lat, source, description: mode === 'ROAD' ? '司机已提货，车辆出发' : '已确认进场' },
      { nodeName: nodes[1]?.name ?? nodes[0].name, lng: nodes[1]?.lng ?? nodes[0].lng, lat: nodes[1]?.lat ?? nodes[0].lat, source: 'MOCK_GPS', description: '在途位置' },
    ];
  }
  return [
    { nodeName: nodes[0].name, lng: nodes[0].lng, lat: nodes[0].lat, source, description: mode === 'ROAD' ? '司机已接单' : '已确认进场' },
    { nodeName: nodes[1]?.name ?? nodes[0].name, lng: nodes[1]?.lng ?? nodes[0].lng, lat: nodes[1]?.lat ?? nodes[0].lat, source: 'MOCK_GPS', description: '在途位置' },
    { nodeName: nodes[nodes.length - 1].name, lng: nodes[nodes.length - 1].lng, lat: nodes[nodes.length - 1].lat, source: 'MOCK_EDI', description: `到达${nodes[nodes.length - 1].name}` },
  ];
}

export async function seedBusiness(conn, ref) {
  const today = new Date();
  const seq = { quote: 0, order: 0, waybill: 0, bill: 0, msg: 0, invoice: 0 };
  const quotes = [];
  const nodeById = Object.fromEntries(ref.nodes.map((n) => [n.id, n]));
  const ctById = Object.fromEntries(ref.containerTypes.map((c) => [c.id, c]));
  const signedContracts = ref.contracts.filter((c) => c.status === 'SIGNED');

  // ── 报价单 ────────────────────────────────────────────────────────────────
  for (let i = 0; i < QUOTE_DEFS.length; i += 1) {
    const def = QUOTE_DEFS[i];
    const route = ref.routes[def.route];
    const ct = ref.ctBy[def.ct];
    const { items, total, cost } = buildItems(ref, route, def.ct, def.count, ref.customers[def.customer].id);
    const createdDate = addDays(today, -18 + i);
    const quoteNo = docNo('BJ', createdDate, ++seq.quote, 5);
    const sentAt = def.status === 'DRAFT' ? null : dateTimeStr(addDays(createdDate, 1));
    const acceptedAt = def.status === 'ACCEPTED' ? dateTimeStr(addDays(createdDate, 2)) : null;
    const quoteId = await insert(conn,
      `INSERT INTO quote (quote_no, customer_id, order_type, route_template_id, origin_node_id, destination_node_id,
         container_type_id, container_count, goods_code, cargo_name, cargo_weight, required_date, transit_days, valid_until,
         total_amount, cost_amount, status, created_by, sent_at, accepted_at, remark, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [quoteNo, ref.customers[def.customer].id,
        route.modes.includes('ROAD') && route.modes.includes('RAIL') && route.modes.includes('SEA') ? 'ROAD_RAIL_SEA'
          : route.modes.includes('ROAD') ? 'ROAD_RAIL' : 'RAIL_SEA',
        route.id, route.originId, route.destId, ct.id, def.count,
        ref.goods[def.goods].code, def.cargo, def.weight,
        dateStr(addDays(createdDate, 4)), route.transitDays, dateStr(addDays(createdDate, 7)),
        total, cost, def.status, ref.userBy.mto01.id, sentAt, acceptedAt,
        i === 0 ? '客户询价，待 MTO 报价' : null,
        dateTimeStr(createdDate), dateTimeStr(addDays(createdDate, 1))]);
    for (const item of items) {
      await insert(conn,
        `INSERT INTO quote_item (quote_id, seq, mode, charge_type, description, quantity, unit, unit_price, amount, cost_amount, calculation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [quoteId, item.seq, item.mode, item.chargeType, item.description, item.quantity, item.unit,
          item.unitPrice, item.amount, item.costAmount, JSON.stringify(item.calculation)]);
    }
    quotes.push({ id: quoteId, customerIdx: def.customer, routeIdx: def.route, ctCode: def.ct, count: def.count, goodsIdx: def.goods,
      cargo: def.cargo, weight: def.weight, status: def.status, total, cost, createdDate, requiredDate: addDays(createdDate, 4) });
  }

  // ── 订单：报价转单 + 快速单 ───────────────────────────────────────────────
  const orders = [];
  async function createOrder(params) {
    const { customerIdx, routeIdx, ctCode, count, goodsIdx, cargo, weight, status, source, quoteId,
      contractId, baseDate, requiredDate, totalAmount, priority } = params;
    const route = ref.routes[routeIdx];
    const origin = nodeById[route.originId];
    const destination = nodeById[route.destId];
    const orderNo = docNo('MO', baseDate, ++seq.order, 5);
    const orderId = await insert(conn,
      `INSERT INTO orders (order_no, shipper_id, status, cargo_name, cargo_weight, container_type, container_count,
         origin, destination, required_pickup_date, remark, order_type, customer_id, consignee_customer_id, notify_customer_id,
         contract_id, quote_id, route_template_id, priority, source, total_amount, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderNo, ref.userBy.shipper01.id, status, cargo, weight, ctCode, count,
        origin.name, destination.name, dateStr(requiredDate), `Stage 1 种子订单（${source === 'QUOTE' ? '报价转单' : '快速下单'}）`,
        route.modes.includes('SEA') && route.modes.includes('RAIL') && route.modes.includes('ROAD') ? 'ROAD_RAIL_SEA'
          : route.modes.includes('ROAD') ? 'ROAD_RAIL' : 'RAIL_SEA',
        ref.customers[customerIdx].id, ref.customers[(customerIdx + 1) % ref.customers.length].id, null,
        contractId, quoteId, route.id, priority ?? 'NORMAL', source, totalAmount,
        dateTimeStr(baseDate), dateTimeStr(addDays(baseDate, 1))]);
    const ct = ref.ctBy[ctCode];
    await insert(conn,
      `INSERT INTO order_cargo (order_id, seq, goods_code, goods_name, quantity, unit, weight_t, volume_cbm,
         container_type_id, container_count, dangerous_flag, packaging)
       VALUES (?, 1, ?, ?, ?, '箱', ?, ?, ?, ?, ?, ?)`,
      [orderId, ref.goods[goodsIdx].code, cargo, count, weight, round2(ct.volume * count),
        ct.id, count, ref.goods[goodsIdx].dangerous ? 1 : 0, ref.goods[goodsIdx].packaging]);
    const order = { id: orderId, orderNo, customerIdx, routeIdx, ctCode, count, goodsIdx, cargo, weight,
      status, source, quoteId, contractId, baseDate, requiredDate, totalAmount, route };
    orders.push(order);
    return order;
  }

  const acceptedQuotes = quotes.filter((q) => q.status === 'ACCEPTED');
  const quoteOrderStates = ['CONTRACTED', 'CONFIRMED', 'DISPATCHED'];
  for (let i = 0; i < acceptedQuotes.length; i += 1) {
    const quote = acceptedQuotes[i];
    const baseDate = addDays(today, -3 + i);
    const contract = signedContracts.find((c) => c.customerId === ref.customers[quote.customerIdx].id);
    const order = await createOrder({
      customerIdx: quote.customerIdx, routeIdx: quote.routeIdx, ctCode: quote.ctCode, count: quote.count,
      goodsIdx: quote.goodsIdx, cargo: quote.cargo, weight: quote.weight, status: quoteOrderStates[i],
      source: 'QUOTE', quoteId: quote.id, contractId: contract?.id ?? null, baseDate,
      requiredDate: quote.requiredDate, totalAmount: quote.total,
    });
    quote.orderId = order.id;
    await conn.execute('UPDATE quote SET order_id = ? WHERE id = ?', [order.id, quote.id]);
  }

  for (let i = 0; i < QUICK_ORDERS.length; i += 1) {
    const [status, ctCode, count, rawCustomerIdx] = QUICK_ORDERS[i];
    const customerIdx = rawCustomerIdx % ref.customers.length;
    const goodsIdx = i % ref.goods.length;
    const baseDate = addDays(today, -14 + i);
    const ct = ref.ctBy[ctCode];
    const estimate = round2((BASE_PRICES.ROAD[ctCode] + BASE_PRICES.SEA[ctCode] + BASE_PRICES.RAIL[ctCode]) * count + 380 * count * 2);
    const contract = signedContracts.find((c) => c.customerId === ref.customers[customerIdx].id);
    await createOrder({
      customerIdx, routeIdx: 0, ctCode, count, goodsIdx, cargo: ref.goods[goodsIdx].name,
      weight: round2(ref.goods[goodsIdx].weight * count), status, source: 'QUICK', quoteId: null,
      contractId: i % 3 === 0 ? contract?.id ?? null : null, baseDate,
      requiredDate: addDays(baseDate, 4), totalAmount: estimate, priority: i % 7 === 0 ? 'URGENT' : 'NORMAL',
    });
  }

  // ── 履约：运单 / 分段 / 轨迹 / 账单 ──────────────────────────────────────
  const stateByStatus = {
    DISPATCHED: 'PENDING', IN_TRANSIT: 'IN_TRANSIT', ARRIVED: 'ARRIVED',
    SIGNED: 'SIGNED', BILLED: 'SIGNED',
  };
  const waybills = [];
  const bills = [];
  let containerSeq = 700000;

  for (const order of orders) {
    const waybillState = stateByStatus[order.status];
    if (!waybillState) continue;
    const baseDate = order.baseDate;
    const waybillNo = docNo('WB', baseDate, ++seq.waybill, 5);
    const waybillStatus = waybillState === 'PENDING' ? 'PENDING' : waybillState === 'IN_TRANSIT' ? 'IN_TRANSIT' : waybillState === 'ARRIVED' ? 'ARRIVED' : 'SIGNED';
    const signedAt = waybillState === 'SIGNED' ? dateTimeStr(addDays(baseDate, 6)) : null;
    const waybillId = await insert(conn,
      `INSERT INTO waybill (waybill_no, order_id, status, signer_name, signed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [waybillNo, order.id, waybillStatus, waybillState === 'SIGNED' ? '李经理' : null, signedAt,
        dateTimeStr(baseDate), dateTimeStr(addDays(baseDate, 6))]);

    const segStatuses = waybillState === 'PENDING' ? ['PENDING', 'PENDING', 'PENDING']
      : waybillState === 'IN_TRANSIT' ? ['COMPLETED', 'IN_TRANSIT', 'PENDING']
        : ['COMPLETED', 'COMPLETED', 'COMPLETED'];
    const segIds = [];
    const segCosts = [];
    let trackSeq = 0;
    const modes = ['ROAD', 'SEA', 'RAIL'];
    for (let s = 0; s < 3; s += 1) {
      const mode = modes[s];
      const carrier = MODE_CARRIER[mode];
      const rule = pickRule(ref, mode, order.route.id, ref.ctBy[order.ctCode].id, ref.customers[order.customerIdx].id);
      const cost = round2((rule?.unitPrice ?? BASE_PRICES[mode]?.[order.ctCode] ?? 0) * order.count);
      segCosts.push(cost);
      const status = segStatuses[s];
      const plannedStart = addDays(baseDate, 1 + s);
      const plannedEnd = addDays(baseDate, 1 + s + (mode === 'ROAD' ? 0 : 1));
      const actualStart = status === 'PENDING' ? null : dateTimeStr(addDays(baseDate, 1 + s));
      const actualEnd = status === 'COMPLETED' ? dateTimeStr(addDays(baseDate, 1 + s)) : null;
      const segId = await insert(conn,
        `INSERT INTO waybill_segment (waybill_id, seq, mode, carrier_code, carrier_name, carrier_user_id,
           start_node, end_node, planned_start, planned_end, actual_start, actual_end, accepted_at, status, cost_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [waybillId, s + 1, mode, carrier.code, carrier.name,
          mode === 'ROAD' ? ref.userBy.carrier01.id : null,
          carrier.start, carrier.end, dateTimeStr(plannedStart), dateTimeStr(plannedEnd),
          actualStart, actualEnd, mode === 'ROAD' && status !== 'PENDING' ? dateTimeStr(addDays(baseDate, 1)) : null,
          status, cost]);
      segIds.push(segId);
      for (const point of trackSeeds(mode, status)) {
        trackSeq += 1;
        await insert(conn,
          `INSERT INTO track_point (waybill_id, segment_id, seq, node_name, lng, lat, occurred_at, source, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [waybillId, segId, trackSeq, point.nodeName, point.lng, point.lat,
            dateTimeStr(addDays(baseDate, 1 + s)), point.source, point.description]);
      }
    }
    if (waybillState === 'SIGNED') {
      trackSeq += 1;
      await insert(conn,
        `INSERT INTO track_point (waybill_id, segment_id, seq, node_name, lng, lat, occurred_at, source, description)
         VALUES (?, NULL, ?, '成都城厢站', 104.3, 30.87, ?, 'MTO', '货主签收（李经理）')`,
        [waybillId, trackSeq, signedAt]);
      await conn.execute('UPDATE orders SET status = ? WHERE id = ?', [order.status === 'BILLED' ? 'BILLED' : 'SIGNED', order.id]);
    }
    if (waybillState === 'ARRIVED') {
      await conn.execute('UPDATE orders SET status = ? WHERE id = ?', ['ARRIVED', order.id]);
    }

    for (let c = 0; c < order.count; c += 1) {
      containerSeq += 1;
      await insert(conn,
        `INSERT INTO container (order_id, container_no, type, seal_no, status, condition_text)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [order.id, containerNo('MSCU', containerSeq), order.ctCode, `SEAL${String(order.id).padStart(4, '0')}${c + 1}`,
          waybillState === 'SIGNED' ? 'DELIVERED' : waybillState === 'ARRIVED' ? 'ARRIVED' : waybillState === 'IN_TRANSIT' ? 'IN_TRANSIT' : 'EMPTY',
          waybillState === 'SIGNED' ? '箱况良好，无破损' : null]);
    }

    if (order.status === 'BILLED') {
      const total = round2(segCosts.reduce((a, b) => a + b, 0));
      const issuedAt = dateTimeStr(addDays(baseDate, 7));
      const breakdown = segIds.map((id, idx) => ({
        segmentId: id, seq: idx + 1, mode: modes[idx], modeLabel: MODE_LABELS[modes[idx]],
        carrierName: MODE_CARRIER[modes[idx]].name,
        startNode: MODE_CARRIER[modes[idx]].start, endNode: MODE_CARRIER[modes[idx]].end,
        amount: segCosts[idx],
      }));
      const billId = await insert(conn,
        `INSERT INTO bill (bill_no, order_id, waybill_id, total_amount, status, segment_breakdown, issued_at)
         VALUES (?, ?, ?, ?, 'ISSUED', ?, ?)`,
        [docNo('BL', addDays(baseDate, 7), ++seq.bill, 5), order.id, waybillId, total, JSON.stringify(breakdown), issuedAt]);
      bills.push({ id: billId, orderId: order.id, waybillId, total, issuedAt });
    }
    waybills.push({ id: waybillId, orderId: order.id, orderNo: order.orderNo, customerIdx: order.customerIdx,
      baseDate, segIds, segCosts, status: waybillStatus, orderStatus: order.status });
  }

  // ── 集成报文（Mock 适配器日志） ─────────────────────────────────────────
  const integrationMessages = [];
  const pushMessage = async ({ systemCode, systemName, direction, msgType, standard, relatedType, relatedId,
    payload, status = 'SUCCESS', errorMessage = null, createdAt }) => {
    const msgNo = docNo('MSG', createdAt, ++seq.msg, 5);
    const id = await insert(conn,
      `INSERT INTO integration_message (msg_no, system_code, system_name, direction, msg_type, standard,
         related_type, related_id, payload, status, error_message, created_at, processed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [msgNo, systemCode, systemName, direction, msgType, standard, relatedType, String(relatedId),
        JSON.stringify(payload), status, errorMessage, dateTimeStr(createdAt), dateTimeStr(createdAt)]);
    integrationMessages.push({ id, systemCode, status });
  };

  for (const contract of signedContracts) {
    await pushMessage({
      systemCode: 'CA', systemName: 'CA 电子认证', direction: 'OUT', msgType: 'CA_SIGN', standard: 'JSON 签章记录',
      relatedType: 'CONTRACT', relatedId: contract.id,
      payload: { contractNo: `HT${today.getFullYear()}${String(contract.id).padStart(4, '0')}`, signer: '王海',
        caSerial: `CA-2026-${String(1000 + contract.id)}`, signHash: '9f2c...e1', signedAt: dateTimeStr(addDays(today, -8)) },
      createdAt: addDays(today, -8),
    });
  }
  for (const quote of acceptedQuotes) {
    await pushMessage({
      systemCode: 'PORT_EDI', systemName: '港口 EDI', direction: 'OUT', msgType: 'PORT_CODECO', standard: 'UN/EDIFACT',
      relatedType: 'QUOTE', relatedId: quote.id,
      payload: { messageNo: `CODECO-${quote.id}`, portCode: 'CNSHA', containerType: quote.ctCode,
        containerCount: quote.count, moveType: 'GATE_IN', vessel: 'COSCO SHIPPING', voyage: '2026E', eventTime: dateTimeStr(addDays(today, -2)) },
      createdAt: addDays(today, -2),
    });
  }
  for (const waybill of waybills) {
    await pushMessage({
      systemCode: 'RAIL_95306', systemName: '铁路 95306', direction: 'OUT', msgType: 'RAIL_DEMAND_APPLY', standard: 'JT/T 1351-2020',
      relatedType: 'WAYBILL', relatedId: waybill.id,
      payload: { messageNo: `RD-${waybill.id}`, shipperName: '中远海联运 MTO', fromStation: '21001', toStation: '47085',
        containerType: '40HQ', containerCount: 1, cargoName: '光伏组件', requiredDate: dateStr(addDays(waybill.baseDate, 3)),
        wagonType: 'X70', status: '已受理' },
      createdAt: addDays(waybill.baseDate, 1),
    });
  }
  for (const bill of bills) {
    await pushMessage({
      systemCode: 'BANK', systemName: '银行支付', direction: 'OUT', msgType: 'BANK_PAYMENT_RECEIPT', standard: 'JSON 回执',
      relatedType: 'BILL', relatedId: bill.id,
      payload: { paymentNo: `PAY${bill.id}`, payer: '上海远洋新能源科技有限公司', payee: '中远海联运 MTO',
        amount: bill.total, bankSerial: `BANK${String(202610000 + bill.id)}`, paidAt: bill.issuedAt, status: 'SUCCESS' },
      createdAt: addDays(today, -1),
    });
    await pushMessage({
      systemCode: 'TAX', systemName: '税务电子发票', direction: 'OUT', msgType: 'TAX_INVOICE_ISSUE', standard: '电子发票要素',
      relatedType: 'BILL', relatedId: bill.id,
      payload: { invoiceNo: `FP${String(202600000 + bill.id)}`, buyer: '上海远洋新能源科技有限公司', seller: '中远海联运 MTO',
        amount: bill.total, taxRate: 9, taxAmount: round2(bill.total * 9 / 109), issuedAt: bill.issuedAt },
      createdAt: addDays(today, -1),
    });
  }
  for (let i = 0; i < 6; i += 1) {
    await pushMessage({
      systemCode: 'GPS', systemName: '北斗/GPS 定位', direction: 'IN', msgType: 'GPS_HEARTBEAT', standard: 'MQTT/JSON',
      relatedType: 'WAYBILL', relatedId: waybills[i % waybills.length]?.id ?? 0,
      payload: { deviceNo: `GPS-${100 + i}`, containerNo: containerNo('MSCU', 700000 + i), lng: 121.5 - i * 0.2,
        lat: 31.0 - i * 0.05, speed: 60 + i, reportedAt: dateTimeStr(addDays(today, -i)) },
      createdAt: addDays(today, -i),
    });
  }
  const failedRail = waybills[0];
  if (failedRail) {
    await pushMessage({
      systemCode: 'RAIL_95306', systemName: '铁路 95306', direction: 'OUT', msgType: 'RAIL_DEMAND_APPLY', standard: 'JT/T 1351-2020',
      relatedType: 'WAYBILL', relatedId: failedRail.id,
      payload: { messageNo: `RD-FAIL-${failedRail.id}`, fromStation: '21001', toStation: '47085', error: '需求车提报超时' },
      status: 'FAILED', errorMessage: '95306 接口超时（Mock）', createdAt: addDays(today, -1),
    });
  }
  if (bills[0]) {
    await pushMessage({
      systemCode: 'BANK', systemName: '银行支付', direction: 'OUT', msgType: 'BANK_PAYMENT_RECEIPT', standard: 'JSON 回执',
      relatedType: 'BILL', relatedId: bills[0].id,
      payload: { paymentNo: 'PAY-FAIL-1', amount: bills[0].total, status: 'FAILED', reason: '账户余额不足' },
      status: 'FAILED', errorMessage: '银行返回余额不足（Mock）', createdAt: addDays(today, -1),
    });
  }

  // ── 审计日志 ──────────────────────────────────────────────────────────────
  const auditActions = [
    ['LOGIN', '登录系统', 'auth'], ['QUOTE_CREATE', '创建询价', 'quote'], ['QUOTE_SEND', '发送报价', 'quote'],
    ['QUOTE_ACCEPT', '接受报价', 'quote'], ['CONTRACT_SIGN', '签署合同', 'contract'], ['ORDER_CREATE', '创建订单', 'order'],
    ['ORDER_DISPATCH', '人工调度', 'dispatch'], ['SEGMENT_ACCEPT', '司机接单', 'carrier'], ['SEGMENT_DEPART', '上报已提货', 'carrier'],
    ['SEGMENT_ARRIVE', '上报已送达', 'carrier'], ['TERMINAL_GATE_IN', '确认进场', 'terminal'], ['SIGN', '运单签收', 'waybill'],
    ['SETTLE', '生成账单', 'settlement'], ['INTEGRATION_RETRY', '重试报文', 'integration'],
  ];
  const auditUsers = ref.users;
  for (let i = 0; i < 30; i += 1) {
    const [action, label, module] = auditActions[i % auditActions.length];
    const user = auditUsers[i % auditUsers.length];
    await insert(conn,
      `INSERT INTO audit_log (user_id, username, role, action, action_label, module, target_type, target_id, detail, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.id, user.username, user.role, action, label, module,
        module === 'order' || module === 'dispatch' ? 'ORDER' : module.toUpperCase(),
        String(orders[i % orders.length]?.id ?? 1),
        JSON.stringify({ note: `种子审计记录 #${i + 1}` }), '127.0.0.1', dateTimeStr(addDays(today, -i % 10))]);
  }

  // ── 通知 / 待办 ─────────────────────────────────────────────────────────
  const notificationDefs = [
    ['TODO', '待调度订单', '有 3 票订单待人工调度，请及时处理', 'MTO', null, 'ORDER'],
    ['TODO', '待报价询价', '客户提交了新的询价单，请尽快报价', 'MTO', null, 'QUOTE'],
    ['TODO', '待签署合同', '客户合同待签署，请提醒客户完成电子签章', 'MTO', null, 'CONTRACT'],
    ['INFO', '报价已发送', '您的询价已生成报价，请查看并确认', 'SHIPPER', ref.userBy.shipper01.id, 'QUOTE'],
    ['INFO', '账单已生成', '本月账单已生成，可在账单页查看明细', 'SHIPPER', ref.userBy.shipper01.id, 'BILL'],
    ['TODO', '公路运输任务', '有新的公路段任务待接单', 'CARRIER', ref.userBy.carrier01.id, 'WAYBILL'],
    ['TODO', '港站进场作业', '集装箱待进场确认，请录入箱况', 'TERMINAL', ref.userBy.terminal01.id, 'WAYBILL'],
    ['ALERT', '集成报文失败', '95306 需求车提报失败 1 条，请到集成中心重试', 'ADMIN', ref.userBy.admin01.id, 'INTEGRATION'],
    ['INFO', '合同已签署', '合同已完成电子签章，可下载归档', 'MTO', null, 'CONTRACT'],
    ['INFO', '订单已签收', '订单已完成签收，等待结算', 'SETTLEMENT', ref.userBy.settlement01.id, 'ORDER'],
    ['ALERT', '异常预警', '海运段预计延误 6 小时，请关注', 'MTO', null, 'WAYBILL'],
    ['INFO', '欢迎使用', '平台演示数据已加载，可切换角色体验全流程', 'ADMIN', null, 'SYSTEM'],
  ];
  for (let i = 0; i < notificationDefs.length; i += 1) {
    const [type, title, content, role, userId, relatedType] = notificationDefs[i];
    await insert(conn,
      `INSERT INTO notification (user_id, role, type, title, content, related_type, related_id, read_flag, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, userId ? null : role, type, title, content, relatedType, String(orders[i % orders.length]?.id ?? 1),
        i % 4 === 0 ? 1 : 0, dateTimeStr(addDays(today, -i % 5))]);
  }

  // ── 领域事件（outbox） ──────────────────────────────────────────────────
  const eventDefs = [
    ['quote.sent', 'QUOTE', quotes.filter((q) => q.status === 'SENT').map((q) => q.id)],
    ['quote.accepted', 'QUOTE', acceptedQuotes.map((q) => q.id)],
    ['contract.signed', 'CONTRACT', signedContracts.map((c) => c.id)],
    ['order.dispatched', 'ORDER', waybills.map((w) => w.id)],
    ['order.signed', 'WAYBILL', waybills.filter((w) => w.status === 'SIGNED').map((w) => w.id)],
    ['order.settled', 'BILL', bills.map((b) => b.id)],
  ];
  let eventCount = 0;
  for (const [eventType, aggregateType, ids] of eventDefs) {
    for (const id of ids.slice(0, 5)) {
      eventCount += 1;
      await insert(conn,
        `INSERT INTO event_outbox (event_type, aggregate_type, aggregate_id, payload, status, created_at, published_at)
         VALUES (?, ?, ?, ?, 'PUBLISHED', ?, ?)`,
        [eventType, aggregateType, String(id), JSON.stringify({ eventType, aggregateId: id }),
          dateTimeStr(addDays(today, -1)), dateTimeStr(addDays(today, -1))]);
    }
  }

  console.log(`[db] 业务数据：报价 ${quotes.length}、订单 ${orders.length}、运单 ${waybills.length}、账单 ${bills.length}、集成报文 ${integrationMessages.length}、事件 ${eventCount}`);
}
