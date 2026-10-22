// 站内通知：我的消息 / 标记已读
import { NOTIFICATION_TYPE_LABELS } from '../../config/labels';
import { pool, queryOne, queryRows } from '../../db/pool';
import { ApiError } from '../../errors';
import type { AuthUser, NotificationRow } from '../../types';
import { optionalString } from '../shared/pagination';

function notificationDto(row: NotificationRow) {
  return {
    id: Number(row.id),
    type: row.type,
    typeLabel: NOTIFICATION_TYPE_LABELS[row.type],
    title: row.title,
    content: row.content,
    relatedType: row.related_type,
    relatedId: row.related_id,
    readFlag: Number(row.read_flag) === 1,
    createdAt: row.created_at,
  };
}

function ownershipWhere(user: AuthUser): { where: string; params: unknown[] } {
  return {
    where: '(user_id = ? OR (user_id IS NULL AND role = ?))',
    params: [user.uid, user.role],
  };
}

/** GET /notifications?unread=1 */
export async function listNotifications(user: AuthUser, query: Record<string, unknown>) {
  const unread = optionalString(query.unread);
  const ownership = ownershipWhere(user);
  const conditions = [ownership.where];
  const params = [...ownership.params];
  if (unread === '1' || unread === 'true') {
    conditions.push('read_flag = 0');
  }
  const rows = await queryRows<NotificationRow>(
    `SELECT * FROM notification WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT 100`,
    params,
  );
  return rows.map(notificationDto);
}

/** POST /notifications/:id/read */
export async function markNotificationRead(id: number, user: AuthUser) {
  const row = await queryOne<NotificationRow>('SELECT * FROM notification WHERE id = ?', [id]);
  if (!row) {
    throw new ApiError(40401, '通知不存在');
  }
  const owned = Number(row.user_id) === Number(user.uid) ||
    (row.user_id === null && row.role === user.role);
  if (!owned) {
    throw new ApiError(40301, '无权操作该通知');
  }
  if (Number(row.read_flag) !== 1) {
    await pool.execute('UPDATE notification SET read_flag = 1 WHERE id = ?', [id]);
  }
  return { id: Number(id), readFlag: true };
}
