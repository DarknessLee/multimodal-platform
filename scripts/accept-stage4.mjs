// Stage 4 API 验收：签收出账（应收+应付+明细）/ 对账 / 发票 / 支付核销 / 保理 / 保险 / 经营分析 / 权限
const API = process.env.API_BASE || 'http://127.0.0.1:8080/api';
const PASSWORD = 'demo123';
let passed = 0;
const tokens = {};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function ok(message, extra = '') {
  passed += 1;
  console.log(`  ✓ ${message}${extra ? `  (${extra})` : ''}`);
}
function section(title) {
  console.log(`\n── ${title} ──`);
}
function ymd(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
async function request(method, path, { body, token } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json, text };
}
async function api(method, path, options) {
  const { status, json } = await request(method, path, options);
  if (json?.code !== 0) throw new Error(`${method} ${path} 失败：HTTP ${status} / code=${json?.code} / ${json?.message || '无响应'}`);
  return json.data;
}
async function expectError(method, path, options, expectedCode, label) {
  const { status, json } = await request(method, path, options);
  assert(json?.code === expectedCode, `${label}：期望 code=${expectedCode}，实际 HTTP ${status} code=${json?.code} ${json?.message || ''}`);
  ok(label);
}
async function login(username) {
  const data = await api('POST', '/auth/login', { body: { username, password: PASSWORD } });
  tokens[username] = data.token;
  ok(`登录 ${username}`, data.user?.roleLabel);
  return data.token;
}

