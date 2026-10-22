// 单号日序号生成：MO + yyyyMMdd + 4 位 / WB、BL + yyyyMMdd + 3 位
import type { PoolConnection } from 'mysql2/promise';
import { txQueryOne } from '../db/pool';

type SequenceTable = 'orders' | 'waybill' | 'bill';

/** 在事务内取当日最大序号 +1（表名/列名来自本文件白名单，不拼接外部输入） */
export async function nextDailyNo(
  conn: PoolConnection,
  table: SequenceTable,
  column: 'order_no' | 'waybill_no' | 'bill_no',
  prefix: string,
  width: number,
): Promise<string> {
  const row = await txQueryOne<Record<string, string>>(
    conn,
    `SELECT ${column} AS no FROM ${table} WHERE ${column} LIKE ? ORDER BY ${column} DESC LIMIT 1`,
    [`${prefix}%`],
  );
  const last = row?.no;
  const next = last ? Number(last.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(next).padStart(width, '0')}`;
}
