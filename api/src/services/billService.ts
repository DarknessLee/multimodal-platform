// 账单（应收/应付）与结算出账 v2：明细/税额/毛利 + 各分段承运人应付账单
import {
  BILL_ITEM_MODE_LABELS,
  BILL_SOURCE_LABELS,
  BILL_TYPE_LABELS,
  COUNTERPARTY_TYPE_LABELS,
  INVOICE_STATUS_LABELS,
  INVOICE_TYPE_LABELS,
  MODE_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_DIRECTION_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  RECON_STATUS_LABELS,
} from '../config/labels';
import { queryOne, queryRows, txExec, txQueryOne, txQueryRows, withTransaction } from '../db/pool';
import { ApiError } from '../errors';
import { writeAudit } from '../middleware/audit';
import { emitEvent } from '../platform/eventBus';
import { nextDocNo } from '../platform/sequence';
import type {
  AuthUser,
  BillBreakdownItem,
  BillItemRow,
  BillItemMode,
  BillRow,
  BillSource,
  BillType,
  CounterpartyType,
  InvoiceRow,
  InvoiceStatus,
  InvoiceType,
  OrderRow,
  OrderStatus,
  PartnerRow,
  PaymentDirection,
  PaymentMethod,
  PaymentRow,
  PaymentStatus,
  ReconciliationItemRow,
  ReconciliationRow,
  ReconStatus,
  SegmentMode,
  SegmentRow,
  WaybillRow,
} from '../types';
import { formatDate, formatDateTime, nowDate, todayCompact } from '../utils/datetime';
import { parseJson, round2 } from '../utils/json';
import { optionalString, pageResult, parsePage } from '../modules/shared/pagination';
import { dtoBillHeader } from './mappers';

const TAX_RATE = 9;

function taxInclusive(amount: number, rate = TAX_RATE): number {
  return round2((amount * rate) / (100 + rate));
}

function periodOf(at: string): string {
  return at.slice(0, 7);
}

function dueDateAfter(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function parseBreakdown(value: unknown): BillBreakdownItem[] {
  if (Array.isArray(value)) {
    return value as BillBreakdownItem[];
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as BillBreakdownItem[]) : [];
  }
  return [];
}

const MODE_BY_PARTNER_TYPE: Record<SegmentMode, string> = {
  ROAD: 'ROAD_CARRIER',
  SEA: 'SEA_CARRIER',
  RAIL: 'RAIL_OPERATOR',
};

/** 承运人对手方解析：按分段承运人名称匹配伙伴，失败按运输方式类型兜底 */
export async function resolveCarrierPartner(
  conn: import('mysql2/promise').PoolConnection,
  segment: SegmentRow,
): Promise<PartnerRow | null> {
  const byName = await txQueryOne<PartnerRow>(conn, 'SELECT * FROM partner WHERE name = ? LIMIT 1', [
    segment.carrier_name,
  ]);
  if (byName) return byName;
  return txQueryOne<PartnerRow>(
    conn,
    'SELECT * FROM partner WHERE type = ? ORDER BY id ASC LIMIT 1',
    [MODE_BY_PARTNER_TYPE[segment.mode]],
  );
}

interface BillJoinedRow extends BillRow {
  order_no: string;
  order_status: OrderStatus;
  order_origin: string;
  order_destination: string;
  order_customer_id: number | null;
  waybill_no: string;
  customer_name: string | null;
  bill_customer_name: string | null;
  bill_partner_name: string | null;
  bill_partner_type: string | null;
}

const BILL_JOINED_SELECT = `
  SELECT b.*, o.order_no, o.status AS order_status, o.origin AS order_origin,
         o.destination AS order_destination, o.customer_id AS order_customer_id,
         w.waybill_no, c.name AS customer_name,
         bc.name AS bill_customer_name, bp.name AS bill_partner_name, bp.type AS bill_partner_type
    FROM bill b
    JOIN orders o ON o.id = b.order_id
    JOIN waybill w ON w.id = b.waybill_id
    LEFT JOIN customer c ON c.id = o.customer_id
    LEFT JOIN customer bc ON b.counterparty_type = 'CUSTOMER' AND bc.id = b.counterparty_id
    LEFT JOIN partner bp ON b.counterparty_type IN ('CARRIER', 'FINANCE', 'INSURER') AND bp.id = b.counterparty_id`;

