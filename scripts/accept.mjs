// 端到端 API 验收：登录 → 下单 → 调度 → 公路/海运/铁路节点 → 轨迹 → 签收 → 出账
// 用法：先 npm run dev（或仅启动 API），再 npm run accept
const API = process.env.API_BASE || 'http://127.0.0.1:8080/api';
const PASSWORD = 'demo123';

let passed = 0;
const demo = {};

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
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
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
  assert(data.user?.username === username, `${username} 登录返回用户不匹配`);
  ok(`登录 ${username}`, data.user.roleLabel);
  return data.token;
}

function findSegment(segments, mode) {
  const segment = segments.find((s) => s.mode === mode);
  assert(segment, `未找到 ${mode} 分段`);
  return segment;
}

async function main() {
  console.log(`多式联运演示版 v0 · API 验收（${API}）`);

  // 0. 服务可达性
  try {
    await login('shipper01');
  } catch (err) {
    throw new Error(`无法登录，请先确认 API 已启动（npm run dev）：${err.message}`);
  }

  section('1. 货主下单');
  const shipperToken = await login('shipper01');
  const order = await api('POST', '/orders', {
    token: shipperToken,
    body: {
      cargoName: '汽车配件',
      cargoWeight: 18.2,
      containerType: '40HQ',
      containerCount: 2,
      origin: '上海嘉定',
      destination: '成都青白江',
      requiredPickupDate: ymd(new Date(Date.now() + 86400000)),
      remark: 'accept 脚本自动创建',
    },
  });
  demo.orderId = order.order.id;
  demo.orderNo = order.order.orderNo;
  assert(order.order.status === 'CREATED', `下单后状态应为 CREATED，实际 ${order.order.status}`);
  assert(order.order.statusLabel === '待调度', '下单后中文状态应为「待调度」');
  assert(order.containers.length === 2, `箱量应为 2，实际 ${order.containers.length}`);
  assert(order.order.orderNo.startsWith('MO'), '订单号应以 MO 开头');
  ok('创建订单', `${demo.orderNo} / ${order.order.cargoName} / 2 箱`);
  for (const c of order.containers) {
    assert(c.containerNo && c.status === 'EMPTY', '新订单箱应为空箱且生成箱号');
  }
  ok('自动生成集装箱档案', order.containers.map((c) => c.containerNo).join(', '));

  const listAsShipper = await api('GET', '/orders', { token: shipperToken });
  assert(Array.isArray(listAsShipper) && listAsShipper.some((o) => o.id === demo.orderId), '货主列表应包含新订单');
  const listed = listAsShipper.find((o) => o.id === demo.orderId);
  assert(listed.statusLabel === '待调度', '列表中文状态应为「待调度」');
  ok('货主订单列表（仅自己的单）', `共 ${listAsShipper.length} 条`);

  const detailAsShipper = await api('GET', `/orders/${demo.orderId}`, { token: shipperToken });
  assert(detailAsShipper.availableRoadCarriers.length === 0, '货主不应看到承运商报价');
  ok('货主详情不暴露调度候选承运商');

  // 2. MTO 调度
  section('2. MTO 调度');
  const mtoToken = await login('mto01');
  const detailAsMto = await api('GET', `/orders/${demo.orderId}`, { token: mtoToken });
  assert(detailAsMto.availableRoadCarriers.length === 3, 'MTO 应看到 3 家公路承运商');
  assert(detailAsMto.segments.length === 0, '调度前不应有分段');
  ok('MTO 查看待调度订单与 3 家承运商报价');

  const dispatched = await api('POST', `/orders/${demo.orderId}/dispatch`, {
    token: mtoToken,
    body: { roadCarrierCode: 'AJ-001' },
  });
  demo.waybillId = dispatched.waybillId;
  demo.waybillNo = dispatched.waybillNo;
  assert(demo.waybillId > 0, '调度未返回运单 id');
  assert(dispatched.segments.length === 3, `调度应生成 3 个分段，实际 ${dispatched.segments.length}`);
  assert(dispatched.segments.map((s) => s.mode).join(',') === 'ROAD,SEA,RAIL', '分段顺序应为 公路→海运→铁路');
  assert(dispatched.segments[0].costAmount === 1280, '公路段费用应为所选报价 1280');
  assert(dispatched.segments[1].costAmount === 5200 && dispatched.segments[2].costAmount === 8600, '海运/铁路段费用应为 5200/8600');
  ok('MTOD 调度生成运单与 3 分段', `${demo.waybillNo} / ¥${dispatched.segments.reduce((s, x) => s + x.costAmount, 0)}`);

  const afterDispatch = await api('GET', `/orders/${demo.orderId}`, { token: mtoToken });
  assert(afterDispatch.order.status === 'DISPATCHED', `调度后订单状态应为 DISPATCHED，实际 ${afterDispatch.order.status}`);
  assert(afterDispatch.order.statusLabel === '已调度', '调度后中文状态应为「已调度」');
  assert(afterDispatch.waybill?.status === 'PENDING', '运单初始状态应为 PENDING');
  ok('订单状态：待调度 → 已调度');

  const settleTooEarly = await request('POST', `/orders/${demo.orderId}/settle`, { token: (await login('settlement01')) });
  assert(settleTooEarly.json?.code === 40901, `未签收就出账应返回 40901，实际 ${settleTooEarly.json?.code}`);
  ok('状态机拦截：未签收不能出账');

  const segments = afterDispatch.segments;
  const roadSeg = findSegment(segments, 'ROAD');
  const seaSeg = findSegment(segments, 'SEA');
  const railSeg = findSegment(segments, 'RAIL');

  // 3. 公路承运人
  section('3. 公路承运人上报节点');
  const carrierToken = await login('carrier01');
  const accept = await api('POST', `/segments/${roadSeg.id}/status`, { token: carrierToken, body: { action: 'ACCEPT' } });
  assert(accept.segment.status === 'ACCEPTED', `接单后状态应为 ACCEPTED，实际 ${accept.segment.status}`);
  assert(accept.segment.acceptedAt, '接单时间未记录');
  ok('司机接单', accept.segment.statusLabel);

  const depart = await api('POST', `/segments/${roadSeg.id}/status`, { token: carrierToken, body: { action: 'DEPART' } });
  assert(depart.segment.status === 'IN_TRANSIT', `已提货后状态应为 IN_TRANSIT，实际 ${depart.segment.status}`);
  assert(depart.segment.actualStart, '未记录实际发车时间');
  assert(depart.orderStatus === 'IN_TRANSIT', '订单应进入运输中');
  assert(depart.waybillStatus === 'IN_TRANSIT', '运单应进入运输中');
  assert(depart.newTrackPoints.length >= 1, '已提货应追加轨迹点');
  ok('上报「已提货」', `新增轨迹 ${depart.newTrackPoints.length} 条`);

  const roadArrive = await api('POST', `/segments/${roadSeg.id}/status`, { token: carrierToken, body: { action: 'ARRIVE' } });
  assert(roadArrive.segment.status === 'COMPLETED', `送达后分段应为 COMPLETED，实际 ${roadArrive.segment.status}`);
  assert(roadArrive.segment.actualEnd, '未记录实际到达时间');
  assert(roadArrive.orderStatus === 'IN_TRANSIT', '公路段完成时订单应仍为运输中');
  ok('上报「已送达」公路段完成');

  const wrongRole = await request('POST', `/segments/${seaSeg.id}/status`, { token: carrierToken, body: { action: 'GATE_IN' } });
  assert(wrongRole.json?.code === 40301, `承运人操作海运段应 40301，实际 ${wrongRole.json?.code}`);
  ok('权限拦截：承运人不能操作海运段');

  // 4. 港站
  section('4. 港站进场与到港确认');
  const terminalToken = await login('terminal01');
  const seaGateIn = await api('POST', `/segments/${seaSeg.id}/status`, {
    token: terminalToken,
    body: { action: 'GATE_IN', conditionText: '箱况良好，无破损' },
  });
  assert(seaGateIn.segment.status === 'IN_TRANSIT', `海运进场后状态应为 IN_TRANSIT，实际 ${seaGateIn.segment.status}`);
  assert(seaGateIn.containers.some((c) => c.conditionText?.includes('箱况')), '箱况录入未写回箱档案');
  assert(seaGateIn.newTrackPoints.length >= 1, '进场确认应追加轨迹');
  ok('洋山港确认进场 + 录入箱况');

  const seaArrive = await api('POST', `/segments/${seaSeg.id}/status`, { token: terminalToken, body: { action: 'ARRIVE' } });
  assert(seaArrive.segment.status === 'COMPLETED', `海运到港后应为 COMPLETED，实际 ${seaArrive.segment.status}`);
  ok('阳逻港到港确认，海运段完成');

  const railGateIn = await api('POST', `/segments/${railSeg.id}/status`, {
    token: terminalToken,
    body: { action: 'GATE_IN', conditionText: '箱况良好，无破损' },
  });
  assert(railGateIn.segment.status === 'IN_TRANSIT', `铁路进场后应为 IN_TRANSIT，实际 ${railGateIn.segment.status}`);
  ok('吴家山站确认进场');

  const railArrive = await api('POST', `/segments/${railSeg.id}/status`, { token: terminalToken, body: { action: 'ARRIVE' } });
  assert(railArrive.segment.status === 'COMPLETED', `铁路到站后应为 COMPLETED，实际 ${railArrive.segment.status}`);
  assert(railArrive.orderStatus === 'ARRIVED', `铁路完成后订单应为 ARRIVED，实际 ${railArrive.orderStatus}`);
  assert(railArrive.waybillStatus === 'ARRIVED', `铁路完成后运单应为 ARRIVED，实际 ${railArrive.waybillStatus}`);
  ok('成都城厢站到站，订单/运单 → 已到达');

  // 5. 轨迹
  section('5. 全程 mock 轨迹');
  const track = await api('GET', `/waybills/${demo.waybillId}/track`, { token: shipperToken });
  assert(track.segments.length === 3, '轨迹页应返回 3 个分段');
  assert(track.points.length >= 8, `轨迹点应 ≥ 8，实际 ${track.points.length}`);
  const sources = new Set(track.points.map((p) => p.source));
  for (const source of ['MOCK_GPS', 'CARRIER_REPORT', 'TERMINAL_REPORT', 'MOCK_EDI']) {
    assert(sources.has(source), `轨迹缺少来源 ${source}（实际：${[...sources].join(',')}）`);
  }
  const times = track.points.map((p) => new Date(p.occurredAt).getTime());
  assert(times.every((t, i) => i === 0 || t >= times[i - 1]), '轨迹点时间应升序');
  for (const p of track.points) {
    assert(typeof p.lng === 'number' && typeof p.lat === 'number', `轨迹点缺少经纬度：${p.nodeName}`);
  }
  ok('轨迹完整（GPS + 各角色上报 + EDI mock）', `${track.points.length} 个点 / ${[...sources].join(', ')}`);

  // 6. 签收
  section('6. 货主签收');
  const sign = await api('POST', `/waybills/${demo.waybillId}/sign`, {
    token: shipperToken,
    body: { signerName: '李经理' },
  });
  assert(sign.waybill.status === 'SIGNED', '签收后运单应为 SIGNED');
  assert(sign.waybill.signerName === '李经理', '签收人未记录');
  assert(sign.order.status === 'SIGNED', '签收后订单应为 SIGNED');
  ok('签收成功，订单 → 已签收');

  const signAgain = await request('POST', `/waybills/${demo.waybillId}/sign`, {
    token: shipperToken,
    body: { signerName: '李经理' },
  });
  assert(signAgain.json?.code === 40901, `重复签收应 40901，实际 ${signAgain.json?.code}`);
  ok('状态机拦截：重复签收');

  // 7. 结算出账
  section('7. 结算生成分段账单');
  const settlementToken = await login('settlement01');
  const bill = await api('POST', `/orders/${demo.orderId}/settle`, { token: settlementToken });
  demo.billId = bill.bill.id;
  assert(bill.bill.totalAmount === 15080, `账单总额应为 15080，实际 ${bill.bill.totalAmount}`);
  assert(bill.breakdown.length === 3, '账单应含 3 条分段明细');
  const sum = bill.breakdown.reduce((acc, b) => acc + b.amount, 0);
  assert(sum === bill.bill.totalAmount, `分段费用之和 ${sum} 与总额 ${bill.bill.totalAmount} 不一致`);
  ok('生成分段账单', `${bill.bill.billNo} / ¥${bill.bill.totalAmount}`);

  const orderAfterBill = await api('GET', `/orders/${demo.orderId}`, { token: shipperToken });
  assert(orderAfterBill.order.status === 'BILLED', `出账后订单应为 BILLED，实际 ${orderAfterBill.order.status}`);
  assert(orderAfterBill.bill?.id === demo.billId, '订单详情应能看到账单');
  ok('货主端可见账单，订单 → 已出账');

  const billDetail = await api('GET', `/bills/${demo.billId}`, { token: shipperToken });
  assert(billDetail.bill.statusLabel === '已出账', '账单中文状态应为「已出账」');
  assert(billDetail.breakdown.map((b) => b.mode).join(',') === 'ROAD,SEA,RAIL', '账单分段顺序应为 公路→海运→铁路');
  ok('账单详情：分段明细与中文状态正确');

  const settleAgain = await request('POST', `/orders/${demo.orderId}/settle`, { token: settlementToken });
  assert(settleAgain.json?.code === 40901, `重复出账应 40901，实际 ${settleAgain.json?.code}`);
  ok('状态机拦截：重复出账');

  // 8. 权限与过滤
  section('8. 权限与角色过滤');
  const carrierDispatch = await request('POST', `/orders/${demo.orderId}/dispatch`, {
    token: carrierToken,
    body: { roadCarrierCode: 'AJ-001' },
  });
  assert(carrierDispatch.json?.code === 40301, `承运人调度应 40301，实际 ${carrierDispatch.json?.code}`);
  ok('权限拦截：承运人不能调度');
  const shipperSettle = await request('POST', `/orders/${demo.orderId}/settle`, { token: shipperToken });
  assert(shipperSettle.json?.code === 40301, `货主出账应 40301，实际 ${shipperSettle.json?.code}`);
  ok('权限拦截：货主不能出账');

  const carrierOrders = await api('GET', '/orders', { token: carrierToken });
  assert(carrierOrders.some((o) => o.id === demo.orderId), '承运人列表应包含自己承运的订单');
  ok('承运人列表可见自己承运的订单', `${carrierOrders.length} 条`);
  const settlementOrders = await api('GET', '/orders', { token: settlementToken });
  assert(settlementOrders.some((o) => o.id === demo.orderId), '结算列表应包含已出账订单');
  assert(settlementOrders.every((o) => ['SIGNED', 'BILLED'].includes(o.status)), '结算列表只应含已签收/已出账订单');
  ok('结算列表按角色过滤', `${settlementOrders.length} 条`);

  console.log(`\n✅ 验收通过：${passed} 项断言全部通过`);
  console.log(`   订单 ${demo.orderNo} · 运单 ${demo.waybillNo} · 账单 ¥15080`);
}

main().catch((err) => {
  console.error(`\n❌ 验收失败：${err.message}`);
  process.exitCode = 1;
});
