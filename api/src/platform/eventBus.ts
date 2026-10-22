// 领域事件总线（简化版 Outbox）：业务事务内写 event_outbox，并同步投递给 Mock 适配器
import type { PoolConnection } from 'mysql2/promise';
import { txExec } from '../db/pool';
import { formatDateTime, nowDate } from '../utils/datetime';
import { publishEvent, type DomainEvent } from './outbox';

export type { DomainEvent } from './outbox';

/**
 * 事务内发出领域事件：
 * 1) 写 event_outbox（PENDING）
 * 2) 同步调用 Mock 适配器生成集成报文/通知
 * 3) 更新为 PUBLISHED；失败仅标记 FAILED，不阻断业务事务
 */
export async function emitEvent(conn: PoolConnection, event: DomainEvent): Promise<void> {
  const at = formatDateTime(nowDate());
  const inserted = await txExec(
    conn,
    `INSERT INTO event_outbox (event_type, aggregate_type, aggregate_id, payload, status, created_at)
     VALUES (?, ?, ?, ?, 'PENDING', ?)`,
    [
      event.eventType,
      event.aggregateType,
      String(event.aggregateId),
      JSON.stringify(event.payload ?? {}),
      at,
    ],
  );
  const outboxId = Number(inserted.insertId);
  try {
    await publishEvent(conn, event);
    await txExec(conn, "UPDATE event_outbox SET status = 'PUBLISHED', published_at = ? WHERE id = ?", [
      at,
      outboxId,
    ]);
  } catch (error) {
    console.error(
      `[event] 事件投递失败 ${event.eventType}#${event.aggregateId}:`,
      (error as Error).message,
    );
    await txExec(
      conn,
      "UPDATE event_outbox SET status = 'FAILED', retry_count = retry_count + 1 WHERE id = ?",
      [outboxId],
    );
  }
}
