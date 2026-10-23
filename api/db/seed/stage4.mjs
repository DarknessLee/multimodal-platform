// Stage 4 业务种子：应收/应付账单与明细、对账、发票、支付核销、保理、保险保单、经营分析日汇总
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creditCode } from './lib.mjs';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pad = (n, width = 2) => String(n).padStart(width, '0');
function fmt(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
function dateOnly(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function ymd(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}
function at(base, hours) {
  return fmt(new Date(base.getTime() + hours * 3600000));
}
function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}
async function insert(conn, sql, params) {
  const [result] = await conn.execute(sql, params);
  return result.insertId;
}

export async function seedStage4(conn, ref) {
  const now = new Date();
  const [orders] = await conn.query('SELECT * FROM orders ORDER BY id');
  const [bills] = await conn.query('SELECT * FROM bill ORDER BY id');
  const [waybills] = await conn.query("SELECT * FROM waybill WHERE waybill_type = 'MASTER' ORDER BY id");
  const [segments] = await conn.query('SELECT * FROM waybill_segment ORDER BY waybill_id, seq');
  const customerById = new Map(ref.customers.map((c) => [c.id, c]));
  const partnerById = new Map(ref.partners.map((p) => [p.id, p]));
  const waybillByOrder = new Map(waybills.map((w) => [Number(w.order_id), w]));
  const segmentsByWaybill = new Map();
  for (const segment of segments) {
    const key = Number(segment.waybill_id);
    if (!segmentsByWaybill.has(key)) segmentsByWaybill.set(key, []);
    segmentsByWaybill.get(key).push(segment);
  }
  const platformTaxNo = creditCode('310115', '600000000');
  const period = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

  function buildItems(segList, totalAmount, taxRate = 9) {
    const total = round2(totalAmount);
    const weights = segList.map((s) => Number(s.cost_amount) || 0);
    const weightSum = weights.reduce((a, b) => a + b, 0) || segList.length;
    const raw = segList.map((s, i) => {
      const share = weights.some((w) => w > 0) ? (Number(s.cost_amount) || 0) / weightSum : 1 / segList.length;
      return {
        mode: s.mode,
        carrierId: s.carrier_partner_id,
        amount: i === segList.length - 1 ? 0 : round2(total * share),
        description: `${s.start_node} — ${s.end_node} ${s.mode === 'ROAD' ? '拖车' : s.mode === 'SEA' ? '海运' : '铁路'}`,
        segmentId: s.id,
      };
    });
    const used = raw.slice(0, -1).reduce((a, b) => a + b.amount, 0);
    if (raw.length) raw[raw.length - 1].amount = round2(total - used);
    return raw.map((item, i) => {
      const taxAmount = round2((item.amount / (1 + taxRate / 100)) * (taxRate / 100));
      return { ...item, seq: i + 1, unitPrice: item.amount, taxAmount, costAmount: round2(item.amount * 0.78) };
    });
  }

  async function insertItems(billId, items) {
    let sum = 0;
    for (const item of items) {
      await insert(conn,
        `INSERT INTO bill_item (bill_id, seq, mode, charge_type, description, quantity, unit, unit_price, amount, tax_rate, tax_amount, cost_amount, segment_id, created_at)
         VALUES (?, ?, ?, 'FREIGHT', ?, 1, '箱', ?, ?, 9.00, ?, ?, ?, ?)`,
        [billId, item.seq, item.mode, item.description, item.unitPrice, item.amount, item.taxAmount, item.costAmount, item.segmentId ?? null, at(now, -30)]);
      sum = round2(sum + item.amount);
    }
    return sum;
  }

  // ── 1) 既有 6 张账单扩展为应收 + 明细 ─────────────────────────────────
  const receivableBills = [];
  let seq = 0;
  for (const bill of bills) {
    const order = orders.find((o) => Number(o.id) === Number(bill.order_id));
    const customer = customerById.get(Number(order?.customer_id));
    const waybill = waybillByOrder.get(Number(bill.order_id));
    const segList = waybill ? segmentsByWaybill.get(Number(waybill.id)) ?? [] : [];
    const total = round2(bill.total_amount);
    const items = buildItems(segList.length ? segList : [{ mode: 'ROAD', cost_amount: total }], total);
    const taxAmount = round2(items.reduce((sum, item) => sum + item.taxAmount, 0));
    const costSum = round2(items.reduce((sum, item) => sum + item.costAmount, 0));
    await conn.execute(
      `UPDATE bill SET bill_type = 'RECEIVABLE', counterparty_type = 'CUSTOMER', counterparty_id = ?, source = 'ORDER',
         period = ?, due_date = ?, tax_amount = ?, profit_amount = ? WHERE id = ?`,
      [customer?.id ?? null, period, dateOnly(new Date(now.getTime() + 30 * 86400000)), taxAmount, round2(total - taxAmount - costSum), bill.id],
    );
    const itemSum = await insertItems(bill.id, items);
    receivableBills.push({ id: bill.id, order, customer, waybill, segList, total: itemSum, taxAmount, costSum });
  }

  // ── 2) 新增 6 张应收 + 12 张应付 ───────────────────────────────────────
  const usedOrders = new Set(bills.map((b) => Number(b.order_id)));
  const extraOrders = orders.filter((o) => waybillByOrder.has(Number(o.id)) && !usedOrders.has(Number(o.id))).slice(0, 6);
  for (const order of extraOrders) {
    const customer = customerById.get(Number(order.customer_id));
    const waybill = waybillByOrder.get(Number(order.id));
    const segList = segmentsByWaybill.get(Number(waybill.id)) ?? [];
    seq += 1;
    const billNo = `BL${ymd(now)}${String(bills.length + seq).padStart(3, '0')}`;
    const total = round2(segList.reduce((sum, s) => sum + (Number(s.cost_amount) || 0), 0) * 1.15 || 15080 + seq * 800);
    const items = buildItems(segList, total);
    const taxAmount = round2(items.reduce((sum, item) => sum + item.taxAmount, 0));
    const costSum = round2(items.reduce((sum, item) => sum + item.costAmount, 0));
    const billId = await insert(conn,
      `INSERT INTO bill (bill_no, bill_type, counterparty_type, counterparty_id, source, period, due_date, order_id, waybill_id,
         total_amount, tax_amount, profit_amount, status, segment_breakdown, issued_at)
       VALUES (?, 'RECEIVABLE', 'CUSTOMER', ?, 'ORDER', ?, ?, ?, ?, ?, ?, ?, 'ISSUED', '[]', ?)`,
      [billNo, customer?.id ?? null, period, dateOnly(new Date(now.getTime() + 30 * 86400000)), order.id, waybill.id,
        total, taxAmount, round2(total - taxAmount - costSum), at(now, -20)]);
    await insertItems(billId, items);
    receivableBills.push({ id: billId, order, customer, waybill, segList, total, taxAmount, costSum });
  }

  const payableBills = [];
  const resolveCarrier = (segment) => ref.partners.find((p) =>
    segment.carrier_name?.includes(p.shortName) || p.name?.includes(segment.carrier_name)
    || segment.carrier_name?.includes(p.name));
  for (const receivable of receivableBills) {
    const byCarrier = new Map();
    for (const segment of receivable.segList) {
      const carrier = resolveCarrier(segment);
      const key = carrier?.id ?? null;
      if (!key) continue;
      if (!byCarrier.has(key)) byCarrier.set(key, []);
      byCarrier.get(key).push(segment);
    }
    for (const [carrierId, segList] of byCarrier) {
      const partner = partnerById.get(carrierId);
      const costTotal = round2(segList.reduce((sum, s) => sum + (Number(s.cost_amount) || 0), 0));
      if (costTotal <= 0) continue;
      seq += 1;
      const billNo = `BL${ymd(now)}P${String(payableBills.length + 1).padStart(3, '0')}`;
      const items = buildItems(segList, costTotal);
      const taxAmount = round2(items.reduce((sum, item) => sum + item.taxAmount, 0));
      const billId = await insert(conn,
        `INSERT INTO bill (bill_no, bill_type, counterparty_type, counterparty_id, source, period, due_date, order_id, waybill_id,
           total_amount, tax_amount, profit_amount, status, segment_breakdown, issued_at)
         VALUES (?, 'PAYABLE', 'CARRIER', ?, 'SEGMENT', ?, ?, ?, ?, ?, ?, 0.00, 'ISSUED', '[]', ?)`,
        [billNo, carrierId, period, dateOnly(new Date(now.getTime() + 15 * 86400000)), receivable.order.id,
          receivable.waybill?.id ?? null, costTotal, taxAmount, at(now, -19)]);
      await insertItems(billId, items);
      payableBills.push({ id: billId, carrierId, carrier: partner, order: receivable.order, total: costTotal, status: 'ISSUED' });
      if (payableBills.length >= 12) break;
    }
    if (payableBills.length >= 12) break;
  }

  // ── 3) 发票 10 张 ────────────────────────────────────────────────────
  let invoiceCount = 0;
  for (let i = 0; i < 10 && i < receivableBills.length; i += 1) {
    const receivable = receivableBills[i];
    invoiceCount += 1;
    const status = i < 8 ? 'ISSUED' : i === 8 ? 'PENDING' : 'VOID';
    const invoiceNo = `FP${ymd(now)}${String(invoiceCount).padStart(4, '0')}`;
    const amount = round2(receivable.total - receivable.taxAmount);
    await insert(conn,
      `INSERT INTO invoice (invoice_no, invoice_type, bill_id, order_id, buyer_name, buyer_tax_no, seller_name, seller_tax_no,
         amount, tax_rate, tax_amount, total_amount, status, issued_at, voided_at, created_by, created_at)
       VALUES (?, 'VAT_SPECIAL', ?, ?, ?, ?, '中远海联运 MTO', ?, ?, 9.00, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceNo, receivable.id, receivable.order.id, receivable.customer?.name ?? '客户', receivable.customer?.creditCode ?? null,
        platformTaxNo, amount, receivable.taxAmount, receivable.total, status,
        status === 'ISSUED' ? at(now, -18) : null, status === 'VOID' ? at(now, -10) : null, ref.userBy.settlement01.id, at(now, -18)]);
  }

  // ── 4) 支付 8 笔 + 核销 ─────────────────────────────────────────────
  const paymentPlans = [
    [0, 'SUCCESS', 1], [1, 'SUCCESS', 1], [2, 'SUCCESS', 1], [3, 'SUCCESS', 0.5],
    [4, 'SUCCESS', 0.3], [5, 'PENDING', 1], [6, 'PENDING', 1], [7, 'FAILED', 1],
  ];
  let paymentCount = 0;
  for (const [index, status, ratio] of paymentPlans) {
    const receivable = receivableBills[index];
    if (!receivable) continue;
    paymentCount += 1;
    const amount = round2(receivable.total * ratio);
    const paymentId = await insert(conn,
      `INSERT INTO payment (payment_no, direction, counterparty_type, counterparty_id, bill_id, amount, method, status,
         bank_serial, paid_at, remark, created_by, created_at)
       VALUES (?, 'IN', 'CUSTOMER', ?, ?, ?, 'BANK_TRANSFER', ?, ?, ?, 'Stage4 种子收款', ?, ?)`,
      [`PAY${ymd(now)}${String(paymentCount).padStart(4, '0')}`, receivable.customer?.id ?? null, receivable.id, amount, status,
        status === 'SUCCESS' ? `BANK${ymd(now)}${String(paymentCount).padStart(6, '0')}` : null,
        status === 'SUCCESS' ? at(now, -5) : null, ref.userBy.settlement01.id, at(now, -6)]);
    if (status === 'SUCCESS') {
      await insert(conn,
        `INSERT INTO payment_allocation (payment_id, bill_id, amount, created_at) VALUES (?, ?, ?, ?)`,
        [paymentId, receivable.id, amount, at(now, -5)]);
      if (ratio >= 1) {
        await conn.execute("UPDATE bill SET status = 'PAID' WHERE id = ?", [receivable.id]);
      }
    }
  }

  // ── 5) 对账单 6 张（按承运人应付账单） ─────────────────────────────
  const carrierIds = [...new Set(payableBills.map((p) => p.carrierId))];
  const reconStatuses = ['DRAFT', 'SENT', 'CONFIRMED', 'DISPUTED', 'CONFIRMED', 'SENT'];
  const reconCount = Math.min(6, Math.max(carrierIds.length, 0) * 2);
  for (let i = 0; i < reconCount; i += 1) {
    const carrierId = carrierIds[i % carrierIds.length];
    const carrier = partnerById.get(carrierId);
    const carrierBills = payableBills.filter((p) => p.carrierId === carrierId);
    if (!carrierBills.length) continue;
    const chunk = carrierBills.filter((_, index) => index % 2 === (i >= carrierIds.length ? 1 : 0));
    const billsForRecon = chunk.length ? chunk : carrierBills;
    const total = round2(billsForRecon.reduce((sum, b) => sum + b.total, 0));
    const status = reconStatuses[i % reconStatuses.length];
    const confirmed = status === 'CONFIRMED' ? round2(total - (i === 2 ? 200 : 0)) : 0;
    const diff = status === 'CONFIRMED' ? round2(total - confirmed) : 0;
    const reconId = await insert(conn,
      `INSERT INTO reconciliation (recon_no, counterparty_type, counterparty_id, period_start, period_end, total_amount,
         confirmed_amount, difference_amount, status, sent_at, confirmed_at, created_by, created_at)
       VALUES (?, 'CARRIER', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`DZ${ymd(now)}${String(i + 1).padStart(3, '0')}`, carrierId, dateOnly(new Date(now.getTime() - 30 * 86400000)), dateOnly(now),
        total, confirmed, diff, status,
        ['DRAFT'].includes(status) ? null : at(now, -8), status === 'CONFIRMED' ? at(now, -4) : null,
        ref.userBy.settlement01.id, at(now, -10)]);
    for (const bill of billsForRecon) {
      const isDiff = status === 'DISPUTED' || (status === 'CONFIRMED' && diff > 0 && bill === billsForRecon[billsForRecon.length - 1]);
      await insert(conn,
        `INSERT INTO reconciliation_item (recon_id, bill_id, amount, confirmed_amount, difference_reason, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [reconId, bill.id, bill.total, isDiff ? round2(bill.total - 200) : bill.total,
          isDiff ? '运杂费/堆存费争议' : null, isDiff ? 'DIFF' : 'MATCH']);
    }
  }

  // ── 6) 保理 4 笔 / 保险 8 张 ────────────────────────────────────────
  const financePartner = ref.partners.find((p) => p.type === 'FINANCE');
  const insurer = ref.partners.find((p) => p.type === 'INSURANCE');
  const factoringStatuses = ['SUBMITTED', 'APPROVED', 'REJECTED', 'SETTLED'];
  for (let i = 0; i < 4 && i < receivableBills.length; i += 1) {
    const receivable = receivableBills[i];
    const amount = round2(receivable.total * 0.8);
    const rate = 6.5;
    const status = factoringStatuses[i];
    const fee = round2(amount * rate * 90 / 360 / 100);
    await insert(conn,
      `INSERT INTO factoring_application (app_no, order_id, bill_id, applicant_customer_id, finance_partner_id, amount,
         discount_rate, fee, status, applied_at, approved_at, settled_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`BLF${ymd(now)}${String(i + 1).padStart(3, '0')}`, receivable.order.id, receivable.id, receivable.customer.id,
        financePartner.id, amount, rate, fee, status, at(now, -12),
        ['APPROVED', 'SETTLED'].includes(status) ? at(now, -8) : null, status === 'SETTLED' ? at(now, -3) : null,
        ref.userBy.finance01.id]);
  }

  const policyOrders = orders.filter((o) => waybillByOrder.has(Number(o.id))).slice(0, 8);
  for (let i = 0; i < policyOrders.length; i += 1) {
    const order = policyOrders[i];
    const waybill = waybillByOrder.get(Number(order.id));
    const insuredAmount = 300000 + i * 50000;
    const rate = 0.12;
    await insert(conn,
      `INSERT INTO insurance_policy (policy_no, order_id, waybill_id, insurer_partner_id, insured_amount, rate, premium,
         status, effective_from, effective_to, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`BX${ymd(now)}${String(i + 1).padStart(4, '0')}`, order.id, waybill.id, insurer.id, insuredAmount, rate,
        round2(insuredAmount * rate / 100), ['ISSUED', 'ISSUED', 'ISSUED', 'EXPIRED'][i % 4],
        at(now, -24 * 3), at(now, 24 * 30), ref.userBy.insurance01.id, at(now, -24)]);
  }

  // ── 7) 经营分析日汇总 90 条（30 天 × 3 模式） ───────────────────────
  const modes = ['ROAD', 'SEA', 'RAIL'];
  for (let d = 29; d >= 0; d -= 1) {
    const statDate = new Date(now.getTime() - d * 86400000);
    for (let m = 0; m < modes.length; m += 1) {
      const ordersCount = 3 + ((d + m) % 5);
      const revenue = round2(12000 + (d * 137 + m * 2900) % 18000);
      const cost = round2(revenue * (0.78 + (m % 3) * 0.02));
      const profit = round2(revenue - cost);
      await insert(conn,
        `INSERT INTO stat_daily (stat_date, customer_id, mode, order_count, revenue, cost, profit, margin, created_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
        [dateOnly(statDate), modes[m], ordersCount, revenue, cost, profit, round2((profit / revenue) * 100), at(now, -d * 24)]);
    }
  }

  // ── 8) 审计/通知 ────────────────────────────────────────────────────
  const financeAudits = [
    ['BILL_SETTLE', '生成应收应付账单'], ['RECON_CREATE', '创建对账单'], ['RECON_CONFIRM', '确认对账单'],
    ['INVOICE_ISSUE', '开具发票'], ['INVOICE_VOID', '作废发票'], ['PAYMENT_CONFIRM', '支付回执确认'],
    ['FACTORING_APPROVE', '保理审批'], ['INSURANCE_CREATE', '投保'],
  ];
  for (let i = 0; i < 16; i += 1) {
    const [action, label] = financeAudits[i % financeAudits.length];
    await insert(conn,
      `INSERT INTO audit_log (user_id, username, role, action, action_label, module, target_type, target_id, detail, ip, created_at)
       VALUES (?, 'settlement01', 'SETTLEMENT', ?, ?, 'finance', 'STAGE4', ?, ?, '127.0.0.1', ?)`,
      [ref.userBy.settlement01.id, action, label, String(i + 1), JSON.stringify({ note: `Stage4 种子审计 #${i + 1}` }), at(now, -i % 10)]);
  }
  for (let i = 0; i < 6; i += 1) {
    await insert(conn,
      `INSERT INTO notification (user_id, role, type, title, content, related_type, related_id, read_flag, created_at)
       VALUES (?, ?, 'TODO', ?, ?, 'BILL', ?, 0, ?)`,
      [ref.userBy.settlement01.id, null,
        ['待开票账单', '待确认支付', '对账单差异待处理', '保理申请待审批', '保单待生效', '经营分析周报'][i],
        'Stage 4 种子通知，可在结算中心/财务页面查看。', String(receivableBills[i]?.id ?? 1), at(now, -i)]);
  }

  console.log(`[db] Stage4：应收 ${receivableBills.length}、应付 ${payableBills.length}、发票 ${invoiceCount}、支付 ${paymentCount}、对账 ${carrierIds.length}、保理 4、保单 ${policyOrders.length}、日汇总 90`);
  return { receivableBills, payableBills, invoiceCount, paymentCount, carrierIds, policyCount: policyOrders.length };
}
