// 集成中心：系统目录、报文查询、FAILED 重试（Mock 适配器）
import {
  ADAPTER_STATUS_LABELS,
  ADAPTER_SYSTEM_TYPE_LABELS,
  INTEGRATION_STATUS_LABELS,
} from '../../config/labels';
import { queryOne, queryRows, txExec, txQueryOne, withTransaction } from '../../db/pool';
import { ApiError } from '../../errors';
import { writeAudit } from '../../middleware/audit';
import type {
  AdapterStatus,
  AdapterSystemType,
  AuthUser,
  IntegrationAdapterRow,
  IntegrationMessageRow,
  IntegrationStatus,
} from '../../types';
import { formatDate, formatDateTime, nowDate } from '../../utils/datetime';
import { parseJson, round1 } from '../../utils/json';
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
    adapterId: row.adapter_id === null || row.adapter_id === undefined ? null : Number(row.adapter_id),
    systemCode: row.system_code,
    systemName: row.system_name,
    systemType: row.system_code,
    systemTypeLabel: ADAPTER_SYSTEM_TYPE_LABELS[row.system_code as AdapterSystemType] ?? row.system_name,
    direction: row.direction,
    msgType: row.msg_type,
    standard: row.standard,
    relatedType: row.related_type,
    relatedId: row.related_id,
    status: row.status,
    statusLabel: INTEGRATION_STATUS_LABELS[row.status],
    retryCount: Number(row.retry_count),
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    processedAt: row.processed_at,
    nextRetryAt: row.next_retry_at ?? null,
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

// ── Stage 5：集成中心 v2（适配器健康/测试、报文详情、批量重试、统计）───────────

function adapterDto(row: IntegrationAdapterRow) {
  const systemType = row.system_type as AdapterSystemType;
  const status = row.status as AdapterStatus;
  return {
    id: Number(row.id),
    adapterCode: row.adapter_code,
    name: row.name,
    systemType,
    systemTypeLabel: ADAPTER_SYSTEM_TYPE_LABELS[systemType] ?? systemType,
    protocol: row.protocol,
    endpoint: row.endpoint,
    status,
    statusLabel: ADAPTER_STATUS_LABELS[status] ?? status,
    successRate: Number(row.success_rate),
    totalMessages: Number(row.total_messages),
    failedMessages: Number(row.failed_messages),
    lastSyncAt: row.last_sync_at,
    retryPolicy: row.retry_policy,
  };
}

async function loadAdapter(id: number): Promise<IntegrationAdapterRow> {
  const row = await queryOne<IntegrationAdapterRow>('SELECT * FROM integration_adapter WHERE id = ?', [id]);
  if (!row) {
    throw new ApiError(40401, '集成适配器不存在');
  }
  return row;
}

/** GET /integration/adapters */
export async function listAdapters() {
  const rows = await queryRows<IntegrationAdapterRow>('SELECT * FROM integration_adapter ORDER BY id ASC');
  return rows.map(adapterDto);
}

/** 确定性健康检查项（Mock） */
function adapterChecks(adapter: IntegrationAdapterRow) {
  const status = adapter.status as AdapterStatus;
  const online = status !== 'OFFLINE';
  const degraded = status === 'DEGRADED';
  const baseLatency = 40 + Number(adapter.id) * 17;
  const rate = Number(adapter.success_rate);
  return [
    {
      name: '连通性',
      status: online ? (degraded ? 'WARN' : 'PASS') : 'FAIL',
      detail: online ? `HTTP 200，${adapter.endpoint}` : '连接超时（Mock）',
      latencyMs: baseLatency,
    },
    {
      name: '协议握手',
      status: online ? 'PASS' : 'FAIL',
      detail: `${adapter.protocol} 握手完成`,
      latencyMs: Math.max(1, Math.round(baseLatency * 0.6)),
    },
    {
      name: '成功率',
      status: rate >= 95 ? 'PASS' : rate >= 80 ? 'WARN' : 'FAIL',
      detail: `${rate}%（${adapter.failed_messages}/${adapter.total_messages} 失败）`,
      latencyMs: 0,
    },
    {
      name: '重试策略',
      status: adapter.retry_policy ? 'PASS' : 'WARN',
      detail: adapter.retry_policy ?? '未配置重试策略',
      latencyMs: 0,
    },
  ];
}