async function main() {
  console.log(`多式联运平台 Stage 4 · API 验收（${API}）`);
  for (const username of ['shipper01', 'mto01', 'carrier01', 'terminal01', 'settlement01', 'finance01', 'insurance01', 'admin01']) {
    await login(username);
  }

  section('1. 签收出账：应收 + 应付 + 明细');
  const order = await api('POST', '/orders', {
    token: tokens.shipper01,
    body: {
      cargoName: '光伏组件', cargoWeight: 22.5, containerType: '40HQ', containerCount: 2,
      origin: '上海嘉定', destination: '成都青白江', requiredPickupDate: ymd(new Date(Date.now() + 7 * 86400000)),
      remark: 'accept-stage4 结算闭环',
    },
  });
  const orderId = order.order.id;
  ok('创建订单', order.order.orderNo);
  const dispatched = await api('POST', `/orders/${orderId}/dispatch`, { token: tokens.mto01, body: { roadCarrierCode: 'AJ-001' } });
  const waybillId = dispatched.waybillId;
  const segments = dispatched.segments;
  assert(segments?.length === 3, '调度应生成 3 段');
  const road = segments.find((s) => s.mode === 'ROAD');
  const sea = segments.find((s) => s.mode === 'SEA');
  const rail = segments.find((s) => s.mode === 'RAIL');
  await api('POST', `/segments/${road.id}/status`, { token: tokens.carrier01, body: { action: 'ACCEPT' } });
  await api('POST', `/segments/${road.id}/status`, { token: tokens.carrier01, body: { action: 'DEPART' } });
  await api('POST', `/segments/${road.id}/status`, { token: tokens.carrier01, body: { action: 'ARRIVE' } });
  await api('POST', `/segments/${sea.id}/status`, { token: tokens.terminal01, body: { action: 'GATE_IN', conditionText: '箱况良好' } });
  await api('POST', `/segments/${sea.id}/status`, { token: tokens.terminal01, body: { action: 'ARRIVE' } });
  await api('POST', `/segments/${rail.id}/status`, { token: tokens.terminal01, body: { action: 'GATE_IN', conditionText: '箱况良好' } });
  await api('POST', `/segments/${rail.id}/status`, { token: tokens.terminal01, body: { action: 'ARRIVE' } });
  const signed = await api('POST', `/waybills/${waybillId}/sign`, { token: tokens.shipper01, body: { signerName: '李经理' } });
  assert(signed.order.status === 'SIGNED', '签收后订单应为 SIGNED');
  ok('全链路签收');

  const settled = await api('POST', `/orders/${orderId}/settle`, { token: tokens.settlement01 });
  const receivable = settled.bill;
  assert(receivable?.billType === 'RECEIVABLE', '应收账单类型应为 RECEIVABLE');
  assert(receivable.items?.length >= 3, '应收账单应包含 ≥3 条明细');
  const itemSum = receivable.items.reduce((sum, item) => sum + Number(item.amount), 0);
  assert(Math.abs(itemSum - Number(receivable.totalAmount)) < 0.02, `明细之和 ${itemSum} 应等于账单总额 ${receivable.totalAmount}`);
  assert(Number(receivable.taxAmount) > 0 && Number(receivable.profitAmount) > 0, '应收账单应含税额与毛利');
  assert(Array.isArray(settled.payableBills) && settled.payableBills.length >= 2, '应自动生成各段承运人应付账单');
  ok('签收自动出账（应收+应付）', `应收 ¥${receivable.totalAmount} / 应付 ${settled.payableBills.length} 张`);
  await expectError('POST', `/orders/${orderId}/settle`, { token: tokens.settlement01 }, 40901, '重复出账返回 40901（v0 冻结契约兼容）');

  const billDetail = await api('GET', `/bills/${receivable.id}`, { token: tokens.settlement01 });
  assert(billDetail.items?.length >= 3 && billDetail.order?.id === orderId, '账单详情应含明细与订单');
  ok('账单详情', `${billDetail.items.length} 条明细`);

  const orderList = await api('GET', '/orders?page=1&pageSize=100', { token: tokens.settlement01 });
  const list = Array.isArray(orderList) ? orderList : orderList.list;
  const uniqueIds = new Set(list.map((row) => row.id));
  assert(uniqueIds.size === list.length, `订单列表不应重复：行 ${list.length} / 唯一 id ${uniqueIds.size}`);
  ok('订单列表去重（Stage4 回归）', `${list.length} 行`);

  section('2. 对账');
  const payable = settled.payableBills[0];
  const payableDetail = await api('GET', `/bills/${payable.id ?? payable.billId}`, { token: tokens.settlement01 });
  const carrierId = payableDetail.bill.counterparty?.id ?? payableDetail.bill.counterpartyId;
  assert(carrierId, '应付账单应含承运人 id');
  const recon = await api('POST', '/reconciliations', {
    token: tokens.settlement01,
    body: { counterpartyType: 'CARRIER', counterpartyId: carrierId, periodStart: ymd(new Date(Date.now() - 30 * 86400000)), periodEnd: ymd(new Date()) },
  });
  assert(recon.status === 'DRAFT', '新对账单应为 DRAFT');
  const reconDetail = await api('GET', `/reconciliations/${recon.id}`, { token: tokens.settlement01 });
  assert(reconDetail.items?.length >= 1, '对账单应含明细');
  ok('创建对账单', `${recon.reconNo} / ${reconDetail.items.length} 条明细`);
  const sent = await api('POST', `/reconciliations/${recon.id}/send`, { token: tokens.settlement01 });
  assert(sent.status === 'SENT', '发送后应为 SENT');
  const confirmedRecon = await api('POST', `/reconciliations/${recon.id}/confirm`, {
    token: tokens.settlement01, body: { confirmedAmount: recon.totalAmount },
  });
  assert(confirmedRecon.status === 'CONFIRMED', '确认后应为 CONFIRMED');
  ok('对账发送→确认', `${recon.reconNo} / 确认额 ¥${confirmedRecon.confirmedAmount}`);

  const payable2 = settled.payableBills[1];
  const payable2Detail = await api('GET', `/bills/${payable2.id ?? payable2.billId}`, { token: tokens.settlement01 });
  const carrier2Id = payable2Detail.bill.counterparty?.id ?? payable2Detail.bill.counterpartyId;
  const recon2 = await api('POST', '/reconciliations', {
    token: tokens.settlement01,
    body: { counterpartyType: 'CARRIER', counterpartyId: carrier2Id, periodStart: ymd(new Date(Date.now() - 30 * 86400000)), periodEnd: ymd(new Date()) },
  });
  await api('POST', `/reconciliations/${recon2.id}/send`, { token: tokens.settlement01 });
  const disputed = await api('POST', `/reconciliations/${recon2.id}/dispute`, {
    token: tokens.settlement01, body: { reason: '堆存费差异 200 元', items: [] },
  });
  assert(disputed.status === 'DISPUTED', '异议后应为 DISPUTED');
  ok('对账差异（DISPUTED）', recon2.reconNo);

  section('3. 发票');
  const invoice = await api('POST', '/invoices', {
    token: tokens.settlement01,
    body: { billId: receivable.id, invoiceType: 'VAT_SPECIAL', title: receivable.counterparty?.name, taxNo: receivable.counterparty?.creditCode },
  });
  assert(invoice.status === 'ISSUED' && invoice.invoiceNo?.startsWith('FP'), '开票应生成 FP 发票号');
  assert(Number(invoice.taxAmount) > 0, '发票应含税额');
  ok('按账单开票', `${invoice.invoiceNo} / 税额 ¥${invoice.taxAmount}`);
  await expectError('POST', '/invoices', { token: tokens.settlement01, body: { billId: receivable.id, invoiceType: 'VAT_SPECIAL' } }, 40902, '重复开票返回 40902');
  const invoiceDetail = await api('GET', `/invoices/${invoice.id}`, { token: tokens.settlement01 });
  assert(invoiceDetail.billId === receivable.id, '发票详情应关联账单');
  const voided = await api('POST', `/invoices/${invoice.id}/void`, { token: tokens.settlement01 });
  assert(voided.status === 'VOID', '作废后应为 VOID');
  ok('发票作废');

  section('4. 支付与核销');
  const payment = await api('POST', '/payments', {
    token: tokens.settlement01,
    body: { direction: 'IN', billId: receivable.id, amount: receivable.totalAmount, method: 'BANK_TRANSFER' },
  });
  assert(payment.status === 'PENDING', '登记支付应为 PENDING');
  const confirmedPayment = await api('POST', `/payments/${payment.id}/confirm`, { token: tokens.settlement01 });
  assert(confirmedPayment.status === 'SUCCESS', '回执确认后应为 SUCCESS');
  assert(confirmedPayment.bankSerial, '回执应生成银行流水号');
  const paidBill = await api('GET', `/bills/${receivable.id}`, { token: tokens.settlement01 });
  assert(paidBill.bill.status === 'PAID', `全额核销后账单应为 PAID，实际 ${paidBill.bill.status}`);
  ok('支付回执 + 核销', `¥${confirmedPayment.amount} / ${confirmedPayment.bankSerial}`);
  await expectError('POST', '/payments', { token: tokens.settlement01, body: { direction: 'IN', billId: settled.payableBills[0].id ?? settled.payableBills[0].billId, amount: 99999999 } }, 42201, '支付金额超未核销金额返回 42201');

  section('5. 保理与保险');
  const otherReceivable = await api('GET', `/bills?billType=RECEIVABLE&status=ISSUED&page=1&pageSize=5`, { token: tokens.settlement01 });
  const factoringBill = otherReceivable.list.find((b) => b.id !== receivable.id);
  assert(factoringBill, '应有可保理的应收账单');
  const factoring = await api('POST', '/factoring/applications', {
    token: tokens.finance01,
    body: { billId: factoringBill.id, financePartnerId: 22, amount: factoringBill.totalAmount, discountRate: 6.5 },
  });
  assert(factoring.status === 'SUBMITTED', '保理申请应为 SUBMITTED');
  const approved = await api('POST', `/factoring/applications/${factoring.id}/approve`, { token: tokens.finance01, body: { approved: true } });
  assert(approved.status === 'APPROVED', '审批后应为 APPROVED');
  assert(Number(approved.fee) > 0, '保理应计算手续费');
  ok('保理申请→审批', `${factoring.appNo} / 手续费 ¥${approved.fee}`);

  const policy = await api('POST', '/insurance/policies', {
    token: tokens.insurance01, body: { orderId, insuredAmount: 500000, rate: 0.12 },
  });
  assert(policy.policyNo?.startsWith('BX') && Number(policy.premium) > 0, '保单应生成 BX 号与保费');
  ok('保险投保', `${policy.policyNo} / 保费 ¥${policy.premium}`);

  section('6. 经营分析与财务看板');
  const overview = await api('GET', '/analytics/overview?days=30', { token: tokens.finance01 });
  assert(Number(overview.kpis?.revenue) > 0 && Number(overview.kpis?.profit) > 0, '经营分析应返回收入/毛利');
  assert(Array.isArray(overview.arAging) && overview.arAging.length >= 3, '应返回 AR 账龄');
  ok('经营分析总览', `收入 ¥${overview.kpis.revenue} / 毛利率 ${overview.kpis.margin}%`);
  const trend = await api('GET', '/analytics/trend?days=14', { token: tokens.finance01 });
  assert(trend.dates?.length === 14, '趋势应返回 14 天');
  const byCustomer = await api('GET', '/analytics/by-customer', { token: tokens.finance01 });
  const byMode = await api('GET', '/analytics/by-mode', { token: tokens.finance01 });
  assert(Array.isArray(byCustomer) && byCustomer.length >= 1 && byMode.length >= 3, '客户/模式维度应返回数据');
  ok('趋势/客户/模式分析');
  const dashboard = await api('GET', '/finance/dashboard', { token: tokens.finance01 });
  assert(dashboard.arTotal !== undefined && dashboard.apTotal !== undefined, '财务看板应返回 AR/AP');
  ok('财务看板', `AR ¥${dashboard.arTotal} / AP ¥${dashboard.apTotal}`);

  section('7. 权限');
  await expectError('POST', '/invoices', { token: tokens.shipper01, body: { billId: receivable.id } }, 40301, '货主无权限开票（40301）');
  await expectError('POST', '/factoring/applications', { token: tokens.settlement01, body: { billId: factoringBill.id } }, 40301, '结算员无权限申请保理（40301）');
  await expectError('POST', '/insurance/policies', { token: tokens.settlement01, body: { orderId } }, 40301, '结算员无权限投保（40301）');
  const insuranceList = await api('GET', '/insurance/policies?page=1&pageSize=20', { token: tokens.insurance01 });
  assert(insuranceList.total >= 8, '保险机构应可查看保单列表');
  ok('保险机构保单可见');

  console.log(`\n✅ Stage 4 验收通过：${passed} 项断言`);
  console.log(`   订单 ${order.order.orderNo} → 应收 ¥${receivable.totalAmount} / 应付 ${settled.payableBills.length} 张 → 对账/发票/支付/保理/保单闭环`);
}

main().catch((error) => {
  console.error(`\n❌ Stage 4 验收失败：${error.message}`);
  process.exitCode = 1;
});
