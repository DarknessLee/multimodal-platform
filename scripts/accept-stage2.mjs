// Stage 2 API 验收：一单制运单 / 单证 OCR+签章 / 哈希链存证 / 箱管 / 95306 + 港口 EDI / 权限
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
  console.log(`多式联运平台 Stage 2 · API 验收（${API}）`);
  await login('shipper01');
  await login('mto01');
  await login('terminal01');
  await login('rail01');
  await login('sea01');
  await login('admin01');

  section('1. 准备：下单 + 调度（一单制自动签发）');
  const requiredDate = ymd(new Date(Date.now() + 7 * 86400000));
  const order = await api('POST', '/orders', {
    token: tokens.shipper01,
    body: { cargoName: '光伏组件', cargoWeight: 22.5, containerType: '40HQ', containerCount: 2,
      origin: '上海嘉定', destination: '成都青白江', requiredPickupDate: requiredDate, remark: 'accept-stage2 一单制验证' },
  });
  const orderId = order.order.id;
  const orderNo = order.order.orderNo;
  ok('货主快速下单', orderNo);
  const dispatched = await api('POST', `/orders/${orderId}/dispatch`, { token: tokens.mto01, body: { roadCarrierCode: 'AJ-001' } });
  const waybillId = dispatched.waybillId;
  assert(waybillId > 0, 'dispatch 未返回 waybillId');
  ok('MTO 调度生成一单制运单', dispatched.waybillNo);
  assert(dispatched.waybillType === 'MASTER', `dispatch 主运单类型应为 MASTER，实际 ${dispatched.waybillType}`);
  assert(Array.isArray(dispatched.segmentWaybills) && dispatched.segmentWaybills.length === 3, 'dispatch 应返回 3 张分段运单');
  assert(Array.isArray(dispatched.documents) && dispatched.documents.length >= 5, 'dispatch 应自动签发 ≥5 张单证');
  ok('自动签发分段运单与单证', `分段单 ${dispatched.segmentWaybills.length} / 单证 ${dispatched.documents.length}`);

  const orderDetail = await api('GET', `/orders/${orderId}`, { token: tokens.shipper01 });
  const container = orderDetail.containers[0];
  assert(container, '订单应包含集装箱');
  const containerNo = container.containerNo;

  section('2. 运单中心（一单制详情 / 事件 / 单证 / 存证）');
  const waybillList = await api('GET', '/waybills?page=1&pageSize=50', { token: tokens.mto01 });
  assert(waybillList.total >= 15, `主运单应 ≥15，实际 ${waybillList.total}`);
  const listed = waybillList.list.find((row) => row.id === waybillId);
  assert(listed, '运单中心列表应包含新签发主运单');
  assert(listed.segmentCount === 3, `列表分段数应为 3，实际 ${listed.segmentCount}`);
  assert(listed.documentCount >= 2, `列表单证数应 ≥2，实际 ${listed.documentCount}`);
  ok('运单中心列表', `总数 ${waybillList.total} / 本单 ${listed.waybillNo}`);

  const detail = await api('GET', `/waybills/${waybillId}`, { token: tokens.shipper01 });
  assert(detail.waybill?.waybillType === 'MASTER', '一单制详情应返回主运单');
  assert(detail.segmentWaybills?.length === 3, `分段运单应 3 张，实际 ${detail.segmentWaybills?.length}`);
  assert(Array.isArray(detail.events) && detail.events.length >= 1, `主运单 ISSUE 事件应 ≥1，实际 ${detail.events?.length}`);
  assert(Array.isArray(detail.documents) && detail.documents.length >= 2, `主运单单证应 ≥2，实际 ${detail.documents?.length}`);
  assert(Array.isArray(detail.containers) && detail.containers.length >= 1, '详情应返回箱列表');
  assert(detail.notarize?.verified === true, '一单制详情存证校验应通过');
  let segmentEventCount = 0;
  let segmentDocCount = 0;
  let totalDocs = detail.documents.length;
  for (const segWaybill of detail.segmentWaybills) {
    const segEvents = await api('GET', `/waybills/${segWaybill.id}/events`, { token: tokens.mto01 });
    const segDocs = await api('GET', `/waybills/${segWaybill.id}/documents`, { token: tokens.mto01 });
    const segEventList = Array.isArray(segEvents) ? segEvents : segEvents.list;
    const segDocList = Array.isArray(segDocs) ? segDocs : segDocs.list;
    segmentEventCount += segEventList.length;
    segmentDocCount += segDocList.length;
    assert(segWaybill.waybillNo?.startsWith('SW'), '分段运单号应以 SW 开头');
  }
  const masterDocList = Array.isArray(detail.documents) ? detail.documents : (detail.documents?.list ?? []);
  totalDocs = masterDocList.length + segmentDocCount;
  const totalIssueEvents = detail.events.length + segmentEventCount;
  assert(totalIssueEvents >= 4, `一单制 ISUUE 事件合计应 ≥4，实际 ${totalIssueEvents}`);
  assert(totalDocs >= 5, `一单制单证合计应 ≥5，实际 ${totalDocs}`);
  ok('一单制详情', `事件 ${totalIssueEvents} / 单证 ${totalDocs} / 箱 ${detail.containers.length}`);

  const events = await api('GET', `/waybills/${waybillId}/events`, { token: tokens.mto01 });
  assert(events.list.length >= 1, '主运单事件列表应 ≥1');
  assert(events.list.every((row) => row.hash?.length === 64 && row.prevHash?.length === 64 && row.txId), '事件应含哈希链字段（64 位）');
  ok('交接事件链', `主单 ${events.list.length} 条 + 分段 ${segmentEventCount} 条`);

  const docsOfWaybill = await api('GET', `/waybills/${waybillId}/documents`, { token: tokens.mto01 });
  const docsOfWaybillList = Array.isArray(docsOfWaybill) ? docsOfWaybill : docsOfWaybill.list;
  assert(docsOfWaybillList.length >= 2, '运单主单单证列表应 ≥2');
  ok('运单单证清单', `${docsOfWaybillList.length} 张`);

  const verify = await api('GET', `/notarize/verify/${events.list[0].txId}`, { token: tokens.admin01 });
  assert(verify.valid === true, '存证校验应通过');
  assert(verify.record?.payloadHash?.length === 64, '存证 payloadHash 应为 64 位');
  ok('哈希链存证校验', `valid / 区块高度 ${verify.record.blockHeight}`);
  const records = await api('GET', `/notarize/records?bizType=WAYBILL&bizId=${waybillId}&page=1&pageSize=20`, { token: tokens.admin01 });
  assert(records.total >= 1, '运单存证记录应 ≥1');
  ok('存证记录查询', `${records.total} 条`);

  section('3. 单证中心（上传 / OCR / 签章 / 下载）');
  const docs = await api('GET', `/documents?bizType=WAYBILL&bizId=${waybillId}&page=1&pageSize=20`, { token: tokens.mto01 });
  assert(docs.total >= 2, '单证中心应能按业务查到主单单证 ≥2');
  ok('单证列表', `${docs.total} 张`);

  const podContent = `货物签收回单\n运单号：${dispatched.waybillNo}\n箱号：${containerNo}\n签收人：李经理\n签收日期：${ymd(new Date())}\n数量：2 箱\n`;
  const pod = await api('POST', '/documents', {
    token: tokens.mto01,
    body: { docType: 'POD', bizType: 'WAYBILL', bizId: waybillId, fileName: 'accept-stage2-pod.txt',
      mimeType: 'text/plain', contentBase64: Buffer.from(podContent, 'utf8').toString('base64') },
  });
  assert(pod.docType === 'POD', '上传单证类型应为 POD');
  assert(pod.ocrStatus === 'SUCCESS', `POD 应自动 OCR 成功，实际 ${pod.ocrStatus}`);
  assert(String(pod.ocrResult?.containerNo ?? '').includes(containerNo), 'OCR 结果应识别箱号');
  ok('POD 上传 + Mock OCR', `箱号 ${pod.ocrResult.containerNo} / 签收人 ${pod.ocrResult.signerName ?? pod.ocrResult.signer}`);

  const podDetail = await api('GET', `/documents/${pod.id}`, { token: tokens.mto01 });
  assert(podDetail.contentHash?.length === 64, '单证 contentHash 应为 64 位');
  ok('单证详情与内容哈希', podDetail.docNo);

  const download = await request('GET', `/documents/${pod.id}/download`, { token: tokens.mto01 });
  assert(download.status === 200 && download.text.includes(containerNo), '单证下载内容应包含箱号');
  ok('单证下载', `${download.text.length} 字符`);

  const ocrAgain = await api('POST', `/documents/${pod.id}/ocr`, { token: tokens.mto01 });
  assert(ocrAgain.ocrStatus === 'SUCCESS', '重跑 OCR 应成功');
  ok('Mock OCR 重跑');

  const signed = await api('POST', `/documents/${pod.id}/sign`, { token: tokens.mto01, body: { signerName: '王海' } });
  assert(signed.signStatus === 'SIGNED', '签章后单证应为 SIGNED');
  assert(signed.signHash?.length === 64, 'signHash 应为 64 位 SHA-256');
  assert(signed.notarizeTxId, '签章应写入存证交易号');
  const verifyDoc = await api('GET', `/notarize/verify/${signed.notarizeTxId}`, { token: tokens.admin01 });
  assert(verifyDoc.valid === true, '单证签章存证校验应通过');
  ok('单证 Mock CA 签章 + 存证', `signHash=${signed.signHash.slice(0, 12)}…`);

  section('4. 箱管中心（放箱 / 提箱 / 进场 / 装箱 / 还箱 / 堆存）');
  const ports = await api('GET', '/ports', { token: tokens.mto01 });
  const yangshan = ports.find((node) => node.nodeName === '上海洋山港');
  const jiading = ports.find((node) => node.nodeName === '上海嘉定工厂');
  const depot = ports.find((node) => node.nodeName === '洋山堆场');
  assert(yangshan && jiading && depot, '港站主数据应包含洋山港/嘉定工厂/洋山堆场');

  const containerList = await api('GET', `/containers?keyword=${encodeURIComponent(containerNo)}&page=1&pageSize=10`, { token: tokens.mto01 });
  assert(containerList.list.some((row) => row.id === container.id), '箱管列表应能按箱号查到');
  ok('箱管列表检索', containerNo);

  const released = await api('POST', `/containers/${container.id}/release`, { token: tokens.mto01, body: { waybillId, nodeId: yangshan.id } });
  assert(released.container?.status === 'RELEASED' || released.status === 'RELEASED', '放箱后箱状态应为 RELEASED');
  ok('放箱登记');

  await api('POST', `/containers/${container.id}/movements`, { token: tokens.mto01, body: { movementType: 'PICKUP', nodeId: jiading.id, conditionText: '箱况良好', remark: '提箱' } });
  await api('POST', `/containers/${container.id}/movements`, { token: tokens.mto01, body: { movementType: 'GATE_IN', nodeId: yangshan.id, conditionText: '箱况良好', remark: '进场' } });
  await api('POST', `/containers/${container.id}/movements`, { token: tokens.mto01, body: { movementType: 'LOAD', nodeId: yangshan.id, conditionText: '箱况良好', remark: '装船' } });
  ok('提箱 / 进场 / 装箱动态');

  const returned = await api('POST', `/containers/${container.id}/return`, { token: tokens.mto01, body: { nodeId: depot.id, conditionText: '箱况良好' } });
  assert(returned.container?.status === 'RETURNED' || returned.status === 'RETURNED', '还箱后箱状态应为 RETURNED');
  ok('还箱登记');

  const containerDetail = await api('GET', `/containers/${container.id}`, { token: tokens.mto01 });
  assert(containerDetail.movements.length >= 5, `箱动态应 ≥5，实际 ${containerDetail.movements?.length}`);
  assert(containerDetail.storage.length >= 1, '还箱后应有堆存记录');
  assert(Number(containerDetail.storage[0].feeAmount) > 0, '堆存费用应大于 0');
  ok('箱动态 + 堆存', `动态 ${containerDetail.movements.length} / 堆存 ¥${containerDetail.storage[0].feeAmount}`);

  const storage = await api('GET', `/depots/storage?page=1&pageSize=20`, { token: tokens.admin01 });
  assert(storage.list.length >= 1, '堆存查询应返回记录');
  ok('堆存记录查询');

  section('5. 铁路 95306 / 水路订舱（Mock 适配器）');
  const railTasks = await api('GET', '/rail/tasks', { token: tokens.rail01 });
  const railTask = railTasks.list?.find((row) => row.waybillId === waybillId) ?? railTasks.find?.((row) => row.waybillId === waybillId);
  assert(railTask, '铁路工作台应包含该运单任务');
  const applied = await api('POST', `/rail/tasks/${waybillId}/apply`, { token: tokens.rail01 });
  assert(['PENDING', 'APPLIED'].includes(applied.status), `需求车提报后状态应为 PENDING/APPLIED，实际 ${applied.status}`);
  const confirmed = await api('POST', `/rail/demands/${applied.messageId}/confirm`, { token: tokens.rail01 });
  assert(['ACCEPTED', 'CONFIRMED'].includes(confirmed.status), `95306 受理后状态应为 ACCEPTED/CONFIRMED，实际 ${confirmed.status}`);
  ok('95306 需求车提报 + 受理回执', `messageId=${applied.messageId} / 承认车 ${confirmed.matchedCars}`);

  const railMsgs = await api('GET', `/integration/messages?relatedType=WAYBILL&relatedId=${waybillId}&page=1&pageSize=50`, { token: tokens.admin01 });
  assert(railMsgs.list.some((row) => row.msgType === 'RAIL_DEMAND_APPLY'), '应生成 RAIL_DEMAND_APPLY 报文');
  assert(railMsgs.list.some((row) => row.msgType === 'RAIL_DEMAND_ACCEPT'), '应生成 RAIL_DEMAND_ACCEPT 回执');
  ok('95306 报文可追溯');

  const seaTasks = await api('GET', '/sea/tasks', { token: tokens.sea01 });
  const seaTask = seaTasks.list?.find((row) => row.waybillId === waybillId) ?? seaTasks.find?.((row) => row.waybillId === waybillId);
  assert(seaTask, '水路工作台应包含该运单任务');
  const booked = await api('POST', `/sea/tasks/${waybillId}/book`, { token: tokens.sea01 });
  assert(['PENDING', 'BOOKED'].includes(booked.status), `订舱后状态应为 PENDING/BOOKED，实际 ${booked.status}`);
  const bookingConfirmed = await api('POST', `/sea/bookings/${booked.messageId}/confirm`, { token: tokens.sea01 });
  assert(['BOOKED', 'CONFIRMED'].includes(bookingConfirmed.status), `订舱确认后状态应为 BOOKED/CONFIRMED，实际 ${bookingConfirmed.status}`);
  ok('水路订舱 + 确认回执', `messageId=${booked.messageId} / 船名 ${bookingConfirmed.vesselName ?? bookingConfirmed.vessel ?? '—'}`);

  section('6. 权限与数据规模');
  await expectError('POST', `/containers/${container.id}/release`, { token: tokens.shipper01, body: { waybillId } }, 40301, '货主无权限放箱（40301）');
  await expectError('POST', '/documents', { token: tokens.sea01, body: { docType: 'POD', bizType: 'WAYBILL', bizId: waybillId, fileName: 'x.txt', contentBase64: '' } }, 40301, '水路承运人无权限上传单证（40301）');

  const summary = await api('GET', '/dashboard/summary', { token: tokens.admin01 });
  assert(summary.kpis.ordersTotal >= 20, '看板订单总数应 ≥20');
  ok('看板数据', `订单 ${summary.kpis.ordersTotal} / 报文 ${summary.integration.total}`);

  console.log(`\n✅ Stage 2 验收通过：${passed} 项断言`);
  console.log(`   订单 ${orderNo} → 主运单 ${dispatched.waybillNo} → 3 分段单 / 5 单证 / 事件 ${events.list.length} 条`);
  console.log(`   POD ${pod.docNo}（OCR + 签章）· 箱 ${containerNo}（放箱→提箱→进场→装箱→还箱）· 95306/水路报文闭环`);
}

main().catch((error) => {
  console.error(`\n❌ Stage 2 验收失败：${error.message}`);
  process.exitCode = 1;
});