/** 账单对手方（含历史账单兜底：应收→订单客户） */
export function billCounterparty(row: BillJoinedRow) {
  const type = (row.counterparty_type ?? (row.bill_type === 'PAYABLE' ? 'CARRIER' : 'CUSTOMER')) as CounterpartyType;
  const id = row.counterparty_id === null || row.counterparty_id === undefined
    ? type === 'CUSTOMER'
      ? row.order_customer_id
      : null
    : Number(row.counterparty_id);
  const name =
    row.bill_customer_name ??
    row.bill_partner_name ??
    (type === 'CUSTOMER' ? row.customer_name : null) ??
    null;
  return {
    type,
    typeLabel: COUNTERPARTY_TYPE_LABELS[type] ?? type,
    id: id === null ? null : Number(id),
    name,
  };
}

/** 账单头扩展 DTO（保留 v0 字段） */
export function billDto(row: BillJoinedRow) {
  const base = dtoBillHeader(row as BillRow);
  const billType = (row.bill_type ?? 'RECEIVABLE') as BillType;
  const source = (row.source ?? 'ORDER') as BillSource;
  return {
    ...base,
    billType,
    billTypeLabel: BILL_TYPE_LABELS[billType] ?? billType,
    counterparty: billCounterparty(row),
    orderId: Number(row.order_id),
    orderNo: row.order_no,
    source,
    sourceLabel: BILL_SOURCE_LABELS[source] ?? source,
    period: row.period,
    dueDate: row.due_date,
    taxAmount: Number(row.tax_amount ?? 0),
    profitAmount: Number(row.profit_amount ?? 0),
  };
}

function billItemDto(row: BillItemRow) {
  const mode = (row.mode ?? 'OTHER') as BillItemMode;
  return {
    id: Number(row.id),
    seq: Number(row.seq),
    mode,
    modeLabel: BILL_ITEM_MODE_LABELS[mode] ?? mode,
    chargeType: row.charge_type,
    description: row.description,
    quantity: Number(row.quantity),
    unit: row.unit,
    unitPrice: Number(row.unit_price),
    amount: Number(row.amount),
    taxRate: Number(row.tax_rate),
    taxAmount: Number(row.tax_amount),
    costAmount: Number(row.cost_amount),
    segmentId: row.segment_id === null ? null : Number(row.segment_id),
  };
}

function derivedItemsFromBreakdown(breakdown: BillBreakdownItem[]) {
  return breakdown.map((item, index) => {
    const mode = (item.mode ?? 'OTHER') as BillItemMode;
    return {
      id: 0,
      seq: index + 1,
      mode,
      modeLabel: BILL_ITEM_MODE_LABELS[mode] ?? MODE_LABELS[item.mode] ?? mode,
      chargeType: 'FREIGHT',
      description: `${item.startNode}—${item.endNode} 运费`,
      quantity: 1,
      unit: '箱',
      unitPrice: Number(item.amount),
      amount: Number(item.amount),
      taxRate: TAX_RATE,
      taxAmount: taxInclusive(Number(item.amount)),
      costAmount: round2(Number(item.amount) * 0.86),
      segmentId: item.segmentId,
    };
  });
}

/** 账单未核销金额 = 账单总额 - 已成功核销金额 */
export async function billOutstanding(billId: number): Promise<{ total: number; allocated: number; outstanding: number }> {
  const bill = await queryOne<BillRow>('SELECT * FROM bill WHERE id = ?', [billId]);
  if (!bill) {
    throw new ApiError(40401, '账单不存在');
  }
  const row = await queryOne<{ allocated: number | null }>(
    `SELECT COALESCE(SUM(pa.amount), 0) AS allocated
       FROM payment_allocation pa
       JOIN payment p ON p.id = pa.payment_id
      WHERE pa.bill_id = ? AND p.status = 'SUCCESS'`,
    [billId],
  );
  const allocated = Number(row?.allocated ?? 0);
  const total = Number(bill.total_amount);
  return { total, allocated: round2(allocated), outstanding: round2(Math.max(0, total - allocated)) };
}

