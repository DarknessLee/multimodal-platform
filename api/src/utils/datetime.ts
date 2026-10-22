// 时间工具：统一输出契约要求的 YYYY-MM-DD HH:mm:ss / YYYY-MM-DD（服务器本地时区）

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

export function formatDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function nowDate(): Date {
  return new Date();
}

/** 当天日期 YYYY-MM-DD（用于提货日期校验） */
export function todayDateString(): string {
  return formatDate(new Date());
}

/** 当天 yyyyMMdd（用于单号 MO/WB/BL 的日期段） */
export function todayCompact(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

export function addHours(base: Date, hours: number): string {
  return formatDateTime(new Date(base.getTime() + hours * 3600 * 1000));
}

export function offsetMinutes(base: Date, minutes: number): string {
  return formatDateTime(new Date(base.getTime() + minutes * 60 * 1000));
}
