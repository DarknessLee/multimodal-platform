// Stage 1 API 验收 v2：9 角色/RBAC、主数据、报价计价、合同 Mock 签章、双通道下单、履约、签收、账单、看板、集成、审计、通知
// 用法：先 npm run dev（或仅启动 API），再 npm run accept；可用 API_BASE 指向其他端口
const API = process.env.API_BASE || 'http://127.0.0.1:8080/api';
const PASSWORD = 'demo123';
const ROLE_USERS = [
  ['SHIPPER', 'shipper01'], ['FORWARDER', 'forwarder01'], ['MTO', 'mto01'],
  ['CARRIER', 'carrier01'], ['RAIL_CARRIER', 'rail01'], ['SEA_CARRIER', 'sea01'],
  ['TERMINAL', 'terminal01'], ['SETTLEMENT', 'settlement01'], ['ADMIN', 'admin01'],
];

let passed = 0;
const demo = { tokens: {}, users: {} };

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
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json };
}

async function api(method, path, options) {
  const { status, json } = await request(method, path, options);
  if (json?.code !== 0) {
    throw new Error(`${method} ${path} 失败：HTTP ${status} / code=${json?.code} / ${json?.message || '无响应'}`);
  }
  return json.data;
}

async function expectError(method, path, options, expectedCode, label) {
  const { status, json } = await request(method, path, options);
  assert(json?.code === expectedCode, `${label}：期望 code=${expectedCode}，实际 HTTP ${status} code=${json?.code} ${json?.message || ''}`);
  assert(status >= 400, `${label}：期望 HTTP 4xx，实际 ${status}`);
  ok(label);
}

async function login(username) {
  const data = await api('POST', '/auth/login', { body: { username, password: PASSWORD } });
  assert(typeof data.token === 'string' && data.token.length > 20, `${username} 登录未返回 token`);
  assert(Array.isArray(data.user?.permissions) && data.user.permissions.length > 0, `${username} 登录未返回权限集`);
  assert(Array.isArray(data.permissions), `${username} 顶层 permissions 缺失`);
  assert(Array.isArray(data.menus), `${username} menus 缺失`);
  demo.tokens[username] = data.token;
  demo.users[username] = data.user;
  ok(`登录 ${username}`, `${data.user.roleLabel} / 权限 ${data.user.permissions.length} 项`);
  return data.token;
}

function token(username) {
  return demo.tokens[username];
}

