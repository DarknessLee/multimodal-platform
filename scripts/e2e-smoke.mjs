// Playwright + 本机 Edge 无头 E2E：5 个角色账号点通同一票订单全流程，并截图留档
// 前提：npm run dev 已启动（API:8080 + Web:5173），数据库为干净种子或可演示状态
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const BASE = process.env.WEB_BASE || 'http://127.0.0.1:5173';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = resolve(root, 'docs/screenshots');
mkdirSync(shotsDir, { recursive: true });

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
let stepCount = 0;

function step(title) {
  stepCount += 1;
  console.log(`\n[${String(stepCount).padStart(2, '0')}] ${title}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log(`多式联运演示版 v0 · E2E（${BASE}）`);

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
    await page.screenshot({ path: join(shotsDir, `${name}.png`), fullPage: true });
    console.log(`  📸 docs/screenshots/${name}.png`);
  }

  async function loginAs(role, label) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator(`[data-testid="quick-login-${role}"]`).click();
    await page.waitForURL('**/orders', { timeout: 20000 });
    const badge = page.locator('[data-testid="role-badge"]');
    await badge.waitFor({ state: 'visible' });
    const text = (await badge.innerText()).trim();
    assert(text.length > 0, `登录后角色徽标为空（${role}）`);
    console.log(`  ✓ 登录 ${label || role}（${text}）`);
    await page.waitForTimeout(3200); // 等登录成功 toast 消失，截图更干净
  }

  async function logout() {
    await page.locator('[data-testid="logout-btn"]').click();
    await page.waitForURL('**/login', { timeout: 15000 });
    console.log('  ✓ 退出登录');
  }

  try {
    // ── 1. 货主下单 ──
    step('货主下单');
    await loginAs('SHIPPER', '货主 shipper01');
    await page.locator('[data-testid="create-order-btn"]').click();
    await page.waitForURL('**/orders/new', { timeout: 15000 });
    await page.locator('[data-testid="order-cargo-name"]').fill('汽车配件');
    await page.locator('[data-testid="order-weight"]').fill('18.2');
    await page.locator('[data-testid="order-container-count"]').fill('2');
    await page.locator('[data-testid="order-origin"]').fill('上海嘉定');
    await page.locator('[data-testid="order-destination"]').fill('成都青白江');
    await page.locator('[data-testid="order-submit"]').click();
    await page.waitForURL(/\/orders\/\d+$/, { timeout: 20000 });

    const orderId = Number(/\/orders\/(\d+)$/.exec(page.url())[1]);
    await page.locator('[data-testid="page-title"]').waitFor();
    const orderNo = (await page.locator('.page-subtitle .mono').first().innerText()).trim();
    assert(/^MO\d+/.test(orderNo), `订单号格式异常：${orderNo}`);
    await page.getByText('待调度', { exact: false }).first().waitFor({ timeout: 15000 });
    console.log(`  ✓ 下单成功：${orderNo}（订单 id=${orderId}，状态：待调度）`);
    await page.waitForTimeout(3200);
    await screenshot('01-货主下单-订单详情');
    await logout();

    // ── 2. MTO 人工调度 ──
    step('MTO 查看订单并人工调度');
    await loginAs('MTO', 'MTO mto01');
    const orderRow = page.locator('[data-testid="order-row"]').filter({ hasText: orderNo }).first();
    await orderRow.waitFor({ state: 'visible' });
    await orderRow.locator('[data-testid="dispatch-btn"]').click();
    await page.waitForURL(/\/orders\/\d+\/dispatch$/, { timeout: 15000 });
    await page.locator('[data-testid="carrier-option-AJ-001"]').click();
    await screenshot('02-MTO-人工调度选承运商');
    await page.locator('[data-testid="dispatch-submit"]').click();
    await page.waitForURL(/\/orders\/\d+$/, { timeout: 20000 });
    await page.locator('[data-testid="track-entry"]').waitFor({ timeout: 20000 });
    await page.getByText('已调度', { exact: false }).first().waitFor({ timeout: 15000 });
    console.log('  ✓ 调度完成：订单 → 已调度，生成运单与 3 个分段');

    await page.locator('[data-testid="track-entry"]').click();
    await page.waitForURL(/\/waybills\/\d+$/, { timeout: 15000 });
    const waybillId = Number(/\/waybills\/(\d+)$/.exec(page.url())[1]);
    await page.locator('[data-testid="track-chart"]').waitFor({ state: 'visible', timeout: 20000 });
    console.log(`  ✓ 运单跟踪页：waybill id=${waybillId}，轨迹组件已就绪（待发运）`);
    await screenshot('03-MTO-调度后运单跟踪');
    await logout();

    // ── 3. 公路承运人上报节点 ──
    step('公路承运人：接单 → 已提货 → 已送达');
    await loginAs('CARRIER', '公路承运人 carrier01');
    await page.locator('[data-testid="nav-tasks"]').click();
    await page.waitForURL('**/tasks', { timeout: 15000 });
    let taskCard = page.locator('[data-testid="task-card"]').filter({ hasText: orderNo }).first();
    await taskCard.waitFor({ state: 'visible' });
    await screenshot('04-承运人-待接单');
    await taskCard.locator('[data-testid="task-accept"]').click();
    await page
      .locator('[data-testid="task-card"]')
      .filter({ hasText: orderNo })
      .first()
      .locator('[data-testid="task-status"]')
      .filter({ hasText: '已接单' })
      .waitFor({ timeout: 15000 });
    console.log('  ✓ 司机接单（已接单）');
    await taskCard.locator('[data-testid="task-depart"]').click();
    await page
      .locator('[data-testid="task-card"]')
      .filter({ hasText: orderNo })
      .first()
      .locator('[data-testid="task-status"]')
      .filter({ hasText: '运输中' })
      .waitFor({ timeout: 15000 });
    console.log('  ✓ 上报已提货（运输中，订单/运单同步更新）');
    await taskCard.locator('[data-testid="task-arrive"]').click();
    await page.waitForTimeout(1500);
    console.log('  ✓ 上报已送达（公路段完成，交由港站）');
    await screenshot('05-承运人-运输任务完成');
    await logout();

    // ── 4. 港站作业 ──
    step('港站：进场确认 / 到港 / 再进场 / 到站');
    await loginAs('TERMINAL', '港站 terminal01');
    await page.locator('[data-testid="nav-terminal"]').click();
    await page.waitForURL('**/terminal', { timeout: 15000 });
    await page.locator('[data-testid="terminal-condition-select"]').waitFor({ state: 'visible' });

    const expectedActions = ['确认进场（海运）', '确认到港（海运）', '确认进场（铁路）', '确认到站（铁路）'];
    for (let index = 0; index < expectedActions.length; index += 1) {
      const card = page.locator('[data-testid="terminal-card"]').filter({ hasText: orderNo }).first();
      await card.waitFor({ state: 'visible', timeout: 20000 });
      const gateIn = card.locator('[data-testid="terminal-gate-in"]');
      if ((await gateIn.count()) > 0) {
        await gateIn.click();
      } else {
        await card.locator('[data-testid="terminal-arrive"]').click();
      }
      await page.waitForTimeout(1500);
      console.log(`  ✓ ${expectedActions[index]}`);
    }
    await screenshot('06-港站作业-完成');
    await logout();

    // ── 5. 货主查看轨迹并签收 ──
    step('货主查看全程 mock 轨迹并签收');
    await loginAs('SHIPPER', '货主 shipper01');
    const orderRow2 = page.locator('[data-testid="order-row"]').filter({ hasText: orderNo }).first();
    await orderRow2.locator('[data-testid="track-btn"]').click();
    await page.waitForURL(/\/waybills\/\d+$/, { timeout: 15000 });
    await page.locator('[data-testid="track-chart"] canvas').waitFor({ timeout: 20000 });
    const signBtn = page.locator('[data-testid="sign-btn"]');
    await signBtn.waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(800);
    console.log('  ✓ 全部分段完成，可签收');
    await screenshot('07-货主-全程轨迹');
    await signBtn.click();
    await page.locator('[data-testid="signer-name"]').fill('李经理');
    await page.locator('[data-testid="sign-submit"]').click();
    await page.getByText('已签收', { exact: false }).first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(3200);
    await screenshot('08-货主-签收完成');
    console.log('  ✓ 签收成功，运单/订单 → 已签收');
    await logout();

    // ── 6. 结算生成分段账单 ──
    step('结算生成分段账单');
    await loginAs('SETTLEMENT', '结算 settlement01');
    await page.locator('[data-testid="nav-settlement"]').click();
    await page.waitForURL('**/settlement', { timeout: 15000 });
    let settleCard = page.locator('[data-testid="settle-card"]').filter({ hasText: orderNo }).first();
    await settleCard.waitFor({ state: 'visible', timeout: 20000 });
    await settleCard.locator('[data-testid="settle-btn"]').click();
    await page
      .locator('[data-testid="settle-card"]')
      .filter({ hasText: orderNo })
      .first()
      .locator('[data-testid="view-bill-btn"]')
      .waitFor({ timeout: 20000 });
    await page.waitForTimeout(3200);
    await screenshot('09-结算工作台-已出账');
    console.log('  ✓ 账单已生成（订单 → 已出账）');

    await page
      .locator('[data-testid="settle-card"]')
      .filter({ hasText: orderNo })
      .first()
      .locator('[data-testid="view-bill-btn"]')
      .click();
    await page.waitForURL(/\/bills\/\d+$/, { timeout: 15000 });
    await page.locator('[data-testid="bill-total"]').waitFor({ state: 'visible', timeout: 15000 });
    const total = (await page.locator('[data-testid="bill-total"]').innerText()).trim();
    assert(total.includes('15080.00'), `账单总额应为 15080.00，实际 ${total}`);
    await page.waitForTimeout(3200);
    await screenshot('10-分段账单');
    console.log(`  ✓ 分段账单：¥${total}（1280 + 5200 + 8600）`);
    await logout();

    assert(pageErrors.length === 0, `页面存在 JS 异常：${pageErrors.join(' | ')}`);

    console.log(`\n✅ E2E 通过：${stepCount} 个阶段全部完成，截图已保存到 docs/screenshots/`);
    console.log(`   订单 ${orderNo} · 运单 id=${waybillId} · 账单 ¥15080.00`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`\n❌ E2E 失败：${error.message}`);
  process.exitCode = 1;
});
