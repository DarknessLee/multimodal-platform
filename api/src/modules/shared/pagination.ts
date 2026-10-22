// 分页参数与统一分页响应
export interface PageQuery {
  page: number;
  pageSize: number;
  offset: number;
}

export function parsePage(raw: Record<string, unknown>, defaultSize = 10, maxSize = 100): PageQuery {
  const pageRaw = Number(raw.page);
  const sizeRaw = Number(raw.pageSize);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const pageSize = Number.isFinite(sizeRaw) && sizeRaw > 0 ? Math.min(Math.floor(sizeRaw), maxSize) : defaultSize;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function pageResult<T>(list: T[], total: number, pager: PageQuery) {
  return { list, total, page: pager.page, pageSize: pager.pageSize };
}

/** 可选字符串筛选（空字符串视为未传） */
export function optionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}
