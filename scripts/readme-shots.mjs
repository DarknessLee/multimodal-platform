// 生成 README 各角色端功能截图（补充 docs/screenshots 的 8 张跨端精选图）
// 前提：API:8080 + Web:5173 已启动，数据库为干净种子
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const WEB = process.env.WEB_BASE || 'http://127.0.0.1:5173';
const API = process.env.API_BASE || 'http://127.0.0.1:8080/api';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'docs/screenshots/roles');
mkdirSync(outDir, { recursive: true });
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function api(method, path, { body, token } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`${method} ${path} -> ${json.code} ${json.message}`);
  return json.data;
}

async function prepareIds() {
  const shipper = await api('POST', '/auth/login', { body: { username: 'shipper01', password: 'demo123' } });
  const orders = await api('GET', '/orders', { token: shipper.token });
  const list = Array.isArray(orders) ? orders : orders.list;
  const signed = list.find((o) => o.status === 'SIGNED') ?? list.find((o) => o.status === 'DISPATCHED');
  if (!signed) throw new Error('未找到可展示的订单');
  const detail = await api('GET', `/orders/${signed.id}`, { token: shipper.token });
  const waybillId = detail.waybill?.id;
  if (!waybillId) throw new Error('订单缺少运单');
  return { orderId: signed.id, waybillId };
}

async function main() {
  const ids = await prepareIds();
  console.log(`data: orderId=${ids.orderId}, waybillId=${ids.waybillId}`);
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch {
    browser = await chromium.launch({ executablePath: EDGE_PATH, headless: true });
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  async function shot(name) {
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: false });
    console.log(`  📸 ${name}.png`);
  }
  async function loginAs(role) {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    }).catch(() => {});
    await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    await page.locator(`[data-testid="quick-login-${role}"]`).click();
    await page.waitForURL('**/dashboard', { timeout: 20000 });
    await page.locator('[data-testid="role-badge"]').waitFor({ state: 'visible' });
  }
  async function visit(path) {
    await page.goto(`${WEB}${path}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="page-title"], .page-title').first()
      .waitFor({ state: 'visible', timeout: 12000 })
      .catch(() => {});
    await page.waitForTimeout(1200);
  }

  try {
    // 登录页
    await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await shot('00-登录页');

    // 货主
    await loginAs('SHIPPER');
    await visit('/dashboard');
    await shot('01-货主-平台总览');
    await visit(`/orders/${ids.orderId}`);
    await shot('02-货主-订单详情');
    await visit(`/waybills/${ids.waybillId}/track`);
    await shot('03-货主-运单跟踪');

    // 货代
    await loginAs('FORWARDER');
    await visit('/quotes');
    await shot('04-货代-报价工作台');

    // 公路 / 铁路 / 水路承运人
    await loginAs('CARRIER');
    await visit('/tasks');
    await shot('05-公路承运人-运输任务');
    await loginAs('RAIL_CARRIER');
    await visit('/rail/tasks');
    await shot('06-铁路承运人-铁路工作台');
    await loginAs('SEA_CARRIER');
    await visit('/sea/tasks');
    await shot('07-水路承运人-水路工作台');

    // 港站
    await loginAs('TERMINAL');
    await visit('/terminal');
    await shot('08-港站-港站作业');
    await visit('/containers');
    await shot('09-港站-箱管中心');

    // 结算 / 金融
    await loginAs('SETTLEMENT');
    await visit('/finance/reconciliations');
    await shot('10-结算-对账管理');
    await loginAs('FINANCE');
    await visit('/finance/factoring');
    await shot('11-金融-保理工作台');

    // 保险
    await loginAs('INSURANCE');
    await visit('/insurance');
    await shot('12-保险-保险保单');

    // 监管
    await loginAs('REGULATOR');
    await visit('/regulator');
    await shot('13-监管-监管中心');
    await visit('/regulator/reports');
    await shot('14-监管-监管报送');

    // 平台运营
    await loginAs('ADMIN');
    await visit('/ops');
    await shot('15-平台运营-运营后台');

    if (errors.length > 0) throw new Error(`页面 JS 异常：${errors.slice(0, 2).join(' | ')}`);
    console.log(`\n✅ README 角色截图完成：${15} 个场景`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`❌ 截图失败：${error.message}`);
  process.exitCode = 1;
});
