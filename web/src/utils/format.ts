/** 金额：数字，两位小数（不加千分位，便于 E2E 断言） */
export function formatAmount(value?: number | null): string {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toFixed(2) : '0.00';
}

/** 金额带人民币符号 */
export function formatMoney(value?: number | null): string {
  return `¥${formatAmount(value)}`;
}

/** 时间：契约返回 YYYY-MM-DD HH:mm:ss，页面统一展示 YYYY-MM-DD HH:mm */
export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const matched = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(value);
  return matched ? `${matched[1]} ${matched[2]}` : value;
}

/** 日期：YYYY-MM-DD */
export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const matched = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return matched ? matched[1] : value;
}

/** 重量：保留两位小数 + 吨 */
export function formatWeight(value?: number | null): string {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? `${num.toFixed(2)} t` : '—';
}

/** 空值占位 */
export function orDash(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

/** 本地日期 YYYY-MM-DD（下单默认提货日等场景） */
export function toDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
