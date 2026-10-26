// 全账号功能巡检：遍历 12 个账号可见菜单 + 关键详情页，检查 API 4xx/5xx、页面 JS 异常、加载错误
// 前提：API:8080 + Web:5173 已启动，数据库为干净种子；仅做只读页面巡检，不写业务数据
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const API = process.env.API_BASE || 'http://127.0.0.1:8080/api';
const WEB = process.env.WEB_BASE || 'http://127.0.0.1:5173';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failDir = resolve(root, '.tmp/account-audit');
mkdirSync(failDir, { recursive: true });
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const ACCOUNTS = [
  { username: 'shipper01', role: 'SHIPPER', label: '货主' },
  { username: 'forwarder01', role: 'FORWARDER', label: '货代' },
  { username: 'mto01', role: 'MTO', label: '多式联运经营人' },
  { username: 'carrier01', role: 'CARRIER', label: '公路承运人' },
  { username: 'rail01', role: 'RAIL_CARRIER', label: '铁路承运人' },
  { username: 'sea01', role: 'SEA_CARRIER', label: '水路承运人' },
  { username: 'terminal01', role: 'TERMINAL', label: '港站' },
  { username: 'settlement01', role: 'SETTLEMENT', label: '结算' },
  { username: 'finance01', role: 'FINANCE', label: '金融机构' },
  { username: 'insurance01', role: 'INSURANCE', label: '保险机构' },
  { username: 'regulator01', role: 'REGULATOR', label: '监管机构' },
  { username: 'admin01', role: 'ADMIN', label: '平台运营' },
];

async function apiLogin(username) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'demo123' }),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`登录 ${username} 失败：${json.code} ${json.message}`);
  return {
    token: json.data.token,
    permissions: json.data.permissions ?? json.data.user?.permissions ?? [],
  };
}

async function safeGet(token, path) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const json = await res.json();
  if (json.code !== 0) return null;
  return json.data;
}

async function collectIds(token) {
  const ids = {};
  const listOf = (data) => (Array.isArray(data) ? data : data?.list);
  const orders = listOf(await safeGet(token, '/orders'));
  if (orders?.length) ids.order = orders[0].id;
  const waybills = listOf(await safeGet(token, '/waybills?page=1&pageSize=5'));
  if (waybills?.length) ids.waybill = waybills[0].id;
  const containers = listOf(await safeGet(token, '/containers?page=1&pageSize=5'));
  if (containers?.length) ids.container = containers[0].id;
  const bills = listOf(await safeGet(token, '/bills?page=1&pageSize=5'));
  if (bills?.length) ids.bill = bills[0].id;
  const quotes = listOf(await safeGet(token, '/quotes?page=1&pageSize=5'));
  if (quotes?.length) ids.quote = quotes[0].id;
  const contracts = listOf(await safeGet(token, '/contracts?page=1&pageSize=5'));
  if (contracts?.length) ids.contract = contracts[0].id;
  return ids;
}

function detailRoutes(ids, permissions) {
  const can = (code) => permissions.includes(code);
  const routes = [];
  if (ids.order && can('menu:orders')) {
    routes.push(`/orders/${ids.order}`);
  }
  if (ids.order && can('order:create')) {
    routes.push('/orders/new');
  }
  if (ids.waybill && can('menu:waybills')) routes.push(`/waybills/${ids.waybill}`);
  if (ids.waybill && can('menu:track')) routes.push(`/waybills/${ids.waybill}/track`);
  if (ids.container && can('menu:containers')) routes.push(`/containers/${ids.container}`);
  if (ids.bill && (can('menu:bills') || can('menu:settlement'))) routes.push(`/bills/${ids.bill}`);
  if (ids.quote && can('menu:quotes')) routes.push(`/quotes/${ids.quote}`);
  if (ids.contract && can('menu:contracts')) routes.push(`/contracts/${ids.contract}`);
  return routes;
}