/** 事务内版本：避免与 FOR UPDATE 锁冲突（支付/保理在事务内校验未核销额） */
export async function billOutstandingTx(
  conn: import('mysql2/promise').PoolConnection,
  billId: number,
): Promise<{ total: number; allocated: number; outstanding: number }> {
  const bill = await txQueryOne<BillRow>(conn, 'SELECT * FROM bill WHERE id = ?', [billId]);
  if (!bill) {
    throw new ApiError(40401, '账单不存在');
  }
  const row = await txQueryOne<{ allocated: number | null }>(
    conn,
    `SELECT COALESCE(SUM(pa.amount), 0) AS allocated
       FROM payment_allocation pa
       JOIN payment p ON p.id = pa.payment_id
      WHERE pa.bill_id = ? AND p.status = 'SUCCESS'`,
    [billId],
  );
  const allocated = Number(row?.allocated ?? 0);
  const total = Number(bill.total_amount);
  return { total, allocated: round2(allocated), outstanding: round2(Math.max(0, total - allocated)) };
}

async function insertBillItem(
  conn: import('mysql2/promise').PoolConnection,
  billId: number,
  seq: number,
  mode: BillItemMode,
  description: string,
  quantity: number,
  unitPrice: number,
  amount: number,
  costAmount: number,
  segmentId: number | null,
  chargeType = 'FREIGHT',
) {
  const taxAmount = taxInclusive(amount);
  await txExec(
    conn,
    `INSERT INTO bill_item (bill_id, seq, mode, charge_type, description, quantity, unit, unit_price, amount,
       tax_rate, tax_amount, cost_amount, segment_id)
     VALUES (?, ?, ?, ?, ?, ?, '箱', ?, ?, ?, ?, ?, ?)`,
    [
      billId,
      seq,
      mode,
      chargeType,
      description,
      quantity,
      unitPrice,
      amount,
      TAX_RATE,
      taxAmount,
      costAmount,
      segmentId,
    ],
  );
}

export interface SettleResult {
  billId: number;
  payableBillIds: number[];
}

/**
 * POST /api/orders/:id/settle（结算出账 v2，事务）
 * - 应收账单（客户）：逐分段 bill_item（含税额/成本/毛利），保留 v0 响应结构
 * - 应付账单（各分段承运人）：按成本额生成 PAYABLE 账单
 * 幂等：重复出账 40901（v0/Stage1 兼容）、未签收 40901
 */
