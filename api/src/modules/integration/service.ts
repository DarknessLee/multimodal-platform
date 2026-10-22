// 集成中心：系统目录、报文查询、FAILED 重试（Mock 适配器）
import { INTEGRATION_STATUS_LABELS } from '../../config/labels';
import { queryOne, queryRows, txExec, txQueryOne, withTransaction } from '../../db/pool';
import { ApiError } from '../../errors';
import { writeAudit } from '../../middleware/audit';
import type { AuthUser, IntegrationMessageRow, IntegrationStatus } from '../../types';
import { formatDateTime, nowDate } from '../../utils/datetime';
import { parseJson } from '../../utils/json';
import { optionalString, pageResult, parsePage } from '../shared/pagination';

interface SystemCatalogItem {
  systemCode: string;
  systemName: string;
  standard: string;
  direction: 'IN' | 'OUT';
}

const SYSTEM_CATALOG: SystemCatalogItem[] = [
  { systemCode: 'RAIL_95306', systemName: '铁路 95306', standard: 'JT/T 1351-2020', direction: 'OUT' },
  { systemCode: 'PORT_EDI', systemName: '港口 EDI', standard: 'UN/EDIFACT', direction: 'OUT' },
  { systemCode: 'CA', systemName: 'CA 电子认证', standard: 'JSON 签章记录', direction: 'OUT' },
  { systemCode: 'BANK', systemName: '银行支付', standard: 'JSON 回执', direction: 'OUT' },
  { systemCode: 'TAX', systemName: '税务电子发票', standard: '电子发票要素', direction: 'OUT' },
  { systemCode: 'GPS', systemName: '北斗/GPS 定位', standard: 'MQTT/JSON', direction: 'IN' },
];

interface SystemStatRow {
  system_code: string;
  total: number;
  success: number;
  failed: number;
  last_message_at: string | null;
}

function messageDto(row: IntegrationMessageRow, withPayload = true) {
  const payload = parseJson<unknown>(row.payload, null);
  const responsePayload = parseJson<unknown>(row.response_payload, null);
  const payloadText = payload === null ? '' : JSON.stringify(payload);
  return {
    id: Number(row.id),
    msgNo: row.msg_no,
    systemCode: row.system_code,
    systemName: row.system_name,
    direction: row.direction,
    msgType: row.msg_type,
    standard: row.standard,
    relatedType: row.related_type,
    relatedId: row.related_id,
    status: row.status,
    statusLabel: INTEGRATION_STATUS_LABELS[row.status],
    retryCount: Number(row.retry_count),
    errorMessage: row.error_message,
    createdAt: row.created_at,
    processedAt: row.processed_at,
    payloadPreview: payloadText.length > 200 ? `${payloadText.slice(0, 200)}…` : payloadText,
    ...(withPayload ? { payload, responsePayload } : {}),
  };
}

export { messageDto };

/** GET /integration/systems：目录 + 运行状态 */
export async function listSystems() {
  const stats = await queryRows<SystemStatRow>(
    `SELECT system_code,
            COUNT(*) AS total,
            SUM(status = 'SUCCESS') AS success,
            SUM(status = 'FAILED') AS failed,
            MAX(created_at) AS last_message_at
       FROM integration_message
      GROUP BY system_code`,
  );
  const byCode = new Map(stats.map((row) => [row.system_code, row]));
  return SYSTEM_CATALOG.map((system) => {
    const stat = byCode.get(system.systemCode);
    const total = Number(stat?.total ?? 0);
    const success = Number(stat?.success ?? 0);
    const failed = Number(stat?.failed ?? 0);
    const successRate = total > 0 ? Math.round((success / total) * 1000) / 10 : 0;
    const status = total === 0 ? 'UNKNOWN' : failed > total / 2 ? 'DEGRADED' : 'UP';
    return {
      systemCode: system.systemCode,
      systemName: system.systemName,
      standard: system.standard,
      direction: system.direction,
      status,
      statusLabel: status === 'UP' ? '正常' : status === 'DEGRADED' ? '异常' : '未启用',
      total,
      success,
      failed,
      lastMessageAt: stat?.last_message_at ?? null,
      successRate,
    };
  });
}

/** GET /integration/messages：报文分页查询 */
export async function listMessages(query: Record<string, unknown>) {
  const pager = parsePage(query, 10);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const systemCode = optionalString(query.systemCode);
  const status = optionalString(query.status);
  const relatedType = optionalString(query.relatedType);
  const relatedId = optionalString(query.relatedId);
  if (systemCode) {
    conditions.push('system_code = ?');
    params.push(systemCode);
  }
  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (relatedType) {
    conditions.push('related_type = ?');
    params.push(relatedType);
  }
  if (relatedId) {
    conditions.push('related_id = ?');
    params.push(relatedId);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM integration_message ${where}`,
    params,
  );
  const rows = await queryRows<IntegrationMessageRow>(
    `SELECT * FROM integration_message ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  return pageResult(rows.map((row) => messageDto(row)), Number(totalRow?.total ?? 0), pager);
}

/** POST /integration/messages/:id/retry：仅 FAILED 可重试，模拟成功 */
export async function retryMessage(id: number, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const message = await txQueryOne<IntegrationMessageRow>(
      conn,
      'SELECT * FROM integration_message WHERE id = ? FOR UPDATE',
      [id],
    );
    if (!message) {
      throw new ApiError(40401, '集成报文不存在');
    }
    if (message.status !== 'FAILED') {
      throw new ApiError(40902, '仅失败报文可以重试');
    }
    const at = formatDateTime(nowDate());
    const response = {
      retriedAt: at,
      result: 'SUCCESS',
      mock: true,
      systemCode: message.system_code,
      msgType: message.msg_type,
      operator: user.username,
    };
    await txExec(
      conn,
      `UPDATE integration_message
          SET status = 'SUCCESS', retry_count = retry_count + 1, response_payload = ?,
              processed_at = ?, error_message = NULL
        WHERE id = ?`,
      [JSON.stringify(response), at, id],
    );
    await writeAudit(conn, {
      user,
      action: 'INTEGRATION_RETRY',
      actionLabel: '重试报文',
      module: 'integration',
      targetType: 'INTEGRATION_MESSAGE',
      targetId: id,
      detail: { msgNo: message.msg_no, systemCode: message.system_code, retryCount: Number(message.retry_count) + 1 },
      ip,
    });
    const updated = await txQueryOne<IntegrationMessageRow>(conn, 'SELECT * FROM integration_message WHERE id = ?', [
      id,
    ]);
    return messageDto(updated ?? message);
  });
}

/** 供路由使用的角色权限校验数据 */
export const INTEGRATION_SYSTEMS = SYSTEM_CATALOG;