async function main() {
  console.log(`多式联运演示版 v0 · Stage 1 验收（${API}）`);

  section('1. 登录与 RBAC（9 角色）');
  for (const [, username] of ROLE_USERS) {
    await login(username);
  }
  assert(demo.users.mto01.role === 'MTO', 'mto01 角色码应为 MTO');
  assert(demo.users.shipper01.role === 'SHIPPER', 'shipper01 角色码应为 SHIPPER');
  ok('9 个角色登录与权限集校验通过');

  const me = await api('GET', '/auth/me', { token: token('mto01') });
  assert((me.permissions ?? me.user?.permissions)?.includes('menu:dashboard'), 'auth/me 应返回 dashboard 菜单权限');
  ok('GET /auth/me 返回用户与权限');

  await expectError('GET', '/orders', {}, 40101, '未登录访问订单返回 40101');
  await expectError('GET', '/audit/logs', { token: token('shipper01') }, 40301, '货主访问审计日志被拒绝（40301）');
  await expectError('POST', '/quotes', { token: token('carrier01'), body: {} }, 40301, '承运人创建询价被拒绝（40301）');

  section('2. 主数据');
  const customers = await api('GET', '/customers?keyword=远洋&page=1&pageSize=10', { token: token('mto01') });
  assert(Array.isArray(customers.list) && customers.list.length >= 1, '客户列表应返回分页结构');
  const customer = customers.list.find((c) => c.name.includes('远洋')) ?? customers.list[0];
  demo.customerId = customer.id;
  assert(customer.creditCode?.length === 18, '客户统一社会信用代码应为 18 位');
  ok('客户主数据', `${customer.name} / ${customer.creditCode}`);

  const routes = await api('GET', '/routes', { token: token('mto01') });
  assert(Array.isArray(routes) && routes.length >= 8, `线路模板应 ≥8，实际 ${routes?.length}`);
  assert(routes.some((r) => r.modes?.includes('SEA') && r.modes?.includes('RAIL')), '线路应包含公铁水组合');
  demo.routeId = routes[0].id;
  ok('线路模板', `${routes.length} 条，含公铁水组合`);

  const ports = await api('GET', '/ports', { token: token('mto01') });
  assert(Array.isArray(ports) && ports.length >= 15, '港站节点应 ≥15');
  ok('港站节点', `${ports.length} 个`);

  const goods = await api('GET', '/goods', { token: token('mto01') });
  const containerTypes = await api('GET', '/container-types', { token: token('mto01') });
  const dicts = await api('GET', '/dicts/order_status', { token: token('mto01') });
  assert(goods.length >= 15 && containerTypes.length === 5 && dicts.length >= 9, '货物/箱型/字典数量不符');
  ok('货物 / 箱型 / 字典', `${goods.length} / ${containerTypes.length} / ${dicts.length}`);

  const priceRules = await api('GET', '/price-rules?page=1&pageSize=50', { token: token('mto01') });
  assert(priceRules.total >= 40, `价格规则应 ≥40，实际 ${priceRules.total}`);
  ok('价格规则', `${priceRules.total} 条`);

  const createdRule = await api('POST', '/price-rules', {
    token: token('mto01'),
    body: {
      ruleName: '验收专用补充费规则', mode: 'OTHER', chargeType: 'SURCHARGE', containerTypeCode: '40HQ',
      customerId: demo.customerId, calcMethod: 'FLAT', unitPrice: 1,
      effectiveFrom: ymd(new Date()), effectiveTo: ymd(new Date(Date.now() + 365 * 86400000)), priority: 1,
    },
  });
  assert(createdRule.id > 0, '创建价格规则应返回 id');
  ok('创建价格规则（价格维护能力）', `rule id=${createdRule.id}`);

  const systems = await api('GET', '/integration/systems', { token: token('admin01') });
  assert(systems.length >= 6, `集成系统目录应 ≥6，实际 ${systems?.length}`);
  ok('集成系统目录', `${systems.length} 个外部系统`);

  section('3. 询价与自动计价');
  const requiredDate = ymd(new Date(Date.now() + 7 * 86400000));
  const quote = await api('POST', '/quotes', {
    token: token('shipper01'),
    body: {
      customerId: demo.customerId,
      orderType: 'ROAD_RAIL_SEA',
      routeTemplateId: demo.routeId,
      containerTypeCode: '40HQ',
      containerCount: 2,
      goodsCode: 'G001',
      cargoName: '光伏组件',
      cargoWeight: 22.5,
      requiredDate,
      remark: 'accept v2 询价',
    },
  });
  demo.quoteId = quote.id;
  assert(quote.status === 'DRAFT', `询价初始状态应为 DRAFT，实际 ${quote.status}`);
  assert(quote.quoteNo?.startsWith('BJ'), '报价单号应以 BJ 开头');
  assert(quote.items.length >= 3, `报价明细应 ≥3，实际 ${quote.items?.length}`);
  const itemSum = quote.items.reduce((sum, item) => sum + Number(item.amount), 0);
  assert(Math.abs(itemSum - Number(quote.totalAmount)) < 0.01, `报价总额 ${quote.totalAmount} 应等于明细之和 ${itemSum}`);
  assert(Number(quote.totalAmount) > 0 && Number(quote.costAmount) > 0, '报价总额/成本应大于 0');
  ok('货主创建询价', `${quote.quoteNo} / ¥${quote.totalAmount}`);
  ok('价格引擎分段计价', `明细 ${quote.items.length} 条 = 总额 ¥${quote.totalAmount}`);

  const quoteSent = await api('POST', `/quotes/${quote.id}/send`, { token: token('mto01') });
  assert(quoteSent.status === 'SENT', `发送后状态应为 SENT，实际 ${quoteSent.status}`);
  ok('MTO 发送报价');

  const sentQuotes = await api('GET', '/quotes?status=SENT&page=1&pageSize=50', { token: token('mto01') });
  assert(sentQuotes.list.some((row) => row.id === quote.id), '报价列表应能按 SENT 过滤到该报价');
  ok('报价列表状态过滤');

  section('4. 合同（Mock CA 签章）');
  const contract = await api('POST', '/contracts', {
    token: token('mto01'),
    body: {
      customerId: demo.customerId,
      contractType: 'FRAMEWORK',
      title: 'Stage1 验收框架合同',
      effectiveFrom: ymd(new Date()),
      effectiveTo: ymd(new Date(Date.now() + 365 * 86400000)),
      paymentTerms: '月结30天',
      creditLimit: 2000000,
      discountRate: 3,
    },
  });
  demo.contractId = contract.id;
  assert(contract.status === 'DRAFT', `合同初始状态应为 DRAFT，实际 ${contract.status}`);
  assert(contract.contractNo?.startsWith('HT'), '合同号应以 HT 开头');
  ok('MTO 创建框架合同', contract.contractNo);

  const contractSent = await api('POST', `/contracts/${contract.id}/send`, { token: token('mto01') });
  assert(contractSent.status === 'PENDING_SIGN', `发送后合同应为 PENDING_SIGN，实际 ${contractSent.status}`);
  ok('发送合同给货主');

  const signed = await api('POST', `/contracts/${contract.id}/sign`, {
    token: token('shipper01'),
    body: { signerName: '王海' },
  });
  assert(signed.status === 'SIGNED', `签章后合同应为 SIGNED，实际 ${signed.status}`);
  assert(typeof signed.signHash === 'string' && signed.signHash.length === 64, '签章哈希应为 64 位 SHA-256');
  ok('货主 Mock CA 签章', `signHash=${signed.signHash.slice(0, 12)}…`);
  const contractDetail = await api('GET', `/contracts/${contract.id}`, { token: token('shipper01') });
  assert(contractDetail.signHash === signed.signHash, '合同详情应返回签章哈希');
  ok('合同详情与签章哈希');
  const signedContracts = await api('GET', '/contracts?status=SIGNED&page=1&pageSize=50', { token: token('mto01') });
  assert(signedContracts.list.some((row) => row.id === contract.id), '合同列表应能按 SIGNED 过滤');
  ok('合同列表状态过滤');
  await expectError('POST', `/contracts/${contract.id}/send`, { token: token('shipper01') }, 40301, '货主无权限发送合同（40301）');

  section('5. 接受报价生成订单');
  const accepted = await api('POST', `/quotes/${quote.id}/accept`, {
    token: token('shipper01'),
    body: { contractId: contract.id },
  });
  demo.quoteOrderId = accepted.orderId;
  assert(Number(accepted.orderId) > 0, '接受报价应返回订单 id');
  ok('接受报价生成订单', `${accepted.orderNo} / 订单 id=${accepted.orderId}`);

  const quoteOrder = await api('GET', `/orders/${demo.quoteOrderId}`, { token: token('shipper01') });
  assert(['CONTRACTED', 'CONFIRMED'].includes(quoteOrder.order.status), `报价转单订单状态应为 CONTRACTED/CONFIRMED，实际 ${quoteOrder.order.status}`);
  assert(quoteOrder.order.source === 'QUOTE', '报价转单 source 应为 QUOTE');
  assert(quoteOrder.contract?.id === contract.id, '订单应关联已签合同');
  assert(Array.isArray(quoteOrder.cargoLines) && quoteOrder.cargoLines.length >= 1, '订单详情应返回货物行');
  ok('报价转单订单详情', `货物行 ${quoteOrder.cargoLines.length} / 金额 ¥${quoteOrder.order.totalAmount}`);

  section('6. 快速下单（v0 兼容 + 多货物行）');
  const quick = await api('POST', '/orders', {
    token: token('shipper01'),
    body: {
      customerId: demo.customerId,
      cargoName: '汽车零部件',
      cargoWeight: 18.2,
      containerType: '40HQ',
      containerCount: 2,
      origin: '上海嘉定',
      destination: '成都青白江',
      requiredPickupDate: requiredDate,
      remark: 'accept v2 快速单（多货物行）',
      cargoLines: [
        { goodsCode: 'G002', goodsName: '汽车零部件', quantity: 1, unit: '箱', weightT: 10.1, containerType: '40HQ', containerCount: 1, packaging: '纸箱' },
        { goodsCode: 'G008', goodsName: '电子元器件', quantity: 1, unit: '箱', weightT: 8.1, containerType: '40HQ', containerCount: 1, packaging: '防静电箱' },
      ],
    },
  });
  demo.quickOrderId = quick.order.id;
  assert(quick.order.status === 'CREATED', `快速单状态应为 CREATED，实际 ${quick.order.status}`);
  assert(quick.order.source === 'QUICK', '快速单 source 应为 QUICK');
  assert(quick.order.containerCount === 2, `快速单箱量应为 2，实际 ${quick.order.containerCount}`);
  assert(quick.cargoLines.length === 2, `快速单货物行应为 2，实际 ${quick.cargoLines?.length}`);
  ok('快速下单（多货物行）', `${quick.order.orderNo} / 2 行货物`);

  const cancelable = await api('POST', '/orders', {
    token: token('shipper01'),
    body: {
      cargoName: '待取消测试货物', cargoWeight: 5, containerType: '20GP', containerCount: 1,
      origin: '上海嘉定', destination: '成都青白江', requiredPickupDate: requiredDate, remark: 'accept v2 取消测试',
    },
  });
  const cancelled = await api('POST', `/orders/${cancelable.order.id}/cancel`, { token: token('shipper01') });
  const cancelledStatus = cancelled.order?.status ?? cancelled.status;
  assert(cancelledStatus === 'CANCELLED', `取消后订单状态应为 CANCELLED，实际 ${cancelledStatus}`);
  ok('未调度订单可取消');
  await expectError('POST', `/orders/${quick.order.id}/cancel`, { token: token('carrier01') }, 40301, '承运人无权限取消订单（40301）');

  await expectError('GET', `/orders/${demo.quoteOrderId}/dispatch`, { token: token('shipper01') }, 40401, '错误方法访问调度接口返回 40401');

  section('7. 调度与履约');
  const mtoDetail = await api('GET', `/orders/${demo.quoteOrderId}`, { token: token('mto01') });
  assert(mtoDetail.availableRoadCarriers.length === 3, 'MTO 应看到 3 家公路承运商');
  const dispatched = await api('POST', `/orders/${demo.quoteOrderId}/dispatch`, {
    token: token('mto01'),
    body: { roadCarrierCode: 'AJ-001' },
  });
  demo.waybillId = dispatched.waybillId;
  assert(dispatched.segments.length === 3, `调度应生成 3 个分段，实际 ${dispatched.segments?.length}`);
  const afterDispatch = await api('GET', `/orders/${demo.quoteOrderId}`, { token: token('mto01') });
  assert(afterDispatch.order.status === 'DISPATCHED', `调度后订单应为 DISPATCHED，实际 ${afterDispatch.order.status}`);
  ok('MTO 调度生成运单与 3 分段', dispatched.waybillNo);

  const segmentation = afterDispatch.segments;
  const road = segmentation.find((s) => s.mode === 'ROAD');
  const sea = segmentation.find((s) => s.mode === 'SEA');
  const rail = segmentation.find((s) => s.mode === 'RAIL');
  const carrierAccept = await api('POST', `/segments/${road.id}/status`, { token: token('carrier01'), body: { action: 'ACCEPT' } });
  assert(carrierAccept.segment.status === 'ACCEPTED', '公路段接单后应为 ACCEPTED');
  const carrierDepart = await api('POST', `/segments/${road.id}/status`, { token: token('carrier01'), body: { action: 'DEPART' } });
  assert(carrierDepart.orderStatus === 'IN_TRANSIT', '已提货后订单应为 IN_TRANSIT');
  const carrierArrive = await api('POST', `/segments/${road.id}/status`, { token: token('carrier01'), body: { action: 'ARRIVE' } });
  assert(carrierArrive.segment.status === 'COMPLETED', '公路送达后应为 COMPLETED');
  ok('公路承运人：接单 → 已提货 → 已送达');

  const seaGateIn = await api('POST', `/segments/${sea.id}/status`, { token: token('terminal01'), body: { action: 'GATE_IN', conditionText: '箱况良好，无破损' } });
  assert(seaGateIn.segment.status === 'IN_TRANSIT', '海运进场后应为 IN_TRANSIT');
  const seaArrive = await api('POST', `/segments/${sea.id}/status`, { token: token('terminal01'), body: { action: 'ARRIVE' } });
  assert(seaArrive.segment.status === 'COMPLETED', '海运到港后应为 COMPLETED');
  const railGateIn = await api('POST', `/segments/${rail.id}/status`, { token: token('terminal01'), body: { action: 'GATE_IN', conditionText: '箱况良好' } });
  assert(railGateIn.segment.status === 'IN_TRANSIT', '铁路进场后应为 IN_TRANSIT');
  const railArrive = await api('POST', `/segments/${rail.id}/status`, { token: token('terminal01'), body: { action: 'ARRIVE' } });
  assert(railArrive.orderStatus === 'ARRIVED', '铁路到站后订单应为 ARRIVED');
  ok('港站：海运进场/到港 + 铁路进场/到站');

  const track = await api('GET', `/waybills/${demo.waybillId}/track`, { token: token('shipper01') });
  assert(track.points.length >= 8, `轨迹点应 ≥8，实际 ${track.points?.length}`);
  const sources = new Set(track.points.map((p) => p.source));
  for (const source of ['MOCK_GPS', 'CARRIER_REPORT', 'TERMINAL_REPORT', 'MOCK_EDI']) {
    assert(sources.has(source), `轨迹缺少来源 ${source}（实际 ${[...sources].join(',')}）`);
  }
  ok('全程轨迹四类来源齐全', `${track.points.length} 个点`);

  section('8. 签收与账单');
  const signedWb = await api('POST', `/waybills/${demo.waybillId}/sign`, { token: token('shipper01'), body: { signerName: '李经理' } });
  assert(signedWb.order.status === 'SIGNED', '签收后订单应为 SIGNED');
  ok('货主签收');

  const bill = await api('POST', `/orders/${demo.quoteOrderId}/settle`, { token: token('settlement01') });
  demo.billId = bill.bill.id;
  const segSum = afterDispatch.segments.reduce((sum, s) => sum + Number(s.costAmount), 0);
  assert(Math.abs(Number(bill.bill.totalAmount) - segSum) < 0.01, `账单总额 ${bill.bill.totalAmount} 应等于分段之和 ${segSum}`);
  assert(bill.breakdown.length === 3, '账单应含 3 条分段明细');
  ok('结算生成分段账单', `${bill.bill.billNo} / ¥${bill.bill.totalAmount}`);

  const billDetail = await api('GET', `/bills/${demo.billId}`, { token: token('shipper01') });
  assert(billDetail.bill.statusLabel === '已出账', '账单中文状态应为已出账');
  ok('货主查看账单');

  const quoteOrders = await api('GET', '/orders?source=QUOTE', { token: token('shipper01') });
  assert(quoteOrders.some((row) => row.id === demo.quoteOrderId), '订单列表应能按来源 QUOTE 过滤');
  ok('订单列表来源过滤');

  section('9. 看板');
  const summary = await api('GET', '/dashboard/summary', { token: token('admin01') });
  assert(summary.kpis.ordersTotal >= 20, `看板订单总数应 ≥20，实际 ${summary.kpis.ordersTotal}`);
  assert(Array.isArray(summary.statusDistribution) && summary.statusDistribution.length > 0, '状态分布不应为空');
  assert(summary.integration.total >= 40, `集成报文应 ≥40，实际 ${summary.integration.total}`);
  ok('看板 KPI/状态分布/集成健康', `订单 ${summary.kpis.ordersTotal} / 报文 ${summary.integration.total}`);

  const shipperSummary = await api('GET', '/dashboard/summary', { token: token('shipper01') });
  assert(Number(shipperSummary.kpis.ordersTotal) > 0, '货主看板应有数据');
  ok('货主看板按角色裁剪', `订单 ${shipperSummary.kpis.ordersTotal} / 待办 ${shipperSummary.todos.length}`);

  const trend = await api('GET', '/dashboard/trend?days=14', { token: token('mto01') });
  assert(trend.dates.length === 14 && trend.orders.length === 14 && trend.revenue.length === 14, '趋势应返回 14 天数组');
  ok('14 天趋势数据');

  section('10. 集成 / 审计 / 通知');
  const allMessages = await api('GET', '/integration/messages?page=1&pageSize=1', { token: token('admin01') });
  assert(allMessages.total >= 40, `集成报文应 ≥40，实际 ${allMessages.total}`);
  const failedMessages = await api('GET', '/integration/messages?status=FAILED&page=1&pageSize=5', { token: token('admin01') });
  const failed = failedMessages.list;
  assert(failed.length >= 1, '应存在 FAILED 报文用于重试演示');
  const retried = await api('POST', `/integration/messages/${failed[0].id}/retry`, { token: token('admin01') });
  assert(retried.status === 'SUCCESS', `重试后报文应为 SUCCESS，实际 ${retried.status}`);
  ok('集成报文查询与失败重试', `${allMessages.total} 条 / 重试 ${failed[0].msgNo}`);

  const contractMessages = await api('GET', `/integration/messages?relatedType=CONTRACT&relatedId=${contract.id}&page=1&pageSize=20`, { token: token('admin01') });
  assert(contractMessages.total >= 1, '合同签署应写入 CA 集成报文');
  ok('合同签章产生 CA 集成报文');
  const dispatchMessages = await api('GET', `/integration/messages?relatedType=WAYBILL&relatedId=${demo.waybillId}&page=1&pageSize=20`, { token: token('admin01') });
  assert(dispatchMessages.total >= 1, '调度应写入铁路 95306 集成报文');
  ok('调度产生 95306 集成报文');

  const audits = await api('GET', '/audit/logs?page=1&pageSize=100', { token: token('admin01') });
  assert(audits.total >= 30, `审计日志应 ≥30，实际 ${audits.total}`);
  assert(audits.list.some((row) => ['CONTRACT_SIGN', 'QUOTE_ACCEPT', 'ORDER_DISPATCH'].includes(row.action)), '审计日志应包含本次写操作');
  ok('审计日志', `${audits.total} 条，含本次操作`);

  const notifications = await api('GET', '/notifications', { token: token('mto01') });
  assert(Array.isArray(notifications) && notifications.length >= 1, 'MTO 应有站内通知');
  const unread = notifications.find((n) => !n.readFlag);
  if (unread) {
    await api('POST', `/notifications/${unread.id}/read`, { token: token('mto01') });
    ok('站内通知已读', unread.title);
  } else {
    ok('站内通知列表', `${notifications.length} 条`);
  }

  console.log(`\n✅ Stage 1 验收通过：${passed} 项断言全部通过`);
  console.log(`   询价 ${quote.quoteNo} → 合同 ${contract.contractNo} → 订单 ${accepted.orderNo} → 运单 ${dispatched.waybillNo} → 账单 ¥${bill.bill.totalAmount}`);
}

main().catch((err) => {
  console.error(`\n❌ Stage 1 验收失败：${err.message}`);
  process.exitCode = 1;
});
