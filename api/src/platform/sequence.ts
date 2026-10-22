// 单据号生成：前缀 + 日期段 + 序号（事务内取当日/当月最大号 +1）
import type { PoolConnection } from 'mysql2/promise';
import { txQueryOne } from '../db/pool';

export type DocTable =
  | 'orders'
  | 'waybill'
  | 'bill'
  | 'quote'
  | 'contract'
  | 'price_rule'
  | 'integration_message';

export type DocColumn =
  | 'order_no'
  | 'waybill_no'
  | 'bill_no'
  | 'quote_no'
  | 'contract_no'
  | 'rule_no'
  | 'msg_no';

export interface DocNoOptions {
  table: DocTable;
  column: DocColumn;
  /** 前缀（可含日期段，如 MO20261022） */
  prefix: string;
  /** 序号位宽（订单 4 / 运单账单 3 / 报价与报文 5 / 合同 4 / 价格规则 6） */
  width: number;
}

/** 事务内生成唯一单据号 */
export async function nextDocNo(conn: PoolConnection, options: DocNoOptions): Promise<string> {
  const { table, column, prefix, width } = options;
  const row = await txQueryOne<Record<string, string>>(
    conn,
    `SELECT ${column} AS no FROM ${table} WHERE ${column} LIKE ? ORDER BY ${column} DESC LIMIT 1`,
    [`${prefix}%`],
  );
  const last = row?.no;
  const parsed = last ? Number(last.slice(prefix.length)) : 0;
  const next = Number.isFinite(parsed) && parsed > 0 ? parsed + 1 : 1;
  return `${prefix}${String(next).padStart(width, '0')}`;
}

/** 单号前缀快捷方法（日期段由调用方传入） */
export function dailyPrefix(prefix: string, compact: string): string {
  return `${prefix}${compact}`;
}
