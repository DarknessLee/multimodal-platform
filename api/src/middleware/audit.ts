// 审计：写操作统一落 audit_log（显式调用，事务内可与业务同提交）
import type { Pool, PoolConnection } from 'mysql2/promise';
import type { Request } from 'express';
import { pool } from '../db/pool';
import { formatDateTime, nowDate } from '../utils/datetime';

export interface AuditActor {
  uid: number;
  username: string;
  role: string;
}

export interface AuditEntry {
  user: AuditActor | null;
  action: string;
  actionLabel: string;
  module: string;
  targetType?: string | null;
  targetId?: string | number | null;
  detail?: unknown;
  ip?: string | null;
}

type SqlRunner = { execute: (sql: string, params?: unknown[]) => Promise<unknown> };

/** 写一条审计日志；conn 为空时使用连接池（事务外场景） */
export async function writeAudit(
  conn: PoolConnection | Pool | null,
  entry: AuditEntry,
): Promise<void> {
  const runner = (conn ?? pool) as unknown as SqlRunner;
  await runner.execute(
    `INSERT INTO audit_log (user_id, username, role, action, action_label, module,
       target_type, target_id, detail, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.user?.uid ?? null,
      entry.user?.username ?? null,
      entry.user?.role ?? null,
      entry.action,
      entry.actionLabel,
      entry.module,
      entry.targetType ?? null,
      entry.targetId === null || entry.targetId === undefined ? null : String(entry.targetId),
      entry.detail === null || entry.detail === undefined ? null : JSON.stringify(entry.detail),
      entry.ip ?? null,
      formatDateTime(nowDate()),
    ],
  );
}

/** 由请求构造审计实体（路由层使用） */
export function auditEntity(req: Request): Pick<AuditEntry, 'user' | 'ip'> {
  return { user: req.user ?? null, ip: req.ip ?? null };
}
