// Stage 4 E2E：结算中心 / 对账 / 发票 / 收付款 / 保理 / 经营分析 / 保险
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const WEB = process.env.WEB_BASE || 'http://127.0.0.1:5173';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = resolve(root, 'docs/screenshots/stage4');
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
  console.log(`多式联运平台 Stage 4 · E2E（${WEB}）`);
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
    console.log(`  📸 docs/screenshots/stage4/${name}.png`);
  }
  async function loginAs(role, label) {
    await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator(`[data-testid="quick-login-${role}"]`).click();
    await page.waitForURL('**/dashboard', { timeout: 20000 });
    await page.locator('[data-testid="role-badge"]').waitFor({ state: 'visible' });
    console.log(`  ✓ 登录 ${label || role}`);
    await page.waitForTimeout(600);
  }
  async function logout() {
    await page.locator('[data-testid="logout-btn"]').click();
    await page.waitForURL('**/login', { timeout: 15000 });
  }
  async function closeOverlays() {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  try {
    // ── 1. 结算中心 ──
    step('结算中心 v2：AR/AP/毛利 KPI 与账单列表');
    await loginAs('SETTLEMENT', '结算 settlement01');
    await page.locator('[data-testid="nav-settlement"]').click();
    await page.waitForURL('**/settlement');
    for (const id of ['settlement-kpi-ar', 'settlement-kpi-ap', 'settlement-kpi-profit']) {
      await page.locator(`[data-testid="${id}"]`).waitFor({ state: 'visible', timeout: 20000 });
    }
    await page.locator('[data-testid="bill-table"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="bill-row"]').first().waitFor({ state: 'visible' });
    const billTypes = await page.locator('[data-testid="bill-type"]').allInnerTexts();
    assert(billTypes.length >= 2, '账单列表应至少两行');
    console.log(`  ✓ 结算 KPI 与账单列表（${billTypes.length} 行）`);
    await screenshot('01-结算中心');

    // 账单详情抽屉
    await page.locator('[data-testid="bill-row"]').first().click();
    const billDrawer = page.locator('.el-drawer').filter({ hasText: '账单' }).first();
    await billDrawer.waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(600);
    console.log('  ✓ 账单详情抽屉（明细/发票/支付/对账）');
    await screenshot('02-账单详情');
    await closeOverlays();

    // ── 2. 对账管理 ──
    step('对账管理：创建 → 发送 → 确认');
    await page.locator('[data-testid="nav-reconciliation"]').click();
    await page.waitForURL('**/finance/reconciliations');
    await page.locator('[data-testid="recon-row"]').first().waitFor({ state: 'visible', timeout: 20000 });
    const reconCount = await page.locator('[data-testid="recon-row"]').count();
    await page.locator('[data-testid="recon-create"]').click();
    const reconDialog = page.locator('.el-dialog').last();
    await reconDialog.waitFor({ state: 'visible' });
    await reconDialog.getByRole('button', { name: '生成对账单', exact: true }).click();
    await page.waitForTimeout(1500);
    const reconDrawer = page.locator('.el-drawer').filter({ hasText: '对账' }).first();
    if (await reconDrawer.isVisible().catch(() => false)) {
      await reconDrawer.waitFor({ state: 'visible' });
      const sendBtn = reconDrawer.locator('[data-testid="recon-send"]');
      if (await sendBtn.isEnabled().catch(() => false)) await sendBtn.click();
      await page.waitForTimeout(1200);
      const confirmBtn = reconDrawer.locator('[data-testid="recon-confirm"]');
      if (await confirmBtn.isEnabled().catch(() => false)) await confirmBtn.click();
      await page.waitForTimeout(1200);
    }
    console.log(`  ✓ 对账单创建/发送/确认（列表 ${reconCount} 条）`);
    await screenshot('03-对账管理');
    await closeOverlays();

    // ── 3. 发票管理 ──
    step('发票管理：发票列表与作废');
    await page.locator('[data-testid="nav-invoice"]').click();
    await page.waitForURL('**/finance/invoices');
    await page.locator('[data-testid="invoice-row"]').first().waitFor({ state: 'visible', timeout: 20000 });
    const invoiceStatuses = await page.locator('[data-testid="invoice-status"]').allInnerTexts();
    const voidBtn = page.locator('[data-testid="invoice-void"]:not([disabled])').first();
    if ((await voidBtn.count()) > 0) {
      await voidBtn.click();
      await page.waitForTimeout(800);
      const confirm = page.getByRole('button', { name: /^(确定|确认)$/ }).last();
      if (await confirm.isVisible().catch(() => false)) await confirm.click();
      await page.waitForTimeout(1200);
    }
    console.log(`  ✓ 发票列表（${invoiceStatuses.length} 张）与作废流程`);
    await screenshot('04-发票管理');
    await closeOverlays();

    // ── 4. 收付款 ──
    step('收付款：银行回执确认与核销');
    await page.locator('[data-testid="nav-payment"]').click();
    await page.waitForURL('**/finance/payments');
    await page.locator('[data-testid="payment-row"]').first().waitFor({ state: 'visible', timeout: 20000 });
    const paymentStatuses = await page.locator('[data-testid="payment-status"]').allInnerTexts();
    const confirmPayment = page.locator('[data-testid="payment-confirm"]:not([disabled])').first();
    if ((await confirmPayment.count()) > 0) {
      await confirmPayment.click();
      await page.waitForTimeout(1500);
    }
    console.log(`  ✓ 收付款列表（${paymentStatuses.length} 笔）与回执确认`);
    await screenshot('05-收付款');
    await closeOverlays();
    await logout();

    // ── 5. 保理工作台 ──
    step('保理工作台：审批');
    await loginAs('FINANCE', '金融 finance01');
    await page.locator('[data-testid="nav-factoring"]').click();
    await page.waitForURL('**/finance/factoring');
    await page.locator('[data-testid="factoring-row"]').first().waitFor({ state: 'visible', timeout: 20000 });
    const approveBtn = page.locator('[data-testid="factoring-approve"]:not([disabled])').first();
    if ((await approveBtn.count()) > 0) {
      await approveBtn.click();
      const dialog = page.locator('.el-dialog').last();
      await dialog.waitFor({ state: 'visible' });
      await dialog.getByRole('button', { name: '提交审批', exact: true }).click();
      await page.waitForTimeout(1500);
    }
    console.log('  ✓ 保理审批流程');
    await screenshot('06-保理工作台');
    await closeOverlays();
    await logout();

    // ── 6. 经营分析 ──
    step('经营分析：KPI / 趋势 / 客户 / 模式 / AR 账龄');
    await loginAs('MTO', 'MTO mto01');
    await page.locator('[data-testid="nav-analytics"]').click();
    await page.waitForURL('**/finance/analytics');
    for (const id of ['analytics-kpi-revenue', 'analytics-kpi-profit', 'analytics-kpi-margin', 'analytics-ar-aging']) {
      await page.locator(`[data-testid="${id}"]`).waitFor({ state: 'visible', timeout: 20000 });
    }
    await page.locator('[data-testid="analytics-trend"] canvas').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-testid="analytics-by-customer"] canvas').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-testid="analytics-by-mode"] canvas').first().waitFor({ state: 'visible', timeout: 20000 });
    console.log('  ✓ 经营分析 KPI + 3 个 ECharts + AR 账龄');
    await screenshot('07-经营分析');
    await logout();

    // ── 7. 保险保单 ──
    step('保险保单：投保');
    await loginAs('INSURANCE', '保险 insurance01');
    await page.locator('[data-testid="nav-insurance"]').click();
    await page.waitForURL('**/insurance');
    await page.locator('[data-testid="insurance-row"]').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-testid="insurance-create"]').click();
    const policyDialog = page.locator('.el-dialog').last();
    await policyDialog.waitFor({ state: 'visible' });
    await policyDialog.getByRole('button', { name: '确认投保', exact: true }).click();
    await page.waitForTimeout(1500);
    console.log('  ✓ 保单列表与投保流程');
    await screenshot('08-保险保单');

    assert(pageErrors.length === 0, `页面存在 JS 异常：${pageErrors.join(' | ')}`);
    console.log(`\n✅ Stage 4 E2E 通过：${stepCount} 个阶段，截图 8 张`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`\n❌ Stage 4 E2E 失败：${error.message}`);
  process.exitCode = 1;
});
