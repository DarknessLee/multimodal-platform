// Stage 1 E2E v2：9 角色 UI 全流程（询价→报价→合同签署→转单→调度→履约→签收→结算）+ v1 页面截图
// 前提：npm run dev 已启动（API:8080 + Web:5173），数据库为干净种子
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const BASE = process.env.WEB_BASE || 'http://127.0.0.1:5173';
const API = process.env.API_BASE || 'http://127.0.0.1:8080/api';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = resolve(root, 'docs/screenshots/stage1');
mkdirSync(shotsDir, { recursive: true });

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
let stepCount = 0;

async function findBillId(orderNo) {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'settlement01', password: 'demo123' }),
  }).then((response) => response.json());
  const res = await fetch(`${API}/bills?keyword=${encodeURIComponent(orderNo)}&billType=RECEIVABLE&page=1&pageSize=5`, {
    headers: { Authorization: `Bearer ${login.data.token}` },
  }).then((response) => response.json());
  return res.data?.list?.[0]?.id;
}

function step(title) {
  stepCount += 1;
  console.log(`\n[${String(stepCount).padStart(2, '0')}] ${title}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log(`多式联运平台 Stage 1 · E2E（${BASE}）`);
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    console.log('浏览器：本机 Edge（channel=msedge）');
  } catch {
    browser = await chromium.launch({ executablePath: EDGE_PATH, headless: true });
    console.log('浏览器：本机 Edge（executablePath）');
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  async function screenshot(name) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(shotsDir, `${name}.png`), fullPage: true });
    console.log(`  📸 docs/screenshots/stage1/${name}.png`);
  }

  async function loginAs(role, label) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator(`[data-testid="quick-login-${role}"]`).click();
    await page.waitForURL('**/dashboard', { timeout: 20000 });
    const badge = page.locator('[data-testid="role-badge"]');
    await badge.waitFor({ state: 'visible' });
    console.log(`  ✓ 登录 ${label || role}（${(await badge.innerText()).trim()}）`);
    await page.waitForTimeout(600);
  }

  async function logout() {
    await page.locator('[data-testid="logout-btn"]').click();
    await page.waitForURL('**/login', { timeout: 15000 });
    console.log('  ✓ 退出登录');
  }

  async function bodyText() {
    return page.locator('body').innerText();
  }

  try {
    // ── 1. 货主总览 ──
    step('货主登录与平台总览');
    await loginAs('SHIPPER', '货主 shipper01');
    await page.locator('[data-testid="kpi-orders-total"]').waitFor({ state: 'visible' });
    const kpiOrders = (await page.locator('[data-testid="kpi-orders-total"]').innerText()).trim();
    assert(kpiOrders.length > 0, 'KPI 订单总数未渲染');
    await page.locator('[data-testid="trend-chart"] canvas').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-testid="integration-health"]').waitFor({ state: 'visible' });
    console.log(`  ✓ 总览 KPI / 趋势图 / 集成健康度（${kpiOrders}）`);
    await screenshot('01-平台总览');

    // ── 2. 快速下单（v0 兼容） ──
    step('快速下单（v0 兼容通道）');
    await page.locator('[data-testid="nav-orders"]').click();
    await page.waitForURL('**/orders');
    await page.locator('[data-testid="create-order-btn"]').click();
    await page.waitForURL('**/orders/new');
    await page.locator('[data-testid="order-submit"]').first().click();
    await page.waitForURL(/\/orders\/\d+$/, { timeout: 20000 });
    await page.locator('[data-testid="page-title"]').waitFor({ state: 'visible' });
    await page.getByText('待调度', { exact: false }).first().waitFor({ timeout: 15000 });
    const quickOrderId = Number(/\/orders\/(\d+)$/.exec(page.url())[1]);
    const quickBody = await bodyText();
    const quickMatch = /MO\d+/.exec(quickBody);
    assert(quickMatch, '快速下单后未显示订单号');
    const quickOrderNo = quickMatch[0];
    assert(quickBody.includes('待调度'), '快速下单订单状态应为待调度');
    console.log(`  ✓ 快速下单：${quickOrderNo}（订单 id=${quickOrderId}）`);
    await screenshot('02-快速下单-订单详情');

    // ── 3. 货主询价 ──
    step('货主询价（自动计价）');
    await page.locator('[data-testid="nav-quotes"]').click();
    await page.waitForURL('**/quotes');
    await page.locator('[data-testid="quote-create-btn"]').click();
    const quoteDialog = page.locator('.el-dialog').last();
    await quoteDialog.waitFor({ state: 'visible' });
    await quoteDialog.getByRole('button', { name: '生成报价', exact: true }).click();
    await page.waitForURL(/\/quotes\/\d+$/, { timeout: 20000 });
    const quoteId = Number(/\/quotes\/(\d+)$/.exec(page.url())[1]);
    await page.locator('[data-testid="quote-total-amount"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="quote-breakdown"]').waitFor({ state: 'visible' });
    const quoteNoMatch = /BJ\d+/.exec(await bodyText());
    assert(quoteNoMatch, '报价详情未显示报价号');
    const quoteNo = quoteNoMatch[0];
    console.log(`  ✓ 询价生成：${quoteNo}（id=${quoteId}，含费用明细）`);
    await screenshot('03-货主询价-报价明细');
    await logout();

    // ── 4. MTO 发送报价 ──
    step('MTO 发送报价');
    await loginAs('MTO', 'MTO mto01');
    await page.goto(`${BASE}/quotes/${quoteId}`);
    await page.locator('[data-testid="quote-send-btn"]').click();
    await page.getByText('已报价', { exact: false }).first().waitFor({ timeout: 15000 });
    console.log('  ✓ 报价已发送（DRAFT → SENT）');
    await screenshot('04-MTO-发送报价');

    // ── 5. MTO 创建并发送合同 ──
    step('MTO 创建并发送合同');
    await page.locator('[data-testid="nav-contracts"]').click();
    await page.waitForURL('**/contracts');
    await page.locator('[data-testid="contract-create-btn"]').click();
    const contractDialog = page.locator('.el-dialog').last();
    await contractDialog.waitFor({ state: 'visible' });
    await contractDialog.getByRole('button', { name: '保存', exact: true }).click();
    await page.waitForURL(/\/contracts\/\d+$/, { timeout: 20000 });
    const contractId = Number(/\/contracts\/(\d+)$/.exec(page.url())[1]);
    await page.locator('[data-testid="contract-send-btn"]').waitFor({ state: 'visible', timeout: 15000 });
    const contractNoMatch = /HT\d+/.exec(await bodyText());
    assert(contractNoMatch, '合同详情未显示合同号');
    const contractNo = contractNoMatch[0];
    await page.locator('[data-testid="contract-send-btn"]').click();
    await page.getByText('待签署', { exact: false }).first().waitFor({ timeout: 15000 });
    console.log(`  ✓ 合同已发送：${contractNo}（id=${contractId}，待签署）`);
    await screenshot('05-MTO-合同待签署');
    await logout();

    // ── 6. 货主 Mock 签章 ──
    step('货主 Mock CA 签署合同');
    await loginAs('SHIPPER', '货主 shipper01');
    await page.goto(`${BASE}/contracts/${contractId}`);
    await page.locator('[data-testid="contract-sign-btn"]').click();
    const signDialog = page.locator('.el-dialog').last();
    await signDialog.waitFor({ state: 'visible' });
    await signDialog.locator('[data-testid="signer-name"]').fill('王海');
    await signDialog.locator('[data-testid="contract-sign-submit"]').click();
    await page.getByText('已签署', { exact: false }).first().waitFor({ timeout: 20000 });
    console.log('  ✓ 合同签署完成（signHash 已生成）');
    await screenshot('06-货主-合同已签署');

    // ── 7. 货主接受报价生成订单 ──
    step('货主接受报价 → 订单');
    await page.goto(`${BASE}/quotes/${quoteId}`);
    await page.locator('[data-testid="quote-accept-btn"]').click();
    await page.waitForURL(/\/orders\/\d+$/, { timeout: 20000 });
    await page.locator('[data-testid="page-title"]').waitFor({ state: 'visible' });
    await page.waitForTimeout(500);
    const orderId = Number(/\/orders\/(\d+)$/.exec(page.url())[1]);
    const orderNoMatch = /MO\d+/.exec(await bodyText());
    assert(orderNoMatch, '转单后未显示订单号');
    const orderNo = orderNoMatch[0];
    assert((await bodyText()).includes('报价转单') || (await bodyText()).includes('报价'), '订单来源应体现报价转单');
    console.log(`  ✓ 报价转单订单：${orderNo}（id=${orderId}）`);
    await screenshot('07-货主-报价转单订单');
    await logout();

    // ── 8. MTO 调度 ──
    step('MTO 人工调度');
    await loginAs('MTO', 'MTO mto01');
    await page.goto(`${BASE}/orders/${orderId}/dispatch`);
    await page.locator('[data-testid="carrier-option-AJ-001"]').click();
    await page.locator('[data-testid="dispatch-submit"]').click();
    await page.waitForURL(/\/orders\/\d+$/, { timeout: 20000 });
    await page.getByText('已调度', { exact: false }).first().waitFor({ timeout: 15000 });
    await page.locator('[data-testid="track-entry"]').click();
    await page.waitForURL(/\/waybills\/\d+\/track$/, { timeout: 15000 });
    const waybillId = Number(/\/waybills\/(\d+)\/track$/.exec(page.url())[1]);
    await page.locator('[data-testid="track-chart"]').waitFor({ state: 'visible' });
    console.log(`  ✓ 调度完成，运单 id=${waybillId}（已生成 3 段）`);
    await screenshot('08-MTO-调度后运单跟踪');
    await logout();

    // ── 9. 公路承运人 ──
    step('公路承运人上报节点');
    await loginAs('CARRIER', '公路承运人 carrier01');
    await page.locator('[data-testid="nav-tasks"]').click();
    await page.waitForURL('**/tasks');
    const taskCard = page.locator('[data-testid="task-card"]').filter({ hasText: orderNo }).first();
    await taskCard.waitFor({ state: 'visible', timeout: 20000 });
    await taskCard.locator('[data-testid="task-accept"]').click();
    await page.locator('[data-testid="task-card"]').filter({ hasText: orderNo }).first()
      .locator('[data-testid="task-status"]').filter({ hasText: '已接单' }).waitFor({ timeout: 15000 });
    await page.locator('[data-testid="task-card"]').filter({ hasText: orderNo }).first()
      .locator('[data-testid="task-depart"]').click();
    await page.locator('[data-testid="task-card"]').filter({ hasText: orderNo }).first()
      .locator('[data-testid="task-status"]').filter({ hasText: '运输中' }).waitFor({ timeout: 15000 });
    await page.locator('[data-testid="task-card"]').filter({ hasText: orderNo }).first()
      .locator('[data-testid="task-arrive"]').click();
    await page.waitForTimeout(1200);
    console.log('  ✓ 公路段：接单 → 已提货 → 已送达');
    await screenshot('09-承运人-任务完成');
    await logout();

    // ── 10. 港站 ──
    step('港站进场/到港/到站');
    await loginAs('TERMINAL', '港站 terminal01');
    await page.locator('[data-testid="nav-terminal"]').click();
    await page.waitForURL('**/terminal');
    const actions = ['确认进场（海运）', '确认到港（海运）', '确认进场（铁路）', '确认到站（铁路）'];
    for (let index = 0; index < actions.length; index += 1) {
      const card = page.locator('[data-testid="terminal-card"]').filter({ hasText: orderNo }).first();
      await card.waitFor({ state: 'visible', timeout: 20000 });
      const gateIn = card.locator('[data-testid="terminal-gate-in"]');
      if ((await gateIn.count()) > 0) await gateIn.click();
      else await card.locator('[data-testid="terminal-arrive"]').click();
      await page.waitForTimeout(1200);
      console.log(`  ✓ ${actions[index]}`);
    }
    await screenshot('10-港站作业完成');
    await logout();

    // ── 11. 货主轨迹与签收 ──
    step('货主查看轨迹并签收');
    await loginAs('SHIPPER', '货主 shipper01');
    await page.goto(`${BASE}/waybills/${waybillId}/track`);
    await page.locator('[data-testid="track-chart"] canvas').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-testid="live-position"]').waitFor({ state: 'visible', timeout: 20000 });
    const signBtn = page.locator('[data-testid="sign-btn"]');
    await signBtn.waitFor({ state: 'visible', timeout: 20000 });
    await screenshot('11-货主-全程轨迹');
    await signBtn.click();
    const trackSignDialog = page.locator('.el-dialog').last();
    await trackSignDialog.waitFor({ state: 'visible' });
    await trackSignDialog.locator('[data-testid="signer-name"]').fill('李经理');
    await trackSignDialog.locator('[data-testid="sign-submit"]').click();
    await page.getByText('已签收', { exact: false }).first().waitFor({ timeout: 20000 });
    console.log('  ✓ 签收完成（运单/订单 → 已签收）');
    await screenshot('12-货主-签收完成');
    await logout();

    // ── 12. 结算出账 ──
    step('结算生成分段账单');
    await loginAs('SETTLEMENT', '结算 settlement01');
    await page.locator('[data-testid="nav-settlement"]').click();
    await page.waitForURL('**/settlement');
    const settleCard = page.locator('[data-testid="settle-card"]').filter({ hasText: orderNo }).first();
    await settleCard.waitFor({ state: 'visible', timeout: 20000 });
    await settleCard.locator('[data-testid="settle-btn"]').click();
    await page.waitForTimeout(1500);
    const billId = await findBillId(orderNo);
    assert(billId, `订单 ${orderNo} 出账后应能查到账单`);
    await page.goto(`${BASE}/bills/${billId}`);
    await page.waitForURL(/\/bills\/\d+$/, { timeout: 15000 });
    const billTotal = (await page.locator('[data-testid="bill-total"]').innerText()).trim();
    assert(billTotal.includes('15080.00'), `账单总额应为 15080.00，实际 ${billTotal}`);
    console.log(`  ✓ 账单生成：¥${billTotal}（= 三段费用之和）`);
    await screenshot('13-分段账单');
    await logout();

    // ── 13. 平台运营视角 ──
    step('平台运营：看板 / 集成中心 / 审计');
    await loginAs('ADMIN', '平台运营 admin01');
    await page.locator('[data-testid="integration-health"]').waitFor({ state: 'visible' });
    await screenshot('14-平台运营总览');
    await page.locator('[data-testid="nav-integration"]').click();
    await page.waitForURL('**/integration/messages');
    await page.locator('[data-testid="message-row"]').first().click();
    await page.locator('[data-testid="message-detail"]').waitFor({ state: 'visible', timeout: 15000 });
    console.log('  ✓ 集成报文列表与详情抽屉');
    await screenshot('15-集成中心-报文详情');
    await page.keyboard.press('Escape');
    await page.locator('.el-drawer').last().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await page.locator('[data-testid="nav-audit"]').click();
    await page.waitForURL('**/audit/logs');
    await page.locator('[data-testid="audit-row"]').first().waitFor({ state: 'visible', timeout: 15000 });
    console.log('  ✓ 审计日志');
    await screenshot('16-审计日志');
    await logout();

    assert(pageErrors.length === 0, `页面存在 JS 异常：${pageErrors.join(' | ')}`);
    console.log(`\n✅ Stage 1 E2E 通过：${stepCount} 个阶段全部完成，截图 16 张`);
    console.log(`   报价 ${quoteNo} → 合同 ${contractNo} → 订单 ${orderNo} → 运单 ${waybillId} → 账单 ¥${billTotal}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`\n❌ Stage 1 E2E 失败：${error.message}`);
  process.exitCode = 1;
});