function loadMenuCatalog() {
  const text = readFileSync(resolve(root, 'web/src/utils/constants.ts'), 'utf8');
  const items = [];
  for (const match of text.matchAll(/\{ code: '(menu:[^']+)', label: '[^']*', path: '([^']+)', testid: '[^']+'/g)) {
    items.push({ code: match[1], path: match[2] });
  }
  return [...new Map(items.map((item) => [item.path, item])).values()];
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch {
    browser = await chromium.launch({ executablePath: EDGE_PATH, headless: true });
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);

  const failures = [];
  let totalPages = 0;

  for (const account of ACCOUNTS) {
    const auth = await apiLogin(account.username);
    const token = auth.token;
    const ids = await collectIds(token);
    // 清理会话，切换到当前角色
    await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }).catch(() => {});
    await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator(`[data-testid="quick-login-${account.role}"]`).click();
    await page.waitForURL('**/dashboard', { timeout: 20000 });
    await page.locator('[data-testid="role-badge"]').waitFor({ state: 'visible' });

    const menuRoutes = loadMenuCatalog()
      .filter((item) => auth.permissions.includes(item.code))
      .map((item) => item.path);
    const routes = [...new Set([...menuRoutes, ...detailRoutes(ids, auth.permissions)])];
    const roleFailures = [];

    console.log(`▶ ${account.username} (${account.label})：${routes.length} 页`);
    for (const route of routes) {
      console.log(`   · ${route}`);
      const pageErrors = [];
      const consoleErrors = [];
      const apiErrors = [];
      const onPageError = (error) => pageErrors.push(error.message);
      const onConsole = (message) => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300)); };
      const onResponse = (response) => {
        if (response.url().includes('/api/') && response.status() >= 400) {
          apiErrors.push(`${response.status()} ${response.request().method()} ${response.url().replace(WEB, '')}`);
        }
      };
      page.on('pageerror', onPageError);
      page.on('console', onConsole);
      page.on('response', onResponse);
      let errorText = '';
      try {
        await page.goto(`${WEB}${route}`, { waitUntil: 'domcontentloaded', timeout: 12000 });
        await page.locator('[data-testid="page-title"], .page-title').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(600);
        if (page.url().includes('/login')) errorText = '会话被重定向到登录页';
        if (page.url().includes('/403')) errorText = '被重定向到 403 页面';
        const alert = page.locator('.el-alert--error').first();
        if (await alert.isVisible().catch(() => false)) {
          errorText = (await alert.innerText().catch(() => '')).trim().slice(0, 200);
        }
      } catch (error) {
        errorText = error instanceof Error ? error.message : String(error);
      } finally {
        page.off('pageerror', onPageError);
        page.off('console', onConsole);
        page.off('response', onResponse);
      }
      totalPages += 1;
      const uniqueApiErrors = [...new Set(apiErrors)];
      const uniqueConsoleErrors = [...new Set(consoleErrors)];
      if (errorText || pageErrors.length || uniqueConsoleErrors.length || uniqueApiErrors.length) {
        const detail = {
          role: account.role, username: account.username, route,
          errorText, pageErrors, consoleErrors: uniqueConsoleErrors, apiErrors: uniqueApiErrors,
        };
        failures.push(detail);
        roleFailures.push(detail);
        const safeName = `${account.username}-${route.replace(/[^a-zA-Z0-9]+/g, '_')}`.slice(0, 80);
        await page.screenshot({ path: join(failDir, `${safeName}.png`) }).catch(() => {});
      }
    }

    console.log(`${roleFailures.length === 0 ? '✅' : '❌'} ${account.username} (${account.label})：${routes.length} 页，失败 ${roleFailures.length}`);
    if (roleFailures.length > 0) {
      for (const failure of roleFailures.slice(0, 8)) {
        console.log(`   - ${failure.route}${failure.errorText ? ` | ${failure.errorText}` : ''}`);
        if (failure.apiErrors.length) console.log(`     API: ${failure.apiErrors.join(' ; ')}`);
        if (failure.consoleErrors.length) console.log(`     Console: ${failure.consoleErrors.join(' ; ')}`);
        if (failure.pageErrors.length) console.log(`     PageError: ${failure.pageErrors.join(' ; ')}`);
      }
    }
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }).catch(() => {});
  }

  await context.close();
  await browser.close();
  console.log(`\n巡检完成：${totalPages} 页，失败 ${failures.length} 项`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`巡检失败：${error.message}`);
  process.exitCode = 1;
});
