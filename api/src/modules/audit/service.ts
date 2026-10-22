// 审计日志查询
import { queryOne, queryRows } from '../../db/pool';
import type { AuditLogRow } from '../../types';
import { parseJson } from '../../utils/json';
import { optionalString, pageResult, parsePage } from '../shared/pagination';

function auditDto(row: AuditLogRow) {
  return {
    id: Number(row.id),
    userId: row.user_id === null ? null : Number(row.user_id),
    username: row.username,
    role: row.role,
    action: row.action,
    actionLabel: row.action_label,
    module: row.module,
    targetType: row.target_type,
    targetId: row.target_id,
    detail: parseJson<unknown>(row.detail, null),
    ip: row.ip,
    createdAt: row.created_at,
  };
}

/** GET /audit/logs */
export async function listAuditLogs(query: Record<string, unknown>) {
  const pager = parsePage(query, 10, 200);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const module = optionalString(query.module);
  const action = optionalString(query.action);
  const userId = optionalString(query.userId);
  if (module) {
    conditions.push('module = ?');
    params.push(module);
  }
  if (action) {
    conditions.push('action = ?');
    params.push(action);
  }
  if (userId) {
    conditions.push('user_id = ?');
    params.push(Number(userId));
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM audit_log ${where}`, params);
  const rows = await queryRows<AuditLogRow>(
    `SELECT * FROM audit_log ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  return pageResult(rows.map(auditDto), Number(totalRow?.total ?? 0), pager);
}
