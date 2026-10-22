// 存证查询与哈希链校验
import { queryOne, queryRows } from '../../db/pool';
import { ApiError } from '../../errors';
import { notarizeDto, verifyNotarizeTx } from '../../platform/notary';
import type { NotarizeRecordRow } from '../../types';
import { optionalString, pageResult, parsePage } from '../shared/pagination';

/** GET /api/notarize/records?bizType=&bizId=&page= */
export async function listNotarizeRecords(query: Record<string, unknown>) {
  const pager = parsePage(query, 20, 100);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const bizType = optionalString(query.bizType);
  const bizId = optionalString(query.bizId);
  if (bizType) {
    conditions.push('biz_type = ?');
    params.push(bizType);
  }
  if (bizId) {
    conditions.push('biz_id = ?');
    params.push(Number(bizId));
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM notarize_record ${where}`,
    params,
  );
  const rows = await queryRows<NotarizeRecordRow>(
    `SELECT * FROM notarize_record ${where} ORDER BY block_height DESC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  return pageResult(rows.map(notarizeDto), Number(totalRow?.total ?? 0), pager);
}

/** GET /api/notarize/verify/:txId */
export async function verifyByTxId(txId: string) {
  const result = await verifyNotarizeTx(txId);
  if (!result.record) {
    throw new ApiError(40401, '存证记录不存在');
  }
  return result;
}
