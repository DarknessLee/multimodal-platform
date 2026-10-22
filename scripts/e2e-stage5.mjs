// Stage 5 E2E：集成中心 / 监管看板与报送 / 合规检查 / 运营后台 / 配置 / 任务 / 全链路验收
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const WEB = process.env.WEB_BASE || 'http://127.0.0.1:5173';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = resolve(root, 'docs/screenshots/stage5');
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
  console.log(`多式联运平台 Stage 5 · E2E（${WEB}）`);
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
    console.log(`  📸 docs/screenshots/stage5/${name}.png`);
  }
  async function loginAs(role, label) {
    await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator(`[data-testid="quick-login-${role}"]`).click();
    await page.waitForURL('**/dashboard', { timeout: 20000 });
    await page.locator('[data-testid="role-badge"]').waitFor({ state: 'visible' });
    console.log(`  ✓ 登录 ${label || role}`);
    await page.waitForTimeout(600);
  }
  async function closeOverlays() {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  try {
    // ── 1. 集成中心 ──
    step('集成中心：适配器健康、报文详情、批量重试、统计');
    await loginAs('ADMIN', '平台运营 admin01');
    await page.locator('[data-testid="nav-integration"]').click();
    await page.waitForURL('**/integration/messages');
    await page.locator('[data-testid="adapter-card"]').first().waitFor({ state: 'visible', timeout: 20000 });
    const adapterCount = await page.locator('[data-testid="adapter-card"]').count();
    assert(adapterCount >= 6, `适配器卡片应 ≥6，实际 ${adapterCount}`);
    await page.locator('[data-testid="adapter-test"]').first().click();
    await page.waitForTimeout(1500);
    await page.locator('[data-testid="integration-stats"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="message-row"]').first().waitFor({ state: 'visible' });
    console.log(`  ✓ 适配器 ${adapterCount} 张、连通测试、统计区`);
    await screenshot('01-集成中心');
    await page.locator('[data-testid="message-row"]').first().click();
    const messageDrawer = page.locator('.el-drawer').filter({ hasText: '报文' }).first();
    await messageDrawer.waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(600);
    console.log('  ✓ 报文详情（请求/响应/重试次数）');
    await screenshot('02-报文详情');
    await closeOverlays();

    const checkboxes = page.locator('.el-table__row .el-checkbox');
    const checkboxCount = await checkboxes.count();
    for (let i = 0; i < Math.min(2, checkboxCount); i += 1) {
      await checkboxes.nth(i).click();
    }
    const retryBatch = page.locator('[data-testid="message-retry-batch"]');
    if (await retryBatch.isEnabled().catch(() => false)) {
      await retryBatch.click();
      await page.waitForTimeout(1800);
      console.log('  ✓ 批量重试提交');
    }

    // ── 2. 监管看板与报送 ──
    step('监管看板与监管报送');
    await page.locator('[data-testid="nav-regulator"]').click();
    await page.waitForURL('**/regulator');
    await page.locator('[data-testid="regulator-kpi-reports"]').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-testid="regulator-kpi-compliance"]').waitFor({ state: 'visible' });
    console.log('  ✓ 监管 KPI 与最近报送/合规');
    await screenshot('03-监管看板');

    await page.goto(`${WEB}/regulator/reports`);
    await page.locator('[data-testid="report-row"]').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-testid="report-create"]').click();
    const createDialog = page.locator('.el-dialog').last();
    await createDialog.waitFor({ state: 'visible' });
    await createDialog.getByRole('button', { name: '生成报送单', exact: true }).click();
    await page.waitForTimeout(1800);
    const submitBtn = page.locator('[data-testid="report-submit"]:not([disabled])').first();
    if ((await submitBtn.count()) > 0) {
      await submitBtn.click();
      await page.waitForTimeout(1200);
    }
    const acceptBtn = page.locator('[data-testid="report-accept"]:not([disabled])').first();
    if ((await acceptBtn.count()) > 0) {
      await acceptBtn.click();
      const acceptDialog = page.locator('.el-dialog').last();
      await acceptDialog.waitFor({ state: 'visible' });
      await acceptDialog.getByRole('button', { name: '提交回执', exact: true }).click();
      await page.waitForTimeout(1500);
    }
    console.log('  ✓ 报送生成 → 提交 → 受理回执');
    await screenshot('04-监管报送');
    await closeOverlays();

    // ── 3. 合规检查 ──
    step('合规检查：执行 5 类规则');
    await page.goto(`${WEB}/regulator/compliance`);
    await page.locator('[data-testid="compliance-row"]').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-testid="compliance-run"]').click();
    await page.locator('[data-testid="compliance-result"]').waitFor({ state: 'visible', timeout: 20000 });
    console.log('  ✓ 合规检查执行与汇总');
    await screenshot('05-合规检查');

    // ── 4. 运营后台 / 配置 / 任务 ──
    step('运营后台：健康巡检、配置、任务');
    await page.locator('[data-testid="nav-ops"]').click();
    await page.waitForURL('**/ops');
    await page.locator('[data-testid="ops-health"]').waitFor({ state: 'visible', timeout: 20000 });
    console.log('  ✓ 健康巡检与数据量');
    await screenshot('06-运营后台');

    await page.goto(`${WEB}/ops/configs`);
    await page.locator('[data-testid="ops-config-row"]').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-testid="ops-config-save"]').first().click();
    await page.waitForTimeout(1200);
    await page.getByRole('tab', { name: '数据字典' }).click();
    await page.locator('[data-testid="ops-dict-row"]').first().waitFor({ state: 'visible', timeout: 20000 });
    console.log('  ✓ 系统配置保存与字典列表');
    await screenshot('07-配置与字典');

    await page.goto(`${WEB}/ops/jobs`);
    await page.locator('[data-testid="ops-job-row"]').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-testid="ops-job-run"]').first().click();
    await page.waitForTimeout(1500);
    console.log('  ✓ 定时任务执行');
    await screenshot('08-定时任务');

    // ── 5. 全链路验收 ──
    step('全链路验收：5 Stage 检查');
    await page.locator('[data-testid="nav-acceptance"]').click();
    await page.waitForURL('**/acceptance');
    await page.locator('[data-testid="acceptance-stage"]').first().waitFor({ state: 'visible', timeout: 20000 });
    const stageCount = await page.locator('[data-testid="acceptance-stage"]').count();
    assert(stageCount === 5, `全链路验收应显示 5 个 Stage，实际 ${stageCount}`);
    await page.locator('[data-testid="acceptance-run"]').click();
    await page.waitForTimeout(2000);
    await page.locator('[data-testid="acceptance-summary"]').waitFor({ state: 'visible' });
    console.log(`  ✓ 全链路验收 ${stageCount} Stage 与汇总`);
    await screenshot('09-全链路验收');

    assert(pageErrors.length === 0, `页面存在 JS 异常：${pageErrors.join(' | ')}`);
    console.log(`\n✅ Stage 5 E2E 通过：${stepCount} 个阶段，截图 9 张`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`\n❌ Stage 5 E2E 失败：${error.message}`);
  process.exitCode = 1;
});