/** GET /integration/adapters/:id/health */
export async function getAdapterHealth(id: number) {
  const adapter = await loadAdapter(id);
  const checks = adapterChecks(adapter);
  const hasFail = checks.some((check) => check.status === 'FAIL');
  const hasWarn = checks.some((check) => check.status === 'WARN');
  const status: AdapterStatus = hasFail ? 'OFFLINE' : hasWarn ? 'DEGRADED' : 'ONLINE';
  return {
    adapter: adapterDto(adapter),
    status,
    statusLabel: ADAPTER_STATUS_LABELS[status],
    checks,
    checkedAt: formatDateTime(nowDate()),
  };
}

/** POST /integration/adapters/:id/test：Mock 连通性测试 + 审计 */
export async function testAdapter(id: number, user: AuthUser, ip: string | null) {
  const adapter = await loadAdapter(id);
  const status = adapter.status as AdapterStatus;
  const success = status !== 'OFFLINE';
  const latencyMs = 30 + Number(adapter.id) * 7;
  const testedAt = formatDateTime(nowDate());
  const message = success ? 'Mock 连通性测试通过' : '适配器离线，连通性测试失败';
  await withTransaction(async (conn) => {
    await writeAudit(conn, {
      user,
      action: 'INTEGRATION_ADAPTER_TEST',
      actionLabel: '适配器连通性测试',
      module: 'integration',
      targetType: 'INTEGRATION_ADAPTER',
      targetId: id,
      detail: { adapterCode: adapter.adapter_code, success, latencyMs, message },
      ip,
    });
  });
  return { adapterId: id, adapterCode: adapter.adapter_code, success, latencyMs, message, testedAt };
}

/** GET /integration/messages/:id：报文详情（请求/响应/重试） */
export async function getMessageDetail(id: number) {
  const row = await queryOne<IntegrationMessageRow & { adapter_name: string | null }>(
    `SELECT m.*, a.name AS adapter_name FROM integration_message m
       LEFT JOIN integration_adapter a ON a.id = m.adapter_id
      WHERE m.id = ?`,
    [id],
  );
  if (!row) {
    throw new ApiError(40401, '集成报文不存在');
  }
  const systemType = row.system_code as AdapterSystemType;
  const directionLabel = row.direction === 'IN' ? '接收' : '发送';
  return {
    id: Number(row.id),
    msgNo: row.msg_no,
    systemCode: row.system_code,
    systemName: row.system_name,
    systemType,
    systemTypeLabel: ADAPTER_SYSTEM_TYPE_LABELS[systemType] ?? row.system_name,
    adapterId: row.adapter_id === null ? null : Number(row.adapter_id),
    adapterName: row.adapter_name,
    msgType: row.msg_type,
    direction: row.direction,
    directionLabel,
    standard: row.standard,
    relatedType: row.related_type,
    relatedId: row.related_id,
    status: row.status,
    statusLabel: INTEGRATION_STATUS_LABELS[row.status as IntegrationStatus],
    retryCount: Number(row.retry_count),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    requestBody: parseJson<unknown>(row.payload, null),
    responseBody: parseJson<unknown>(row.response_payload, null),
    payload: parseJson<unknown>(row.payload, null),
    responsePayload: parseJson<unknown>(row.response_payload, null),
    sentAt: row.processed_at ?? row.created_at,
    lastRetryAt: Number(row.retry_count) > 0 ? row.processed_at : null,
    nextRetryAt: row.next_retry_at,
    createdAt: row.created_at,
  };
}

export interface RetryBatchResultItem {
  id: number;
  msgNo: string | null;
  status: string;
  errorMessage: string | null;
}

