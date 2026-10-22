// Stage 3 API 验收：三方案生成/确认签发 / 运力池 / 调度看板 / 监控大屏 / 预警工单 / IoT / 权限
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
  console.log(`多式联运平台 Stage 3 · API 验收（${API}）`);
  await login('shipper01');
  await login('mto01');
  await login('carrier01');
  await login('admin01');

  section('1. 准备订单并生成三套调度方案');
  const order = await api('POST', '/orders', {
    token: tokens.shipper01,
    body: {
      cargoName: '光伏组件', cargoWeight: 22.5, containerType: '40HQ', containerCount: 2,
      origin: '上海嘉定', destination: '成都青白江', requiredPickupDate: ymd(new Date(Date.now() + 7 * 86400000)),
      remark: 'accept-stage3 智能调度',
    },
  });
  const orderId = order.order.id;
  const orderNo = order.order.orderNo;
  ok('创建待调度订单', orderNo);

  const generated = await api('POST', '/dispatch/plans/generate', { token: tokens.mto01, body: { orderId } });
  assert(Array.isArray(generated.plans) && generated.plans.length === 3, '应生成 3 套方案');
  const plans = generated.plans;
  const byStrategy = Object.fromEntries(plans.map((plan) => [plan.strategy, plan]));
  assert(byStrategy.COST && byStrategy.TIME && byStrategy.BALANCED, '方案应包含 COST/TIME/BALANCED');
  assert(plans.every((plan) => plan.items?.length >= 3), '每套方案应包含 ≥3 个分段');
  assert(plans.every((plan) => plan.status === 'DRAFT'), '新生成方案应为 DRAFT');
  ok('生成三套方案', plans.map((p) => `${p.strategy} ¥${p.totalCost} ${p.totalHours}h 评分${p.score}`).join(' | '));
  assert(Number(byStrategy.COST.totalCost) <= Number(byStrategy.TIME.totalCost), 'COST 方案总价应不高于 TIME');
  assert(Number(byStrategy.TIME.totalHours) <= Number(byStrategy.COST.totalHours), 'TIME 方案总时长应不长于 COST');
  ok('策略特征校验（成本最低/时长最短）');
  assert(plans.every((plan) => Number(plan.score) >= 0 && Number(plan.score) <= 100), '方案评分应在 0~100');
  ok('方案评分区间校验');
  const costPlan = plans[0];
  const itemCostSum = costPlan.items.reduce((sum, item) => sum + Number(item.cost), 0);
  assert(Math.abs(itemCostSum - Number(costPlan.totalCost)) < 0.02, `方案总价 ${costPlan.totalCost} 应等于分段费用之和 ${itemCostSum}`);
  ok('方案总价 = 分段费用之和');
  assert(plans.some((plan) => Array.isArray(plan.transferWindows) && plan.transferWindows.length >= 1), '方案应包含中转衔接窗口');
  ok('中转衔接窗口', `${plans[0].transferWindows?.length ?? 0} 个`);

  const planList = await api('GET', `/dispatch/plans?orderId=${orderId}&page=1&pageSize=20`, { token: tokens.mto01 });
  assert(planList.total >= 3, '方案列表应能按订单过滤到 3 套');
  ok('方案列表查询', `${planList.total} 套`);

  const planDetail = await api('GET', `/dispatch/plans/${plans.find((p) => p.strategy === 'BALANCED').id}`, { token: tokens.mto01 });
  assert(planDetail.items?.length >= 3 && planDetail.order?.id === orderId, '方案详情应含订单与分段');
  ok('方案详情', `${planDetail.planNo} / ${planDetail.items.length} 段`);

  section('2. 确认方案 → 签发一单制运单');
  const balanced = plans.find((p) => p.strategy === 'BALANCED');
  const confirmed = await api('POST', `/dispatch/plans/${balanced.id}/confirm`, { token: tokens.mto01 });
  assert(confirmed.waybillId > 0, '确认方案应返回运单 id');
  assert(confirmed.orderId === orderId, '确认方案订单 id 应一致');
  const orderAfter = await api('GET', `/orders/${orderId}`, { token: tokens.mto01 });
  assert(orderAfter.order.status === 'DISPATCHED', `确认后订单应为 DISPATCHED，实际 ${orderAfter.order.status}`);
  assert(orderAfter.waybill?.id === confirmed.waybillId, '订单应关联新签发运单');
  const planAfter = await api('GET', `/dispatch/plans/${balanced.id}`, { token: tokens.mto01 });
  assert(planAfter.status === 'CONFIRMED', '方案状态应为 CONFIRMED');
  ok('方案确认并签发一单制运单', `${confirmed.waybillNo} / 订单→已调度`);

  const allPlans = await api('GET', `/dispatch/plans?orderId=${orderId}&page=1&pageSize=20`, { token: tokens.mto01 });
  assert(allPlans.list.filter((p) => p.status === 'REJECTED').length === 2, '同订单其他方案应被置为 REJECTED');
  ok('未选方案置为 REJECTED');

  section('3. 运力池与调度看板');
  const capacity = await api('GET', '/capacity/summary', { token: tokens.mto01 });
  assert(capacity.vehicles.total >= 12, `车辆应 ≥12，实际 ${capacity.vehicles?.total}`);
  assert(capacity.trains.total >= 8 && capacity.vessels.total >= 8, '班列/班轮各应 ≥8');
  assert(typeof capacity.vehicles.utilization === 'number', '应返回车辆利用率');
  ok('运力池汇总', `车辆 ${capacity.vehicles.total} / 班列 ${capacity.trains.total} / 班轮 ${capacity.vessels.total}`);

  const vehicles = await api('GET', '/capacity/vehicles?page=1&pageSize=20', { token: tokens.mto01 });
  const trains = await api('GET', '/capacity/trains?page=1&pageSize=20', { token: tokens.mto01 });
  const vessels = await api('GET', '/capacity/vessels?page=1&pageSize=20', { token: tokens.mto01 });
  assert(vehicles.list.length >= 12 && trains.list.length >= 8 && vessels.list.length >= 8, '运力列表数量不符');
  assert(vehicles.list.every((v) => v.plateNo && v.status), '车辆应含车牌与状态');
  ok('运力列表（车辆/班列/班轮）');

  const board = await api('GET', '/dispatch/board', { token: tokens.mto01 });
  assert(Array.isArray(board.pendingOrders), '调度看板应返回待调度订单');
  assert(board.capacity && board.upcomingTrains && board.upcomingVessels, '调度看板应含运力/班列/班轮');
  assert(Array.isArray(board.alerts), '调度看板应返回预警区块');
  ok('调度看板', `待调度 ${board.pendingOrders.length} / 班列 ${board.upcomingTrains.length}`);

  section('4. 监控大屏');
  const overview = await api('GET', '/monitor/overview', { token: tokens.mto01 });
  assert(overview.kpis && typeof overview.kpis.onTimeRate === 'number', '大屏应含 KPI');
  assert(Array.isArray(overview.modeDistribution) && overview.modeDistribution.length >= 3, '模式分布应含三种运输方式');
  assert(Array.isArray(overview.livePoints) && overview.livePoints.length >= 1, '应返回在线运单轨迹点');
  assert(Array.isArray(overview.recentAlerts), '应返回最近预警');
  ok('监控大屏总览', `在线运单 ${overview.kpis.onlineWaybills} / 准时率 ${overview.kpis.onTimeRate}%`);

  const trend = await api('GET', '/monitor/trend?days=14', { token: tokens.mto01 });
  assert(trend.dates.length === 14 && trend.onTimeRate.length === 14, '趋势应返回 14 天');
  ok('大屏趋势');

  const live = await api('GET', `/monitor/waybills/${confirmed.waybillId}/live`, { token: tokens.mto01 });
  assert(live.waybill?.id === confirmed.waybillId, '实时接口应返回运单');
  ok('运单实时监控', live.livePosition?.nodeName ?? '—');

  section('5. 预警与异常工单');
  const alerts = await api('GET', '/alerts?page=1&pageSize=50', { token: tokens.mto01 });
  assert(alerts.total >= 20, `预警应 ≥20，实际 ${alerts.total}`);
  assert(alerts.list.every((a) => a.alertNo && a.level && a.alertType), '预警应含编号/级别/类型');
  ok('预警列表字段校验');
  const openWarn = alerts.list.find((a) => a.status === 'OPEN' && a.level === 'WARN');
  assert(openWarn, '应有 OPEN 状态 WARN 预警');
  const acked = await api('POST', `/alerts/${openWarn.id}/ack`, { token: tokens.mto01 });
  assert(acked.status === 'ACK', `确认后应为 ACK，实际 ${acked.status}`);
  await expectError('POST', `/alerts/${openWarn.id}/ack`, { token: tokens.mto01 }, 40902, '重复确认预警返回 40902');
  const closed = await api('POST', `/alerts/${openWarn.id}/close`, { token: tokens.mto01 });
  assert(closed.status === 'CLOSED', `关闭后应为 CLOSED，实际 ${closed.status}`);
  ok('预警确认/关闭状态机');

  const exceptions = await api('GET', '/exceptions?page=1&pageSize=20', { token: tokens.mto01 });
  assert(exceptions.total >= 6, `异常工单应 ≥6，实际 ${exceptions.total}`);
  const openTicket = exceptions.list.find((t) => t.status !== 'RESOLVED' && t.status !== 'CLOSED');
  assert(openTicket, '应有待处置异常工单');
  const handled = await api('POST', `/exceptions/${openTicket.id}/handle`, {
    token: tokens.mto01, body: { resolution: '已协调承运人恢复运输', status: 'RESOLVED' },
  });
  assert(handled.status === 'RESOLVED', `处置后应为 RESOLVED，实际 ${handled.status}`);
  ok('异常工单处置', openTicket.ticketNo);

  const critical = alerts.list.find((a) => a.level === 'CRITICAL' && a.status === 'OPEN');
  if (critical) {
    const res = await request('POST', `/alerts/${critical.id}/close`, { token: tokens.mto01 });
    if (res.json?.code === 0) ok('CRITICAL 预警无未处置工单，可直接关闭');
    else {
      assert(res.json?.code === 42201, `CRITICAL 有关联工单时应返回 42201，实际 ${res.json?.code}`);
      ok('CRITICAL 预警关闭受异常工单约束（42201）');
    }
  } else {
    ok('无 OPEN CRITICAL 预警，跳过约束校验');
  }

  section('6. IoT Mock');
  const devices = await api('GET', '/iot/devices?page=1&pageSize=30', { token: tokens.mto01 });
  assert(devices.list.length >= 20, `IoT 设备应 ≥20，实际 ${devices.list.length}`);
  assert(devices.list.some((d) => d.deviceType === 'TEMP_HUMIDITY'), '应含温湿度设备');
  ok('IoT 设备列表', `${devices.list.length} 台`);

  const readings = await api('GET', '/iot/readings?limit=10', { token: tokens.mto01 });
  assert(Array.isArray(readings) && readings.length >= 1, '应返回 IoT 读数');
  ok('IoT 读数查询', `${readings.length} 条`);

  const tempDevice = devices.list.find((d) => d.deviceType === 'TEMP_HUMIDITY');
  const ingest = await api('POST', '/iot/readings', {
    token: tokens.mto01,
    body: { deviceNo: tempDevice.deviceNo, temperature: 9.8, humidity: 82, doorOpen: false, lng: 114.5, lat: 30.7 },
  });
  assert(ingest.reading?.id > 0, 'IoT 上报应返回读数 id');
  assert(Array.isArray(ingest.alertsCreated), 'IoT 上报应返回 alertsCreated');
  if (ingest.alertsCreated.length >= 1) {
    ok('IoT 超阈值自动预警', ingest.alertsCreated[0]?.title ?? '—');
  } else {
    const tempAlerts = await api('GET', '/alerts?alertType=TEMP_HUMIDITY&page=1&pageSize=5', { token: tokens.mto01 });
    assert(tempAlerts.total >= 1, '重复上报时应已存在温湿度预警（去重）');
    ok('IoT 超阈值预警已存在（30 分钟去重生效）');
  }

  const ingest2 = await api('POST', '/iot/readings', {
    token: tokens.mto01,
    body: { deviceNo: tempDevice.deviceNo, temperature: 9.9, humidity: 83, doorOpen: false },
  });
  assert(Array.isArray(ingest2.alertsCreated) && ingest2.alertsCreated.length === 0, '同设备同类型 30 分钟内应去重');
  ok('IoT 告警去重');

  const fences = await api('GET', '/geo-fences', { token: tokens.mto01 });
  assert(fences.length >= 12, `电子围栏应 ≥12，实际 ${fences.length}`);
  assert(fences.every((f) => f.name && f.fenceType && f.radiusM > 0), '电子围栏应含名称/类型/半径');
  ok('电子围栏列表');

  section('7. 权限');
  await expectError('POST', '/dispatch/plans/generate', { token: tokens.carrier01, body: { orderId } }, 40301, '承运人无权限生成调度方案（40301）');
  const carrierOverview = await api('GET', '/monitor/overview', { token: tokens.carrier01 });
  assert(carrierOverview.kpis, '承运人应可只读访问监控大屏');
  ok('承运人监控大屏只读可见');
  await expectError('GET', '/monitor/overview', { token: tokens.shipper01 }, 40301, '货主无权限访问监控大屏（40301）');

  console.log(`\n✅ Stage 3 验收通过：${passed} 项断言`);
  console.log(`   订单 ${orderNo} → 方案 ${balanced.planNo}（BALANCED）→ 运单 ${confirmed.waybillNo}`);
}

main().catch((error) => {
  console.error(`\n❌ Stage 3 验收失败：${error.message}`);
  process.exitCode = 1;
});
