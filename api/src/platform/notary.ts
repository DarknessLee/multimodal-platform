// 哈希链存证：全局链（block_height 连续），hash = sha256(payloadHash|prevHash|blockHeight)
// 与 api/db/seed/stage2.mjs 的种子规则完全一致，保证种子链可校验、新记录可续链。
import { createHash } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { queryOne, queryRows, txExec, txQueryOne } from '../db/pool';
import type { NotarizeBizType, NotarizeRecordRow } from '../types';
import { formatDateTime, nowDate } from '../utils/datetime';

export const GENESIS_HASH = '0'.repeat(64);

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export interface NotarizeResult {
  txId: string;
  payloadHash: string;
  prevHash: string;
  hash: string;
  blockHeight: number;
}

export interface AppendNotarizeParams {
  bizType: NotarizeBizType;
  bizId: number;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt?: string;
}

/** 计算存证哈希（契约 §4 规则，种子使用 | 分隔） */
export function computeNotarizeHash(payloadHash: string, prevHash: string, blockHeight: number): string {
  return sha256(`${payloadHash}|${prevHash}|${blockHeight}`);
}

/** 事务内追加一条存证记录（全局链） */
export async function appendNotarize(
  conn: PoolConnection,
  params: AppendNotarizeParams,
): Promise<NotarizeResult> {
  const last = await txQueryOne<{ hash: string; block_height: number }>(
    conn,
    'SELECT hash, block_height FROM notarize_record ORDER BY block_height DESC LIMIT 1 FOR UPDATE',
  );
  const prevHash = last?.hash ?? GENESIS_HASH;
  const blockHeight = Number(last?.block_height ?? 0) + 1;
  const payloadHash = sha256(JSON.stringify(params.payload ?? {}));
  const hash = computeNotarizeHash(payloadHash, prevHash, blockHeight);
  const txId = `TX${String(blockHeight).padStart(8, '0')}${sha256(
    `${params.bizType}:${params.bizId}:${params.eventType}`,
  )
    .slice(0, 8)
    .toUpperCase()}`;
  await txExec(
    conn,
    `INSERT INTO notarize_record (biz_type, biz_id, event_type, payload_hash, prev_hash, hash, block_height, tx_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.bizType,
      params.bizId,
      params.eventType,
      payloadHash,
      prevHash,
      hash,
      blockHeight,
      txId,
      params.occurredAt ?? formatDateTime(nowDate()),
    ],
  );
  return { txId, payloadHash, prevHash, hash, blockHeight };
}

export function notarizeDto(row: NotarizeRecordRow) {
  return {
    id: Number(row.id),
    bizType: row.biz_type,
    bizId: Number(row.biz_id),
    eventType: row.event_type,
    payloadHash: row.payload_hash,
    prevHash: row.prev_hash,
    hash: row.hash,
    blockHeight: Number(row.block_height),
    txId: row.tx_id,
    createdAt: row.created_at,
  };
}

interface ChainCheck {
  valid: boolean;
  reason: string;
}

function checkRecord(record: NotarizeRecordRow, prev: NotarizeRecordRow | null, expectedHeight: number): ChainCheck {
  const height = Number(record.block_height);
  if (height !== expectedHeight) {
    return { valid: false, reason: `区块高度不连续：期望 ${expectedHeight}，实际 ${height}` };
  }
  const expectedPrevHash = prev ? prev.hash : GENESIS_HASH;
  if (record.prev_hash !== expectedPrevHash) {
    return { valid: false, reason: `prevHash 不连续（block ${height}）` };
  }
  const recomputed = computeNotarizeHash(record.payload_hash, record.prev_hash, height);
  if (recomputed !== record.hash) {
    return { valid: false, reason: `hash 重算不一致（block ${height}）` };
  }
  return { valid: true, reason: '' };
}

/** 校验全链（创世 prevHash = 64 个 0） */
export async function verifyNotarizeChain(): Promise<{
  valid: boolean;
  chainLength: number;
  message: string;
  lastTxId: string | null;
}> {
  const records = await queryRows<NotarizeRecordRow>(
    'SELECT * FROM notarize_record ORDER BY block_height ASC',
  );
  let prev: NotarizeRecordRow | null = null;
  let expectedHeight = 1;
  for (const record of records) {
    const check = checkRecord(record, prev, expectedHeight);
    if (!check.valid) {
      return { valid: false, chainLength: records.length, message: check.reason, lastTxId: prev?.tx_id ?? null };
    }
    prev = record;
    expectedHeight += 1;
  }
  return {
    valid: true,
    chainLength: records.length,
    message: '哈希链校验通过',
    lastTxId: prev?.tx_id ?? null,
  };
}

export interface VerifyTxResult {
  valid: boolean;
  record: ReturnType<typeof notarizeDto> | null;
  chainLength: number;
  message: string;
}

/** 校验单条存证（校验其自身 hash 与前一区块衔接） */
export async function verifyNotarizeTx(txId: string): Promise<VerifyTxResult> {
  const record = await queryOne<NotarizeRecordRow>(
    'SELECT * FROM notarize_record WHERE tx_id = ?',
    [txId],
  );
  if (!record) {
    return { valid: false, record: null, chainLength: 0, message: '存证记录不存在' };
  }
  const prev = await queryOne<NotarizeRecordRow>(
    'SELECT * FROM notarize_record WHERE block_height = ?',
    [Number(record.block_height) - 1],
  );
  const check = checkRecord(record, prev, Number(record.block_height));
  const chain = await verifyNotarizeChain();
  return {
    valid: check.valid && chain.valid,
    record: notarizeDto(record),
    chainLength: Number(record.block_height),
    message: check.valid && chain.valid ? '哈希链校验通过' : check.valid ? chain.message : check.reason,
  };
}

/** 某业务对象的存证统计与全链校验 */
export async function notarizeSummaryFor(bizType: NotarizeBizType, bizIds: number[]) {
  if (bizIds.length === 0) {
    return { verified: false, recordCount: 0, lastTxId: null as string | null };
  }
  const rows = await queryRows<NotarizeRecordRow>(
    `SELECT * FROM notarize_record WHERE biz_type = ? AND biz_id IN (?) ORDER BY block_height ASC`,
    [bizType, bizIds],
  );
  const chain = await verifyNotarizeChain();
  const latest = rows[rows.length - 1] ?? null;
  return {
    verified: chain.valid && rows.length > 0,
    recordCount: rows.length,
    lastTxId: latest?.tx_id ?? null,
  };
}
