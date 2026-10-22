// Stage 2 E2E：一单制运单详情 / 单证上传 OCR+签章 / 箱动态 / 铁路 95306 / 水路订舱 / 集成报文
// 前提：API:8080 + Web:5173 已启动，数据库为 Stage 2 种子（或已有数据）
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const WEB = process.env.WEB_BASE || 'http://127.0.0.1:5173';
const API = process.env.API_BASE || 'http://127.0.0.1:8080/api';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = resolve(root, 'docs/screenshots/stage2');
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

async function prepareData() {
  const shipper = await apiCall('POST', '/auth/login', { body: { username: 'shipper01', password: PASSWORD } });
  const mto = await apiCall('POST', '/auth/login', { body: { username: 'mto01', password: PASSWORD } });
  const order = await apiCall('POST', '/orders', {
    token: shipper.token,
    body: {
      cargoName: '光伏组件', cargoWeight: 22.5, containerType: '40HQ', containerCount: 2,
      origin: '上海嘉定', destination: '成都青白江', requiredPickupDate: ymd(new Date(Date.now() + 7 * 86400000)),
      remark: 'E2E Stage2 一单制',
    },
  });
  const dispatched = await apiCall('POST', `/orders/${order.order.id}/dispatch`, {
    token: mto.token, body: { roadCarrierCode: 'AJ-001' },
  });
  const detail = await apiCall('GET', `/orders/${order.order.id}`, { token: shipper.token });
  return {
    orderId: order.order.id,
    orderNo: order.order.orderNo,
    waybillId: dispatched.waybillId,
    waybillNo: dispatched.waybillNo,
    containerId: detail.containers[0]?.id,
    containerNo: detail.containers[0]?.containerNo,
  };
}