export async function settleOrder(orderId: number, user: AuthUser | null = null, ip: string | null = null) {
  const result = await withTransaction(async (conn) => {
    const order = await txQueryOne<OrderRow>(conn, 'SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (!order) {
      throw new ApiError(40401, '订单不存在');
    }
    if (order.status !== 'SIGNED') {
      throw new ApiError(40901, '订单未签收，不能出账');
    }
    const existingBill = await txQueryOne<BillRow>(
      conn,
      "SELECT * FROM bill WHERE order_id = ? AND bill_type = 'RECEIVABLE' LIMIT 1",
      [orderId],
    );
    if (existingBill) {
      throw new ApiError(40901, '该订单已出账');
    }

    const waybill = await txQueryOne<WaybillRow>(
      conn,
      'SELECT * FROM waybill WHERE order_id = ? ORDER BY id ASC LIMIT 1',
      [orderId],
    );
    if (!waybill) {
      throw new ApiError(40901, '订单缺少运单，不能出账');
    }
    const segments = await txQueryRows<SegmentRow>(
      conn,
      'SELECT * FROM waybill_segment WHERE waybill_id = ? ORDER BY seq ASC',
      [waybill.id],
    );
    const breakdown: BillBreakdownItem[] = segments.map((segment) => ({
      segmentId: Number(segment.id),
      seq: Number(segment.seq),
      mode: segment.mode,
      modeLabel: MODE_LABELS[segment.mode],
      carrierName: segment.carrier_name,
      startNode: segment.start_node,
      endNode: segment.end_node,
      amount: Number(segment.cost_amount),
    }));
    const containerCount = Math.max(1, Number(order.container_count) || 1);
    const customer = order.customer_id
      ? await txQueryOne<{ id: number; name: string }>(conn, 'SELECT id, name FROM customer WHERE id = ?', [
          order.customer_id,
        ])
      : null;

    // ── 应收账单 ────────────────────────────────────────────────────────────
    const receivableBillNo = await nextDocNo(conn, {
      table: 'bill',
      column: 'bill_no',
      prefix: `BL${todayCompact()}`,
      width: 4,
    });
    const at = formatDateTime(nowDate());
    const period = periodOf(at);
    const dueDate = dueDateAfter(30);
    let receivableTotal = 0;
    let receivableTax = 0;
    let receivableCost = 0;
    const segmentCosts: Array<{ segment: SegmentRow; cost: number; partner: PartnerRow | null }> = [];
    const itemDrafts = segments.map((segment) => {
      const amount = Number(segment.cost_amount);
      const taxAmount = taxInclusive(amount);
      const cost = round2(amount * 0.86);
      receivableTotal += amount;
      receivableTax += taxAmount;
      receivableCost += cost;
      return { segment, amount, taxAmount, cost };
    });
    receivableTotal = round2(receivableTotal);
    receivableTax = round2(receivableTax);
    receivableCost = round2(receivableCost);

    const receivableInsert = await txExec(
      conn,
      `INSERT INTO bill (bill_no, bill_type, counterparty_type, counterparty_id, source, period, due_date,
         order_id, waybill_id, total_amount, tax_amount, profit_amount, status, segment_breakdown, issued_at)
       VALUES (?, 'RECEIVABLE', 'CUSTOMER', ?, 'ORDER', ?, ?, ?, ?, ?, ?, 0, 'ISSUED', ?, ?)`,
      [
        receivableBillNo,
        customer ? Number(customer.id) : order.customer_id === null ? null : Number(order.customer_id),
        period,
        dueDate,
        orderId,
        waybill.id,
        receivableTotal,
        receivableTax,
        JSON.stringify(breakdown),
        at,
      ],
    );
    const receivableBillId = Number(receivableInsert.insertId);

    let seq = 0;
    for (const draft of itemDrafts) {
      seq += 1;
      const unitPrice = round2(draft.amount / containerCount);
      await insertBillItem(
        conn,
        receivableBillId,
        seq,
        draft.segment.mode,
        `${draft.segment.start_node}—${draft.segment.end_node} 运费（${draft.segment.carrier_name}）`,
        containerCount,
        unitPrice,
        draft.amount,
        draft.cost,
        Number(draft.segment.id),
      );
    }

    // ── 应付账单（各分段承运人）────────────────────────────────────────────
    const payableBillIds: number[] = [];
    let payableTotal = 0;
    for (const draft of itemDrafts) {
      const partner = await resolveCarrierPartner(conn, draft.segment);
      segmentCosts.push({ segment: draft.segment, cost: draft.cost, partner });
      const payableBillNo = await nextDocNo(conn, {
        table: 'bill',
        column: 'bill_no',
        prefix: `BL${todayCompact()}`,
        width: 4,
      });
      const payableInsert = await txExec(
        conn,
        `INSERT INTO bill (bill_no, bill_type, counterparty_type, counterparty_id, source, period, due_date,
           order_id, waybill_id, total_amount, tax_amount, profit_amount, status, segment_breakdown, issued_at)
         VALUES (?, 'PAYABLE', 'CARRIER', ?, 'SEGMENT', ?, ?, ?, ?, ?, ?, 0, 'ISSUED', '[]', ?)`,
        [
          payableBillNo,
          partner ? Number(partner.id) : null,
          period,
          dueDate,
          orderId,
          waybill.id,
          round2(draft.cost),
          taxInclusive(draft.cost),
          at,
        ],
      );
      const payableBillId = Number(payableInsert.insertId);
      payableBillIds.push(payableBillId);
      payableTotal += round2(draft.cost);
      await insertBillItem(
        conn,
        payableBillId,
        1,
        draft.segment.mode,
        `${draft.segment.carrier_name} 应付运费`,
        containerCount,
        round2(draft.cost / containerCount),
        round2(draft.cost),
        round2(draft.cost),
        Number(draft.segment.id),
      );
    }
    payableTotal = round2(payableTotal);
    const profit = round2(receivableTotal - payableTotal);
    await txExec(conn, 'UPDATE bill SET profit_amount = ? WHERE id = ?', [profit, receivableBillId]);

    await txExec(conn, 'UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', ['BILLED', at, orderId]);

    await emitEvent(conn, {
      eventType: 'order.settled',
      aggregateType: 'BILL',
      aggregateId: receivableBillId,
      payload: {
        billId: receivableBillId,
        billNo: receivableBillNo,
        orderId: Number(order.id),
        orderNo: order.order_no,
        waybillId: Number(waybill.id),
        waybillNo: waybill.waybill_no,
        amount: receivableTotal,
        payableAmount: payableTotal,
        profit,
        customerId: order.customer_id === null ? null : Number(order.customer_id),
        customerName: customer?.name ?? '',
        issuedAt: at,
      },
    });

    if (user) {
      await writeAudit(conn, {
        user,
        action: 'SETTLE',
        actionLabel: '生成账单',
        module: 'settlement',
        targetType: 'BILL',
        targetId: receivableBillId,
        detail: {
          billNo: receivableBillNo,
          orderId: Number(order.id),
          orderNo: order.order_no,
          totalAmount: receivableTotal,
          payableAmount: payableTotal,
          profit,
          payableBills: payableBillIds.length,
        },
        ip,
      });
    }

    return { billId: receivableBillId, payableBillIds };
  });

  const detail = await getBillDetail(result.billId);
  const payableBills = [];
  for (const payableBillId of result.payableBillIds) {
    const row = await queryOne<BillJoinedRow>(`${BILL_JOINED_SELECT} WHERE b.id = ?`, [payableBillId]);
    if (row) payableBills.push(billDto(row));
  }
  return { ...detail, bill: { ...detail.bill, items: detail.items }, payableBills };
}