/** POST /integration/messages/retry-batch：批量重试（≤20 条） */
export async function retryMessagesBatch(ids: number[], user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const results: RetryBatchResultItem[] = [];
    let success = 0;
    let failed = 0;
    for (const id of ids) {
      const message = await txQueryOne<IntegrationMessageRow>(
        conn,
        'SELECT * FROM integration_message WHERE id = ? FOR UPDATE',
        [id],
      );
      if (!message) {
        failed += 1;
        results.push({ id, msgNo: null, status: 'FAILED', errorMessage: '集成报文不存在' });
        continue;
      }
      if (message.status !== 'FAILED') {
        failed += 1;
        results.push({
          id,
          msgNo: message.msg_no,
          status: message.status,
          errorMessage: '仅失败报文可以重试',
        });
        continue;
      }
      const at = formatDateTime(nowDate());
      const response = {
        retriedAt: at,
        result: 'SUCCESS',
        mock: true,
        batch: true,
        systemCode: message.system_code,
        msgType: message.msg_type,
        operator: user.username,
      };
      await txExec(
        conn,
        `UPDATE integration_message
            SET status = 'SUCCESS', retry_count = retry_count + 1, response_payload = ?,
                processed_at = ?, error_message = NULL, next_retry_at = NULL
          WHERE id = ?`,
        [JSON.stringify(response), at, id],
      );
      success += 1;
      results.push({ id, msgNo: message.msg_no, status: 'SUCCESS', errorMessage: null });
    }
    await writeAudit(conn, {
      user,
      action: 'INTEGRATION_RETRY_BATCH',
      actionLabel: '批量重试报文',
      module: 'integration',
      targetType: 'INTEGRATION_MESSAGE',
      targetId: ids[0] ?? 0,
      detail: { requested: ids.length, success, failed, ids },
      ip,
    });
    return { retried: ids.length, success, failed, results };
  });
}

/** GET /integration/stats?days=7：集成统计 */
export async function getIntegrationStats(daysRaw: unknown) {
  const daysValue = Number(daysRaw);
  const days = Number.isFinite(daysValue) && daysValue > 0 ? Math.min(Math.floor(daysValue), 90) : 7;
  const totals = await queryOne<{ total: number; success: number; failed: number }>(
    `SELECT COUNT(*) AS total, COALESCE(SUM(status = 'SUCCESS'), 0) AS success,
            COALESCE(SUM(status = 'FAILED'), 0) AS failed
       FROM integration_message`,
  );
  const total = Number(totals?.total ?? 0);
  const success = Number(totals?.success ?? 0);
  const failed = Number(totals?.failed ?? 0);
  const bySystemRows = await queryRows<{ system_code: string; count: number; failed: number }>(
    `SELECT system_code, COUNT(*) AS count, COALESCE(SUM(status = 'FAILED'), 0) AS failed
       FROM integration_message GROUP BY system_code ORDER BY count DESC`,
  );
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  const startDate = formatDate(start);
  const trendRows = await queryRows<{ d: string; count: number; failed: number }>(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d, COUNT(*) AS count,
            COALESCE(SUM(status = 'FAILED'), 0) AS failed
       FROM integration_message WHERE DATE(created_at) >= ? GROUP BY d`,
    [startDate],
  );
  const trendMap = new Map(trendRows.map((row) => [row.d, row]));
  const trend: Array<{ date: string; count: number; failed: number }> = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(start.getTime() + i * 86400000);
    const key = formatDate(date);
    const row = trendMap.get(key);
    trend.push({ date: key, count: Number(row?.count ?? 0), failed: Number(row?.failed ?? 0) });
  }
  const failureRows = await queryRows<IntegrationMessageRow>(
    `SELECT * FROM integration_message WHERE status = 'FAILED' ORDER BY created_at DESC, id DESC LIMIT 5`,
  );
  return {
    total,
    success,
    failed,
    successRate: total > 0 ? round1((success / total) * 100) : 0,
    bySystem: bySystemRows.map((row) => ({
      systemType: row.system_code,
      systemTypeLabel: ADAPTER_SYSTEM_TYPE_LABELS[row.system_code as AdapterSystemType] ?? row.system_code,
      count: Number(row.count),
      failed: Number(row.failed),
      successRate:
        Number(row.count) > 0
          ? round1(((Number(row.count) - Number(row.failed)) / Number(row.count)) * 100)
          : 0,
    })),
    trend,
    recentFailures: failureRows.map((row) => ({
      id: Number(row.id),
      msgNo: row.msg_no,
      msgType: row.msg_type,
      systemType: row.system_code,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    })),
  };
}