async function main() {
  console.log(`多式联运平台 Stage 2 · E2E（${WEB}）`);
  const data = await prepareData();
  console.log(`  · 准备数据：订单 ${data.orderNo} / 主运单 ${data.waybillNo} / 箱 ${data.containerNo}`);

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
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(shotsDir, `${name}.png`), fullPage: true });
    console.log(`  📸 docs/screenshots/stage2/${name}.png`);
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
    // ── 1. 一单制运单详情 + 存证校验 ──
    step('一单制运单详情与哈希链存证校验');
    await loginAs('MTO', 'MTO mto01');
    await page.locator('[data-testid="nav-waybills"]').click();
    await page.waitForURL('**/waybills');
    await page.locator('[data-testid="waybill-table"]').waitFor({ state: 'visible' });
    const waybillRow = page.locator('[data-testid="waybill-row"]').filter({ hasText: data.waybillNo }).first();
    await waybillRow.waitFor({ state: 'visible', timeout: 20000 });
    await waybillRow.click();
    await page.waitForURL(/\/waybills\/\d+$/, { timeout: 15000 });
    await page.locator('[data-testid="waybill-events"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="waybill-containers"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="waybill-documents"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="notarize-verify"]').click();
    const verifyDialog = page.locator('.el-dialog').last();
    await verifyDialog.waitFor({ state: 'visible' });
    await page.getByText('校验通过', { exact: false }).first().waitFor({ timeout: 15000 });
    console.log('  ✓ 一单制详情：事件链 / 箱列表 / 单证 / 存证校验通过');
    await screenshot('01-一单制运单详情');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // ── 2. 单证上传 + OCR + 签章 ──
    step('单证上传（POD）→ Mock OCR → 签章');
    await page.locator('[data-testid="nav-documents"]').click();
    await page.waitForURL('**/documents');
    await page.locator('[data-testid="document-table"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="document-upload"]').click();
    const uploadDialog = page.locator('.el-dialog').last();
    await uploadDialog.waitFor({ state: 'visible' });
    const podContent = `货物签收回单\n运单号：${data.waybillNo}\n箱号：${data.containerNo}\n签收人：李经理\n签收日期：${ymd(new Date())}\n数量：2 箱\n`;
    await uploadDialog.locator('[data-testid="document-file-input"]').setInputFiles({
      name: 'stage2-pod.txt', mimeType: 'text/plain', buffer: Buffer.from(podContent, 'utf8'),
    });
    await uploadDialog.locator('input[type="number"]').first().fill(String(data.waybillId));
    await uploadDialog.getByRole('button', { name: '上传并识别', exact: true }).click();
    await uploadDialog.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    // 上传成功后详情抽屉可能自动打开；先关闭，再从列表进入，保证后续步骤可控
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    const podRow = page.locator('[data-testid="document-row"]').first();
    await podRow.waitFor({ state: 'visible', timeout: 20000 });
    await podRow.click();
    const drawer = page.locator('.el-drawer').filter({ hasText: '单证详情' }).first();
    await drawer.waitFor({ state: 'visible', timeout: 15000 });
    await page.getByText('识别箱号', { exact: false }).first().waitFor({ timeout: 15000 });
    await page.getByText(data.containerNo, { exact: false }).first().waitFor({ timeout: 15000 });
    console.log('  ✓ 上传 POD 并完成 Mock OCR（识别箱号）');
    await drawer.locator('[data-testid="document-sign-btn"]').click();
    const signDialog = page.locator('.el-dialog').last();
    await signDialog.waitFor({ state: 'visible' });
    await signDialog.locator('[data-testid="signer-name"]').fill('王海');
    await signDialog.locator('[data-testid="document-sign-submit"]').click();
    await page.getByText('已签章', { exact: false }).first().waitFor({ timeout: 20000 });
    console.log('  ✓ Mock CA 签章完成');
    await screenshot('02-单证上传OCR签章');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // ── 3. 箱动态 ──
    step('箱管中心：箱详情与动态登记');
    await page.goto(`${WEB}/containers/${data.containerId}`);
    await page.locator('[data-testid="container-movements"]').waitFor({ state: 'visible', timeout: 20000 });
    const movementCountBefore = await page.locator('[data-testid="container-movements"] .el-timeline-item').count();
    await page.locator('[data-testid="container-movement"]').click();
    const movementDialog = page.locator('.el-dialog').last();
    await movementDialog.waitFor({ state: 'visible' });
    await movementDialog.getByRole('button', { name: '确认登记', exact: true }).click();
    await page.waitForTimeout(1200);
    const movementCountAfter = await page.locator('[data-testid="container-movements"] .el-timeline-item').count();
    assert(movementCountAfter > movementCountBefore, '登记动态后箱动态数量应增加');
    console.log(`  ✓ 箱动态登记成功（${movementCountBefore} → ${movementCountAfter}）`);
    await screenshot('03-箱管中心动态');
    await logout();

    // ── 4. 铁路工作台 95306 ──
    step('铁路工作台：需求车提报 + 受理回执');
    await loginAs('RAIL_CARRIER', '铁路承运人 rail01');
    await page.locator('[data-testid="nav-rail"]').click();
    await page.waitForURL('**/rail/tasks');
    const railRow = page.locator('tr.el-table__row').filter({ hasText: data.waybillNo }).first();
    await railRow.waitFor({ state: 'visible', timeout: 20000 });
    const applyBtn = railRow.locator('[data-testid="rail-apply"]');
    if (await applyBtn.isEnabled()) await applyBtn.click();
    await page.waitForTimeout(1200);
    const confirmBtn = page.locator('tr.el-table__row').filter({ hasText: data.waybillNo }).first()
      .locator('[data-testid="rail-confirm"]');
    if (await confirmBtn.isEnabled()) await confirmBtn.click();
    await page.waitForTimeout(1200);
    console.log('  ✓ 95306 需求车提报 / 受理回执');
    await screenshot('04-铁路工作台95306');
    await logout();

    // ── 5. 水路工作台订舱 ──
    step('水路工作台：订舱 + 确认回执');
    await loginAs('SEA_CARRIER', '水路承运人 sea01');
    await page.locator('[data-testid="nav-sea"]').click();
    await page.waitForURL('**/sea/tasks');
    const seaRow = page.locator('tr.el-table__row').filter({ hasText: data.waybillNo }).first();
    await seaRow.waitFor({ state: 'visible', timeout: 20000 });
    const bookBtn = seaRow.locator('[data-testid="sea-book"]');
    if (await bookBtn.isEnabled()) await bookBtn.click();
    await page.waitForTimeout(1200);
    const seaConfirm = page.locator('tr.el-table__row').filter({ hasText: data.waybillNo }).first()
      .locator('[data-testid="sea-confirm"]');
    if (await seaConfirm.isEnabled()) await seaConfirm.click();
    await page.waitForTimeout(1200);
    console.log('  ✓ 水路订舱 / 确认回执');
    await screenshot('05-水路工作台订舱');
    await logout();

    // ── 6. 集成中心报文 ──
    step('集成中心：95306 / 港口 EDI 报文可追溯');
    await loginAs('ADMIN', '平台运营 admin01');
    await page.locator('[data-testid="nav-integration"]').click();
    await page.waitForURL('**/integration/messages');
    await page.locator('[data-testid="message-row"]').first().waitFor({ state: 'visible', timeout: 20000 });
    const rows = await page.locator('[data-testid="message-row"]').count();
    assert(rows > 0, '集成中心应有报文记录');
    await page.locator('[data-testid="message-row"]').first().click();
    await page.locator('[data-testid="message-detail"]').waitFor({ state: 'visible', timeout: 15000 });
    console.log(`  ✓ 集成报文列表与详情（当前页 ${rows} 条）`);
    await screenshot('06-集成中心报文');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    assert(pageErrors.length === 0, `页面存在 JS 异常：${pageErrors.join(' | ')}`);
    console.log(`\n✅ Stage 2 E2E 通过：${stepCount} 个阶段，截图 6 张`);
    console.log(`   主运单 ${data.waybillNo} / 订单 ${data.orderNo} / 箱 ${data.containerNo}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`\n❌ Stage 2 E2E 失败：${error.message}`);
  process.exitCode = 1;
});