/** GET /api/bills：应收/应付账单分页列表 */
export async function listBills(query: Record<string, unknown>) {
  const pager = parsePage(query, 10);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const billType = optionalString(query.billType);
  const status = optionalString(query.status);
  const keyword = optionalString(query.keyword);
  const orderId = optionalString(query.orderId);
  if (billType) {
    conditions.push('b.bill_type = ?');
    params.push(billType);
  }
  if (status) {
    conditions.push('b.status = ?');
    params.push(status);
  }
  if (orderId) {
    conditions.push('b.order_id = ?');
    params.push(Number(orderId));
  }
  if (keyword) {
    conditions.push('(b.bill_no LIKE ? OR o.order_no LIKE ? OR c.name LIKE ? OR bp.name LIKE ?)');
    const like = `%${keyword}%`;
    params.push(like, like, like, like);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM bill b
       JOIN orders o ON o.id = b.order_id
       LEFT JOIN customer c ON c.id = b.counterparty_id AND b.counterparty_type = 'CUSTOMER'
       LEFT JOIN partner bp ON bp.id = b.counterparty_id AND b.counterparty_type IN ('CARRIER','FINANCE','INSURER')
       ${where}`,
    params,
  );
  const rows = await queryRows<BillJoinedRow>(
    `${BILL_JOINED_SELECT} ${where} ORDER BY b.issued_at DESC, b.id DESC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  return pageResult(rows.map(billDto), Number(totalRow?.total ?? 0), pager);
}

/** GET /api/bills/:id：账单详情（v0 字段不变 + 明细/发票/支付/对账/应收应付） */
export async function getBillDetail(billId: number) {
  const bill = await queryOne<BillJoinedRow>(`${BILL_JOINED_SELECT} WHERE b.id = ?`, [billId]);
  if (!bill) {
    throw new ApiError(40401, '账单不存在');
  }
  const itemRows = await queryRows<BillItemRow>(
    'SELECT * FROM bill_item WHERE bill_id = ? ORDER BY seq ASC',
    [billId],
  );
  const breakdown = parseBreakdown(bill.segment_breakdown);
  const items = itemRows.length > 0 ? itemRows.map(billItemDto) : derivedItemsFromBreakdown(breakdown);

  const invoiceRows = await queryRows<InvoiceRow>(
    'SELECT * FROM invoice WHERE bill_id = ? ORDER BY id DESC LIMIT 1',
    [billId],
  );
  const invoiceRow = invoiceRows[0] ?? null;
  const paymentRows = await queryRows<PaymentRow>(
    'SELECT * FROM payment WHERE bill_id = ? ORDER BY created_at DESC, id DESC',
    [billId],
  );
  const reconRow = await queryOne<ReconciliationRow & { item_id: number; item_status: string }>(
    `SELECT r.*, ri.id AS item_id, ri.status AS item_status
       FROM reconciliation_item ri
       JOIN reconciliation r ON r.id = ri.recon_id
      WHERE ri.bill_id = ?
      ORDER BY r.id DESC LIMIT 1`,
    [billId],
  );

  let payableBills: ReturnType<typeof billDto>[] = [];
  if ((bill.bill_type ?? 'RECEIVABLE') === 'RECEIVABLE') {
    const payableRows = await queryRows<BillJoinedRow>(
      `${BILL_JOINED_SELECT} WHERE b.order_id = ? AND b.bill_type = 'PAYABLE' ORDER BY b.id ASC`,
      [bill.order_id],
    );
    payableBills = payableRows.map(billDto);
  }

  const outstandingRow = await queryOne<{ allocated: number | null }>(
    `SELECT COALESCE(SUM(pa.amount), 0) AS allocated
       FROM payment_allocation pa JOIN payment p ON p.id = pa.payment_id
      WHERE pa.bill_id = ? AND p.status = 'SUCCESS'`,
    [billId],
  );
  const allocated = round2(Number(outstandingRow?.allocated ?? 0));

  return {
    bill: {
      ...billDto(bill),
      allocatedAmount: allocated,
      outstandingAmount: round2(Math.max(0, Number(bill.total_amount) - allocated)),
      paidAt: bill.paid_at,
    },
    order: {
      id: Number(bill.order_id),
      orderNo: bill.order_no,
      origin: bill.order_origin,
      destination: bill.order_destination,
      status: bill.order_status,
      statusLabel: ORDER_STATUS_LABELS[bill.order_status],
      customerName: bill.customer_name,
    },
    waybill: {
      id: Number(bill.waybill_id),
      waybillNo: bill.waybill_no,
    },
    breakdown,
    items,
    invoice: invoiceRow
      ? {
          id: Number(invoiceRow.id),
          invoiceNo: invoiceRow.invoice_no,
          invoiceType: invoiceRow.invoice_type,
          invoiceTypeLabel: INVOICE_TYPE_LABELS[invoiceRow.invoice_type as InvoiceType],
          status: invoiceRow.status,
          statusLabel: INVOICE_STATUS_LABELS[invoiceRow.status as InvoiceStatus],
          totalAmount: Number(invoiceRow.total_amount),
          issuedAt: invoiceRow.issued_at,
          voidedAt: invoiceRow.voided_at,
        }
      : null,
    payments: paymentRows.map((row) => ({
      id: Number(row.id),
      paymentNo: row.payment_no,
      direction: row.direction,
      directionLabel: PAYMENT_DIRECTION_LABELS[row.direction as PaymentDirection],
      amount: Number(row.amount),
      method: row.method,
      methodLabel: PAYMENT_METHOD_LABELS[row.method as PaymentMethod],
      status: row.status,
      statusLabel: PAYMENT_STATUS_LABELS[row.status as PaymentStatus],
      bankSerial: row.bank_serial,
      paidAt: row.paid_at,
      createdAt: row.created_at,
    })),
    reconciliation: reconRow
      ? {
          id: Number(reconRow.id),
          reconNo: reconRow.recon_no,
          status: reconRow.status,
          statusLabel: RECON_STATUS_LABELS[reconRow.status as ReconStatus],
          sentAt: reconRow.sent_at,
          confirmedAt: reconRow.confirmed_at,
        }
      : null,
    payableBills,
  };
}

export { COUNTERPARTY_TYPE_LABELS, INVOICE_STATUS_LABELS, INVOICE_TYPE_LABELS, RECON_STATUS_LABELS };
export type { BillJoinedRow };
export { parseJson };
