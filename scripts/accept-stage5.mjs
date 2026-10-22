// Stage 5 API 验收：集成中心 v2 / 监管报送与合规 / 运营后台 / 全链路检查 / 权限
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
  console.log(`多式联运平台 Stage 5 · API 验收（${API}）`);
  for (const username of ['admin01', 'regulator01', 'mto01', 'carrier01', 'shipper01']) {
    await login(username);
  }

  section('1. 集成中心 v2');
  const adapters = await api('GET', '/integration/adapters', { token: tokens.admin01 });
  const adapterList = Array.isArray(adapters) ? adapters : adapters.list;
  assert(adapterList.length >= 6, `适配器应 ≥6，实际 ${adapterList.length}`);
  assert(adapterList.every((a) => a.adapterCode && a.systemType && a.status), '适配器应含编码/系统/状态');
  ok('适配器列表', `${adapterList.length} 个`);
  const health = await api('GET', `/integration/adapters/${adapterList[0].id}/health`, { token: tokens.admin01 });
  assert(Array.isArray(health.checks) && health.checks.length >= 1, '健康检查应返回检查项');
  ok('适配器健康检查', `${health.checks.length} 项 / ${health.status}`);
  const tested = await api('POST', `/integration/adapters/${adapterList[0].id}/test`, { token: tokens.admin01 });
  assert(typeof tested.success === 'boolean' && tested.latencyMs >= 0, '连通测试应返回结果与延迟');
  ok('适配器连通测试', `success=${tested.success} / ${tested.latencyMs}ms`);

  const messages = await api('GET', '/integration/messages?page=1&pageSize=5', { token: tokens.admin01 });
  assert(messages.total >= 60, `报文应 ≥60，实际 ${messages.total}`);
  const message = messages.list[0];
  const detail = await api('GET', `/integration/messages/${message.id}`, { token: tokens.admin01 });
  assert(detail.msgNo && detail.requestBody !== undefined && detail.status, '报文详情应含请求体与状态');
  ok('报文详情（请求/响应）', detail.msgNo);

  const failedMessages = await api('GET', '/integration/messages?status=FAILED&page=1&pageSize=5', { token: tokens.admin01 });
  assert(failedMessages.list.length >= 1, '应存在 FAILED 报文用于批量重试');
  const batch = await api('POST', '/integration/messages/retry-batch', {
    token: tokens.admin01, body: { ids: failedMessages.list.slice(0, 2).map((m) => m.id) },
  });
  assert(batch.retried >= 1 && Array.isArray(batch.results), '批量重试应返回逐条结果');
  ok('批量重试', `重试 ${batch.retried} / 成功 ${batch.success}`);
  await expectError('POST', '/integration/messages/retry-batch', { token: tokens.admin01, body: { ids: Array.from({ length: 21 }, (_, i) => i + 1) } }, 40001, '批量重试超过 20 条返回 40001');

  const stats = await api('GET', '/integration/stats?days=7', { token: tokens.admin01 });
  assert(stats.total >= 60 && typeof stats.successRate === 'number', '统计应返回总量/成功率');
  assert(Array.isArray(stats.bySystem) && stats.bySystem.length >= 5, '统计应含系统维度');
  assert(Array.isArray(stats.trend) && stats.trend.length === 7, '统计趋势应为 7 天');
  ok('集成统计', `总量 ${stats.total} / 成功率 ${stats.successRate}%`);

  section('2. 监管报送与合规检查');
  const dashboard = await api('GET', '/regulator/dashboard', { token: tokens.regulator01 });
  assert(dashboard.reports?.total >= 5, '监管看板应返回报送统计');
  ok('监管看板', `报送 ${dashboard.reports.total} / 合规 ${dashboard.compliance?.pass ?? 0} PASS`);

  const report = await api('POST', '/regulator/reports', {
    token: tokens.regulator01, body: { reportType: 'OPERATION_MONTHLY', period: '2026-10', regulatorName: '上海市交通委员会' },
  });
  assert(report.status === 'DRAFT' && report.reportNo?.startsWith('JG'), '新报送应为 DRAFT + JG 号');
  const reportDetail = await api('GET', `/regulator/reports/${report.id}`, { token: tokens.regulator01 });
  assert(reportDetail.content && (reportDetail.content.orderCount !== undefined || typeof reportDetail.content === 'object'), '报送详情应含聚合内容');
  ok('生成监管报送', `${report.reportNo}`);
  const submitted = await api('POST', `/regulator/reports/${report.id}/submit`, { token: tokens.regulator01 });
  assert(submitted.status === 'SUBMITTED', '提交后应为 SUBMITTED');
  const accepted = await api('POST', `/regulator/reports/${report.id}/accept`, { token: tokens.regulator01, body: { accepted: true, comment: '材料齐全' } });
  assert(accepted.status === 'ACCEPTED', '受理后应为 ACCEPTED');
  ok('报送提交→受理', report.reportNo);

  const rejectedReport = await api('POST', '/regulator/reports', {
    token: tokens.regulator01, body: { reportType: 'SAFETY', period: '2026-10', regulatorName: '上海市交通委员会' },
  });
  await api('POST', `/regulator/reports/${rejectedReport.id}/submit`, { token: tokens.regulator01 });
  const returned = await api('POST', `/regulator/reports/${rejectedReport.id}/accept`, {
    token: tokens.regulator01, body: { accepted: false, comment: '材料不完整' },
  });
  assert(returned.status === 'RETURNED', '退回后应为 RETURNED');
  ok('报送退回（RETURNED）', rejectedReport.reportNo);

  const checks = await api('GET', '/regulator/compliance-checks?page=1&pageSize=20', { token: tokens.regulator01 });
  assert(checks.total >= 10, `合规检查记录应 ≥10，实际 ${checks.total}`);
  const run = await api('POST', '/regulator/compliance-checks/run', { token: tokens.regulator01 });
  assert(Array.isArray(run.checks) && run.checks.length >= 5, '合规检查应覆盖 ≥5 类规则');
  assert(run.summary && run.summary.total >= 5, '合规检查应返回汇总');
  assert(['PASS', 'WARN', 'FAIL'].includes(run.checks[0].result), '检查结果应为 PASS/WARN/FAIL');
  ok('合规检查执行', `${run.summary.total} 项 / PASS ${run.summary.pass} / WARN ${run.summary.warn} / FAIL ${run.summary.fail}`);

  section('3. 运营后台');
  const configs = await api('GET', '/ops/configs', { token: tokens.admin01 });
  const configList = Array.isArray(configs) ? configs : configs.list;
  assert(configList.length >= 10, `系统配置应 ≥10，实际 ${configList.length}`);
  ok('系统配置列表', `${configList.length} 项`);
  const readonly = configList.find((c) => c.editable === 0 || c.editable === false);
  if (readonly) {
    await expectError('PUT', `/ops/configs/${readonly.configKey}`, { token: tokens.admin01, body: { configValue: 'x' } }, 42201, '不可编辑配置返回 42201');
  }
  const editable = configList.find((c) => c.configKey === 'dispatch.max_plans');
  const updatedConfig = await api('PUT', `/ops/configs/${editable.configKey}`, { token: tokens.admin01, body: { configValue: editable.configValue } });
  assert(updatedConfig.configKey === editable.configKey, '配置更新应返回配置项');
  ok('配置更新', editable.configKey);

  const dicts = await api('GET', '/ops/dicts?dictType=report_type', { token: tokens.admin01 });
  const dictList = Array.isArray(dicts) ? dicts : dicts.list;
  assert(dictList.length >= 4, '报表类型字典应 ≥4');
  ok('数据字典查询', `${dictList.length} 项`);
  const createdDict = await api('POST', '/ops/dicts', {
    token: tokens.admin01, body: { dictType: 'e2e_dict', dictKey: `K_${Date.now()}`, dictValue: 'E2E 测试项', sort: 99 },
  });
  assert(createdDict.id > 0, '新增字典应返回 id');
  const updatedDict = await api('PUT', `/ops/dicts/${createdDict.id}`, { token: tokens.admin01, body: { dictValue: 'E2E 更新项' } });
  assert(updatedDict.dictValue === 'E2E 更新项', '字典更新应生效');
  ok('字典新增/修改', createdDict.dictKey);

  const jobs = await api('GET', '/ops/jobs', { token: tokens.admin01 });
  const jobList = Array.isArray(jobs) ? jobs : jobs.list;
  assert(jobList.length >= 5, `定时任务应 ≥5，实际 ${jobList.length}`);
  ok('定时任务列表', `${jobList.length} 个`);
  const jobRun = await api('POST', `/ops/jobs/${jobList[0].jobCode}/run`, { token: tokens.admin01 });
  assert(jobRun.status === 'SUCCESS' || jobRun.log?.status === 'SUCCESS', '任务执行应返回 SUCCESS');
  ok('任务执行', jobList[0].jobCode);

  const opsHealth = await api('GET', '/ops/health', { token: tokens.admin01 });
  assert(opsHealth.db?.status === 'UP' || opsHealth.db?.status === 'OK', '数据库健康应为 UP/OK');
  assert(opsHealth.data?.tables === 59 || opsHealth.data?.tables >= 50, `表数应 ≈59，实际 ${opsHealth.data?.tables}`);
  ok('系统健康巡检', `DB ${opsHealth.db?.latencyMs}ms / 表 ${opsHealth.data?.tables}`);
  const opsDashboard = await api('GET', '/ops/dashboard', { token: tokens.admin01 });
  assert(opsDashboard.health || opsDashboard.dataCounts, '运营看板应返回健康/数据量');
  ok('运营看板');

  section('4. 全链路检查');
  const fullChain = await api('GET', '/ops/full-chain-check', { token: tokens.admin01 });
  assert(fullChain.stages?.length === 5, `全链路检查应有 5 个 Stage，实际 ${fullChain.stages?.length}`);
  assert(fullChain.summary?.total >= 20, `检查项应 ≥20，实际 ${fullChain.summary?.total}`);
  assert(fullChain.passed === true, `正常种子全链路检查应通过，实际 passed=${fullChain.passed}`);
  assert(fullChain.summary.fail === 0, '全链路检查 FAIL 应为 0');
  ok('全链路检查', `5 Stage / ${fullChain.summary.total} 项 / PASS ${fullChain.summary.pass} / WARN ${fullChain.summary.warn}`);

  section('5. 权限');
  await expectError('PUT', '/ops/configs/dispatch.max_plans', { token: tokens.regulator01, body: { configValue: '5' } }, 40301, '监管无权限修改配置（40301）');
  await expectError('GET', '/regulator/reports', { token: tokens.carrier01 }, 40301, '承运人无权限查看监管报送（40301）');
  await expectError('GET', '/ops/health', { token: tokens.shipper01 }, 40301, '货主无权限查看运营后台（40301）');
  const mtoChain = await api('GET', '/ops/full-chain-check', { token: tokens.mto01 });
  assert(mtoChain.passed === true, 'MTO 可只读查看全链路检查结果');
  ok('MTO 全链路检查只读可见');

  console.log(`\n✅ Stage 5 验收通过：${passed} 项断言`);
  console.log(`   适配器 ${adapterList.length} / 报文 ${stats.total} 条 / 报送 ${dashboard.reports.total} / 检查 ${fullChain.summary.total} 项（passed=${fullChain.passed}）`);
}

main().catch((error) => {
  console.error(`\n❌ Stage 5 验收失败：${error.message}`);
  process.exitCode = 1;
});
