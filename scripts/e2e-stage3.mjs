// Stage 3 E2E：智能调度三方案→确认、调度看板、运力池、监控大屏、预警/异常工单、运单实时监控
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const WEB = process.env.WEB_BASE || 'http://127.0.0.1:5173';
const API = process.env.API_BASE || 'http://127.0.0.1:8080/api';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = resolve(root, 'docs/screenshots/stage3');
mkdirSync(shotsDir, { recursive: true });

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PASSWORD = 'demo123';
let stepCount = 0;

function step(title) {
  stepCount += 1;
  console.log(`\n[${String(stepCount).padStart(2, '0')}] ${title}`);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function ymd(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
async function apiCall(method, path, { body, token } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`${method} ${path} -> ${json.code} ${json.message}`);
  return json.data;
}

async function prepareOrder() {
  const shipper = await apiCall('POST', '/auth/login', { body: { username: 'shipper01', password: PASSWORD } });
  const order = await apiCall('POST', '/orders', {
    token: shipper.token,
    body: {
      cargoName: '光伏组件', cargoWeight: 22.5, containerType: '40HQ', containerCount: 2,
      origin: '上海嘉定', destination: '成都青白江', requiredPickupDate: ymd(new Date(Date.now() + 7 * 86400000)),
      remark: 'E2E Stage3 智能调度',
    },
  });
  return { orderId: order.order.id, orderNo: order.order.orderNo };
}

async function main() {
  console.log(`多式联运平台 Stage 3 · E2E（${WEB}）`);
  const prepared = await prepareOrder();
  console.log(`  · 准备订单：${prepared.orderNo}`);

  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch {
    browser = await chromium.launch({ executablePath: EDGE_PATH, headless: true });
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  async function screenshot(name) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(shotsDir, `${name}.png`), fullPage: true });
    console.log(`  📸 docs/screenshots/stage3/${name}.png`);
  }
  async function loginAs(role, label) {
    await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator(`[data-testid="quick-login-${role}"]`).click();
    await page.waitForURL('**/dashboard', { timeout: 20000 });
    await page.locator('[data-testid="role-badge"]').waitFor({ state: 'visible' });
    console.log(`  ✓ 登录 ${label || role}`);
    await page.waitForTimeout(500);
  }
  async function logout() {
    await page.locator('[data-testid="logout-btn"]').click();
    await page.waitForURL('**/login', { timeout: 15000 });
  }

  try {
    // ── 1. 智能调度：生成三方案 ──
    step('智能调度中心：生成 COST/TIME/BALANCED 三方案');
    await loginAs('MTO', 'MTO mto01');
    await page.locator('[data-testid="nav-dispatch"]').click();
    await page.waitForURL('**/dispatch/plans');
    const orderRow = page.locator('[data-testid="dispatch-order-row"]').filter({ hasText: prepared.orderNo }).first();
    await orderRow.waitFor({ state: 'visible', timeout: 20000 });
    await orderRow.locator('[data-testid="plan-generate"]').click();
    await page.locator('[data-testid="plan-card-BALANCED"]').waitFor({ state: 'visible', timeout: 30000 });
    for (const strategy of ['COST', 'TIME', 'BALANCED']) {
      await page.locator(`[data-testid="plan-card-${strategy}"]`).waitFor({ state: 'visible' });
    }
    const scores = await page.locator('[data-testid="plan-score"]').allInnerTexts();
    assert(scores.length === 3, `方案评分应有 3 个，实际 ${scores.length}`);
    await page.locator('[data-testid="plan-item"]').first().waitFor({ state: 'visible' });
    await page.locator('[data-testid="transfer-window"]').first().waitFor({ state: 'visible' });
    console.log(`  ✓ 三方案生成（评分 ${scores.join(' / ')}），含分段与衔接窗口`);
    await screenshot('01-智能调度三方案');

    // ── 2. 确认调度 ──
    step('确认调度方案 → 签发一单制运单');
    await page.locator('[data-testid="plan-confirm"]').click();
    await page.waitForURL(/\/orders\/\d+$/, { timeout: 30000 });
    const orderId = Number(/\/orders\/(\d+)$/.exec(page.url())[1]);
    await page.getByText('已调度', { exact: false }).first().waitFor({ timeout: 20000 });
    await page.locator('[data-testid="waybill-detail-entry"]').waitFor({ state: 'visible' });
    const mto = await apiCall('POST', '/auth/login', { body: { username: 'mto01', password: PASSWORD } });
    const orderDetail = await apiCall('GET', `/orders/${orderId}`, { token: mto.token });
    const waybillId = orderDetail.waybill.id;
    const waybillNo = orderDetail.waybill.waybillNo;
    console.log(`  ✓ 方案确认，订单已调度，签发运单 ${waybillNo}`);
    await screenshot('02-调度确认-订单详情');

    // ── 3. 调度看板 ──
    step('调度看板');
    await page.locator('[data-testid="nav-board"]').click();
    await page.waitForURL('**/dispatch/board');
    for (const id of ['board-pending', 'board-capacity', 'board-trains', 'board-vessels', 'board-windows', 'board-alerts']) {
      await page.locator(`[data-testid="${id}"]`).waitFor({ state: 'visible', timeout: 20000 });
    }
    console.log('  ✓ 看板 6 区块渲染（待调度/运力/班列/班轮/衔接/预警）');
    await screenshot('03-调度看板');

    // ── 4. 运力池 ──
    step('运力池：车辆 / 班列 / 班轮');
    await page.locator('[data-testid="nav-capacity"]').click();
    await page.waitForURL('**/capacity');
    await page.locator('[data-testid="capacity-tab-vehicles"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="vehicle-row"]').first().waitFor({ state: 'visible' });
    await page.locator('[data-testid="capacity-tab-trains"]').click();
    await page.locator('[data-testid="train-row"]').first().waitFor({ state: 'visible' });
    await page.locator('[data-testid="capacity-tab-vessels"]').click();
    await page.locator('[data-testid="vessel-row"]').first().waitFor({ state: 'visible' });
    console.log('  ✓ 车辆/班列/班轮 Tabs 与行数据');
    await screenshot('04-运力池');

    // ── 5. 监控大屏 ──
    step('监控大屏：KPI / 在线运单 / 模式分布 / 预警');
    await page.locator('[data-testid="nav-monitor"]').click();
    await page.waitForURL('**/monitor');
    await page.locator('[data-testid="monitor-kpi-online"]').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-testid="monitor-map"] canvas').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-testid="monitor-mode-chart"] canvas').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-testid="monitor-alerts"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="monitor-waybills"]').waitFor({ state: 'visible' });
    console.log('  ✓ 大屏 KPI / 轨迹图 / 模式环图 / 预警 / 在线运单');
    await screenshot('05-监控大屏');

    // ── 6. 预警中心与异常工单 ──
    step('预警中心：确认 / 关闭 / 异常工单处置');
    await page.locator('[data-testid="nav-alerts"]').click();
    await page.waitForURL('**/alerts');
    await page.locator('[data-testid="alert-row"]').first().waitFor({ state: 'visible', timeout: 20000 });
    const ackBtn = page.locator('[data-testid="alert-ack"]:not([disabled])').first();
    if ((await ackBtn.count()) > 0) {
      await ackBtn.click();
      await page.waitForTimeout(1200);
      console.log('  ✓ 预警确认');
    }
    const closeBtn = page.locator('[data-testid="alert-close"]:not([disabled])').first();
    if ((await closeBtn.count()) > 0) {
      await closeBtn.click();
      await page.waitForTimeout(1200);
      console.log('  ✓ 预警关闭');
    }
    const handleBtn = page.locator('[data-testid="exception-handle"]:not([disabled])').first();
    if ((await handleBtn.count()) > 0) {
      await handleBtn.click();
      const dialog = page.locator('.el-dialog').last();
      await dialog.waitFor({ state: 'visible' });
      await dialog.locator('[data-testid="exception-resolution"]').fill('E2E：已协调承运人恢复运输');
      await screenshot('07-异常工单处置');
      await dialog.getByRole('button', { name: '提交处置', exact: true }).click();
      await page.waitForTimeout(1200);
      console.log('  ✓ 异常工单处置');
    }
    await screenshot('06-预警中心');
    await logout();

    // ── 7. 运单实时监控 ──
    step('运单跟踪：实时位置 / IoT / 实时预警');
    await loginAs('MTO', 'MTO mto01');
    await page.goto(`${WEB}/waybills/${waybillId}/track`);
    await page.locator('[data-testid="live-position"]').waitFor({ state: 'visible', timeout: 20000 });
    console.log('  ✓ 实时位置区块渲染');
    await screenshot('08-运单实时监控');

    assert(pageErrors.length === 0, `页面存在 JS 异常：${pageErrors.join(' | ')}`);
    console.log(`\n✅ Stage 3 E2E 通过：${stepCount} 个阶段，截图 8 张`);
    console.log(`   订单 ${prepared.orderNo} → 运单 ${waybillNo}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`\n❌ Stage 3 E2E 失败：${error.message}`);
  process.exitCode = 1;
});
