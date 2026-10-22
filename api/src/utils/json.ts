// JSON 列兼容读取：mysql2 可能返回已解析对象或字符串
export function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (Array.isArray(value)) {
    return value as unknown as T;
  }
  if (typeof value === 'string') {
    if (value.trim() === '') {
      return fallback;
    }
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  if (typeof value === 'object') {
    return value as T;
  }
  return fallback;
}

export function parseStringArray(value: unknown): string[] {
  const parsed = parseJson<unknown>(value, []);
  return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
}

export function parseNumberArray(value: unknown): number[] {
  const parsed = parseJson<unknown>(value, []);
  return Array.isArray(parsed) ? parsed.map((item) => Number(item)) : [];
}

/** 金额四舍五入到分 */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** 百分比保留 1 位 */
export function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

/** 布尔化（DB tinyint / boolean） */
export function toBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}
