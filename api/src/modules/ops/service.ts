// 运营后台：系统配置/数据字典/定时任务/健康巡检 + 五阶段全链路检查
import {
  JOB_STATUS_LABELS,
  OPS_DICT_STATUS_LABELS,
} from '../../config/labels';
import { queryOne, queryRows, txExec, txQueryOne, withTransaction } from '../../db/pool';
import { ApiError } from '../../errors';
import { writeAudit } from '../../middleware/audit';
import { verifyNotarizeChain } from '../../platform/notary';
import type { AuthUser, JobLogRow, JobStatus, OpsConfigRow, OpsDictRow, OpsDictStatus } from '../../types';
import { formatDateTime, nowDate } from '../../utils/datetime';
import { round1 } from '../../utils/json';
import { optionalString } from '../shared/pagination';

// ── 系统配置 ────────────────────────────────────────────────────────────────

function configDto(row: OpsConfigRow) {
  return {
    id: Number(row.id),
    configKey: row.config_key,
    configValue: row.config_value,
    category: row.category,
    description: row.description,
    editable: Number(row.editable) === 1,
    updatedBy: row.updated_by === null ? null : Number(row.updated_by),
    updatedAt: row.updated_at,
  };
}

/** GET /api/ops/configs */
export async function listConfigs(query: Record<string, unknown>) {
  const category = optionalString(query.category);
  if (category) {
    const rows = await queryRows<OpsConfigRow>(
      'SELECT * FROM ops_config WHERE category = ? ORDER BY id ASC',
      [category],
    );
    return rows.map(configDto);
  }
  const rows = await queryRows<OpsConfigRow>('SELECT * FROM ops_config ORDER BY category ASC, id ASC');
  return rows.map(configDto);
}

/** PUT /api/ops/configs/:key */
export async function updateConfig(key: string, value: string, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const config = await txQueryOne<OpsConfigRow>(conn, 'SELECT * FROM ops_config WHERE config_key = ? FOR UPDATE', [
      key,
    ]);
    if (!config) {
      throw new ApiError(40401, '系统配置项不存在');
    }
    if (Number(config.editable) !== 1) {
      throw new ApiError(42201, '该系统配置项不可编辑');
    }
    const at = formatDateTime(nowDate());
    await txExec(conn, 'UPDATE ops_config SET config_value = ?, updated_by = ?, updated_at = ? WHERE id = ?', [
      value,
      user.uid,
      at,
      config.id,
    ]);
    await writeAudit(conn, {
      user,
      action: 'OPS_CONFIG_UPDATE',
      actionLabel: '更新系统配置',
      module: 'ops',
      targetType: 'OPS_CONFIG',
      targetId: Number(config.id),
      detail: { configKey: key, oldValue: config.config_value, newValue: value },
      ip,
    });
    const updated = await txQueryOne<OpsConfigRow>(conn, 'SELECT * FROM ops_config WHERE id = ?', [config.id]);
    return configDto(updated ?? config);
  });
}

// ── 数据字典 ────────────────────────────────────────────────────────────────

function dictDto(row: OpsDictRow) {
  return {
    id: Number(row.id),
    dictType: row.dict_type,
    dictKey: row.dict_key,
    dictValue: row.dict_value,
    sort: Number(row.sort),
    status: row.status,
    statusLabel: OPS_DICT_STATUS_LABELS[row.status as OpsDictStatus],
    remark: row.remark,
    createdAt: row.created_at,
  };
}

/** GET /api/ops/dicts */
export async function listDicts(query: Record<string, unknown>) {
  const dictType = optionalString(query.dictType);
  if (dictType) {
    const rows = await queryRows<OpsDictRow>(
      'SELECT * FROM ops_dict WHERE dict_type = ? ORDER BY sort ASC, id ASC',
      [dictType],
    );
    return rows.map(dictDto);
  }
  const rows = await queryRows<OpsDictRow>('SELECT * FROM ops_dict ORDER BY dict_type ASC, sort ASC, id ASC');
  return rows.map(dictDto);
}

export interface CreateDictInput {
  dictType: string;
  dictKey: string;
  dictValue: string;
  sort?: number;
  status?: OpsDictStatus;
  remark?: string;
}

/** POST /api/ops/dicts */
export async function createDict(input: CreateDictInput, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const existing = await txQueryOne<OpsDictRow>(
      conn,
      'SELECT * FROM ops_dict WHERE dict_type = ? AND dict_key = ?',
      [input.dictType, input.dictKey],
    );
    if (existing) {
      throw new ApiError(40902, '字典项已存在（类型+键唯一）');
    }
    const at = formatDateTime(nowDate());
    const inserted = await txExec(
      conn,
      `INSERT INTO ops_dict (dict_type, dict_key, dict_value, sort, status, remark, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [input.dictType, input.dictKey, input.dictValue, input.sort ?? 0, input.status ?? 'ACTIVE', input.remark ?? null, at],
    );
    const id = Number(inserted.insertId);
    await writeAudit(conn, {
      user,
      action: 'OPS_DICT_CREATE',
      actionLabel: '新增数据字典',
      module: 'ops',
      targetType: 'OPS_DICT',
      targetId: id,
      detail: { dictType: input.dictType, dictKey: input.dictKey, dictValue: input.dictValue },
      ip,
    });
    const row = await txQueryOne<OpsDictRow>(conn, 'SELECT * FROM ops_dict WHERE id = ?', [id]);
    if (!row) {
      throw new ApiError(50000, '字典创建后读取失败');
    }
    return dictDto(row);
  });
}

export interface UpdateDictInput {
  dictKey?: string;
  dictValue?: string;
  sort?: number;
  status?: OpsDictStatus;
  remark?: string;
}

/** PUT /api/ops/dicts/:id */
export async function updateDict(id: number, input: UpdateDictInput, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const row = await txQueryOne<OpsDictRow>(conn, 'SELECT * FROM ops_dict WHERE id = ? FOR UPDATE', [id]);
    if (!row) {
      throw new ApiError(40401, '字典项不存在');
    }
    const dictKey = input.dictKey ?? row.dict_key;
    if (input.dictKey && input.dictKey !== row.dict_key) {
      const conflict = await txQueryOne<OpsDictRow>(
        conn,
        'SELECT * FROM ops_dict WHERE dict_type = ? AND dict_key = ? AND id <> ?',
        [row.dict_type, dictKey, id],
      );
      if (conflict) {
        throw new ApiError(40902, '字典项已存在（类型+键唯一）');
      }
    }
    await txExec(conn, 'UPDATE ops_dict SET dict_key = ?, dict_value = ?, sort = ?, status = ?, remark = ? WHERE id = ?', [
      dictKey,
      input.dictValue ?? row.dict_value,
      input.sort ?? Number(row.sort),
      input.status ?? row.status,
      input.remark === undefined ? row.remark : input.remark,
      id,
    ]);
    await writeAudit(conn, {
      user,
      action: 'OPS_DICT_UPDATE',
      actionLabel: '修改数据字典',
      module: 'ops',
      targetType: 'OPS_DICT',
      targetId: id,
      detail: { dictType: row.dict_type, dictKey, changes: input },
      ip,
    });
    const updated = await txQueryOne<OpsDictRow>(conn, 'SELECT * FROM ops_dict WHERE id = ?', [id]);
    if (!updated) {
      throw new ApiError(50000, '字典读取失败');
    }
    return dictDto(updated);
  });
}

// ── 定时任务 ────────────────────────────────────────────────────────────────

/** GET /api/ops/jobs：按 job_code 取最近一次执行 */
export async function listJobs() {
  const rows = await queryRows<JobLogRow>(
    'SELECT * FROM job_log ORDER BY started_at DESC, id DESC',
  );
  const latest = new Map<string, JobLogRow>();
  for (const row of rows) {
    if (!latest.has(row.job_code)) latest.set(row.job_code, row);
  }
  return [...latest.values()].map((row) => ({
    jobCode: row.job_code,
    jobName: row.job_name,
    cron: row.cron,
    status: row.status,
    statusLabel: JOB_STATUS_LABELS[row.status as JobStatus],
    lastRunAt: row.started_at,
    lastResult: row.result,
    lastDurationMs: Number(row.duration_ms),
  }));
}

/** POST /api/ops/jobs/:code/run：Mock 执行任务并写 job_log */
export async function runJob(code: string, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const latest = await txQueryOne<JobLogRow>(
      conn,
      'SELECT * FROM job_log WHERE job_code = ? ORDER BY started_at DESC, id DESC LIMIT 1',
      [code],
    );
    if (!latest) {
      throw new ApiError(40401, '定时任务不存在');
    }
    const at = formatDateTime(nowDate());
    const durationMs = 60 + code.length * 9;
    const result = `Mock 执行完成：${latest.job_name}（${at}）`;
    const inserted = await txExec(
      conn,
      `INSERT INTO job_log (job_code, job_name, cron, status, started_at, finished_at, duration_ms, result, created_at)
       VALUES (?, ?, ?, 'SUCCESS', ?, ?, ?, ?, ?)`,
      [code, latest.job_name, latest.cron, at, at, durationMs, result, at],
    );
    const id = Number(inserted.insertId);
    await writeAudit(conn, {
      user,
      action: 'OPS_JOB_RUN',
      actionLabel: '执行定时任务',
      module: 'ops',
      targetType: 'JOB_LOG',
      targetId: id,
      detail: { jobCode: code, jobName: latest.job_name, durationMs, status: 'SUCCESS' },
      ip,
    });
    return {
      id,
      jobCode: code,
      jobName: latest.job_name,
      cron: latest.cron,
      status: 'SUCCESS',
      statusLabel: JOB_STATUS_LABELS.SUCCESS,
      startedAt: at,
      finishedAt: at,
      durationMs,
      result,
    };
  });
}

// ── 健康巡检 / 看板 ─────────────────────────────────────────────────────────

async function dataCounts() {
  const tableRow = await queryOne<{ total: number }>(
    'SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE()',
  );
  const orderRow = await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM orders');
  const waybillRow = await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM waybill');
  const documentRow = await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM document');
  const billRow = await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM bill');
  const invoiceRow = await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM invoice');
  const alertRow = await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM alert');
  return {
    tables: Number(tableRow?.total ?? 0),
    orders: Number(orderRow?.total ?? 0),
    waybills: Number(waybillRow?.total ?? 0),
    documents: Number(documentRow?.total ?? 0),
    bills: Number(billRow?.total ?? 0),
    invoices: Number(invoiceRow?.total ?? 0),
    alerts: Number(alertRow?.total ?? 0),
  };
}

/** GET /api/ops/health */
export async function getOpsHealth() {
  const startedAt = Date.now();
  let dbStatus = 'UP';
  try {
    await queryOne<{ ok: number }>('SELECT 1 AS ok');
  } catch {
    dbStatus = 'DOWN';
  }
  const latencyMs = Date.now() - startedAt;
  const adapterRow = await queryOne<{ total: number; online: number }>(
    "SELECT COUNT(*) AS total, COALESCE(SUM(status <> 'OFFLINE'), 0) AS online FROM integration_adapter",
  );
  const jobRow = await queryOne<{ success: number; failed: number }>(
    "SELECT COALESCE(SUM(status = 'SUCCESS'), 0) AS success, COALESCE(SUM(status = 'FAILED'), 0) AS failed FROM job_log",
  );
  return {
    status: dbStatus === 'UP' ? 'UP' : 'DOWN',
    db: { status: dbStatus, latencyMs },
    adapters: { online: Number(adapterRow?.online ?? 0), total: Number(adapterRow?.total ?? 0) },
    jobs: { success: Number(jobRow?.success ?? 0), failed: Number(jobRow?.failed ?? 0) },
    data: await dataCounts(),
    checkedAt: formatDateTime(nowDate()),
  };
}

/** GET /api/ops/dashboard */
export async function getOpsDashboard() {
  const health = await getOpsHealth();
  const jobs = await listJobs();
  const failedMessages = await queryOne<{ total: number }>(
    "SELECT COUNT(*) AS total FROM integration_message WHERE status = 'FAILED'",
  );
  const failedList = await queryRows<{
    id: number; msgNo: string; msgType: string; errorCode: string | null; errorMessage: string | null;
  }>(
    `SELECT id, msg_no AS msgNo, msg_type AS msgType, error_code AS errorCode, error_message AS errorMessage
     FROM integration_message WHERE status = 'FAILED' ORDER BY id DESC LIMIT 5`,
  );
  const pendingReports = await queryOne<{ total: number }>(
    "SELECT COUNT(*) AS total FROM regulator_report WHERE status = 'SUBMITTED'",
  );
  const data = await dataCounts();
  return {
    health,
    recentJobs: jobs.slice(0, 5),
    failedMessages: failedList,
    failedMessageCount: Number(failedMessages?.total ?? 0),
    pendingReports: Number(pendingReports?.total ?? 0),
    dataCounts: data,
    uptimeHours: round1(process.uptime() / 3600),
  };
}

// ── 五阶段全链路检查 ────────────────────────────────────────────────────────

interface ChainCheck {
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  detail: string;
}

interface ChainStage {
  stage: number;
  name: string;
  checks: ChainCheck[];
}

async function countTable(table: string): Promise<number> {
  const row = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table}`);
  return Number(row?.total ?? 0);
}

/** GET /api/ops/full-chain-check：五阶段验收 */
export async function fullChainCheck() {
  const stages: ChainStage[] = [];

  // Stage 1 受理闭环
  const userTotal = await countTable('user');
  const roleTotal = await countTable('role');
  const orderTotal = await countTable('orders');
  const auditTotal = await countTable('audit_log');
  const quoteTotal = await countTable('quote');
  stages.push({
    stage: 1,
    name: '受理闭环',
    checks: [
      {
        name: '用户/角色',
        status: userTotal >= 12 && roleTotal >= 12 ? 'PASS' : 'WARN',
        detail: `${userTotal} 个用户 / ${roleTotal} 个角色`,
      },
      {
        name: '订单数据',
        status: orderTotal >= 20 ? 'PASS' : 'WARN',
        detail: `${orderTotal} 张订单`,
      },
      {
        name: '报价/合同链路',
        status: quoteTotal > 0 ? 'PASS' : 'WARN',
        detail: `${quoteTotal} 张询价`,
      },
      {
        name: '审计日志',
        status: auditTotal >= 10 ? 'PASS' : 'WARN',
        detail: `${auditTotal} 条审计`,
      },
    ],
  });

  // Stage 2 一单制/箱管/存证
  const waybillTotal = await countTable('waybill');
  const segmentTotal = await countTable('waybill_segment');
  const containerTotal = await countTable('container');
  const waybillContainerTotal = await countTable('waybill_container');
  const documentTotal = await countTable('document');
  const notary = await verifyNotarizeChain();
  const notaryTotal = await countTable('notarize_record');
  stages.push({
    stage: 2,
    name: '一单制/箱管/存证',
    checks: [
      {
        name: '哈希链',
        status: notary.valid ? 'PASS' : 'FAIL',
        detail: `${notary.chainLength} 条 ${notary.valid ? '0 异常' : notary.message}`,
      },
      {
        name: '主运单/分段',
        status: waybillTotal >= 60 && segmentTotal > 0 ? 'PASS' : 'WARN',
        detail: `${waybillTotal} 张运单 / ${segmentTotal} 个分段`,
      },
      {
        name: '一单制箱管',
        status: containerTotal > 0 && waybillContainerTotal > 0 ? 'PASS' : 'WARN',
        detail: `${containerTotal} 个箱 / ${waybillContainerTotal} 条箱单关联`,
      },
      {
        name: '单证归档',
        status: documentTotal >= 80 ? 'PASS' : 'WARN',
        detail: `${documentTotal} 份单证`,
      },
    ],
  });

  // Stage 3 调度/预警/IoT
  const planTotal = await countTable('dispatch_plan');
  const alertTotal = await countTable('alert');
  const alertHandled = await queryOne<{ total: number }>(
    "SELECT COUNT(*) AS total FROM alert WHERE status <> 'OPEN'",
  );
  const deviceTotal = await countTable('iot_device');
  const fenceTotal = await countTable('geo_fence');
  const ticketTotal = await countTable('exception_ticket');
  stages.push({
    stage: 3,
    name: '调度/预警/IoT',
    checks: [
      {
        name: '智能调度方案',
        status: planTotal >= 5 ? 'PASS' : 'WARN',
        detail: `${planTotal} 套方案`,
      },
      {
        name: '预警闭环',
        status: alertTotal > 0 && Number(alertHandled?.total ?? 0) > 0 ? 'PASS' : 'WARN',
        detail: `${alertTotal} 条预警 / ${Number(alertHandled?.total ?? 0)} 条已处理`,
      },
      {
        name: 'IoT 设备',
        status: deviceTotal >= 20 ? 'PASS' : 'WARN',
        detail: `${deviceTotal} 台设备`,
      },
      {
        name: '电子围栏/异常工单',
        status: fenceTotal > 0 && ticketTotal > 0 ? 'PASS' : 'WARN',
        detail: `${fenceTotal} 个围栏 / ${ticketTotal} 张工单`,
      },
    ],
  });

  // Stage 4 结算/财务
  const billTotal = await countTable('bill');
  const billsWithItems = await queryRows<{ id: number; total_amount: number; item_sum: number | null }>(
    `SELECT b.id, b.total_amount, COALESCE(SUM(i.amount), 0) AS item_sum
       FROM bill b JOIN bill_item i ON i.bill_id = b.id
      GROUP BY b.id, b.total_amount`,
  );
  let amountMismatch = 0;
  for (const row of billsWithItems) {
    if (Math.abs(Number(row.item_sum ?? 0) - Number(row.total_amount)) >= 0.02) amountMismatch += 1;
  }
  const profitRow = await queryOne<{ mismatch: number }>(
    `SELECT COUNT(*) AS mismatch FROM (
       SELECT b.order_id
         FROM bill b
        WHERE b.bill_type = 'RECEIVABLE'
        GROUP BY b.order_id, b.total_amount, b.profit_amount
       HAVING ABS(b.total_amount - b.profit_amount -
              COALESCE((SELECT SUM(p.total_amount) FROM bill p WHERE p.order_id = b.order_id AND p.bill_type = 'PAYABLE'), 0)) >= 0.02
     ) t`,
  );
  const invoiceMismatch = await queryOne<{ mismatch: number }>(
    `SELECT COUNT(*) AS mismatch FROM invoice i JOIN bill b ON b.id = i.bill_id
      WHERE ABS(i.amount - b.total_amount) >= 0.02
         OR ABS(i.tax_amount - ROUND(i.amount * 9 / 109, 2)) >= 0.02`,
  );
  const allocationOverflow = await queryOne<{ mismatch: number }>(
    `SELECT COUNT(*) AS mismatch FROM (
       SELECT pa.bill_id FROM payment_allocation pa
        GROUP BY pa.bill_id
       HAVING SUM(pa.amount) > (SELECT total_amount FROM bill WHERE id = pa.bill_id) + 0.02
     ) t`,
  );
  stages.push({
    stage: 4,
    name: '结算/财务',
    checks: [
      {
        name: '账单规模',
        status: billTotal >= 40 ? 'PASS' : 'WARN',
        detail: `${billTotal} 张账单`,
      },
      {
        name: '明细金额一致性',
        status: amountMismatch === 0 ? 'PASS' : 'FAIL',
        detail: `${billsWithItems.length} 张含明细账单，${amountMismatch} 张差异`,
      },
      {
        name: '应收-应付=毛利',
        status: Number(profitRow?.mismatch ?? 0) === 0 ? 'PASS' : 'WARN',
        detail: `${Number(profitRow?.mismatch ?? 0)} 张毛利不一致`,
      },
      {
        name: '发票一致性',
        status: Number(invoiceMismatch?.mismatch ?? 0) === 0 ? 'PASS' : 'WARN',
        detail: `${Number(invoiceMismatch?.mismatch ?? 0)} 张发票与账单/税额不一致`,
      },
      {
        name: '支付核销',
        status: Number(allocationOverflow?.mismatch ?? 0) === 0 ? 'PASS' : 'WARN',
        detail: `${Number(allocationOverflow?.mismatch ?? 0)} 张账单超额核销`,
      },
    ],
  });

  // Stage 5 集成/监管/运营
  const adapterTotal = await countTable('integration_adapter');
  const messageTotal = await countTable('integration_message');
  const failedMessages = await queryOne<{ total: number }>(
    "SELECT COUNT(*) AS total FROM integration_message WHERE status = 'FAILED'",
  );
  const reportTotal = await countTable('regulator_report');
  const reportSubmitted = await queryOne<{ total: number }>(
    "SELECT COUNT(*) AS total FROM regulator_report WHERE status IN ('SUBMITTED','ACCEPTED','RETURNED')",
  );
  const complianceTotal = await countTable('compliance_check');
  const configTotal = await countTable('ops_config');
  const dictTotal = await countTable('ops_dict');
  const jobTotal = await countTable('job_log');
  stages.push({
    stage: 5,
    name: '集成/监管/运营',
    checks: [
      {
        name: '集成适配器',
        status: adapterTotal >= 6 ? 'PASS' : 'WARN',
        detail: `${adapterTotal} 个适配器`,
      },
      {
        name: '报文可观测',
        status: messageTotal >= 60 ? 'PASS' : 'WARN',
        detail: `${messageTotal} 条报文 / ${Number(failedMessages?.total ?? 0)} 条失败可重试`,
      },
      {
        name: '监管报送',
        status: reportTotal >= 5 && Number(reportSubmitted?.total ?? 0) > 0 ? 'PASS' : 'WARN',
        detail: `${reportTotal} 份报送 / ${Number(reportSubmitted?.total ?? 0)} 份已提交`,
      },
      {
        name: '合规检查',
        status: complianceTotal >= 10 ? 'PASS' : 'WARN',
        detail: `${complianceTotal} 条检查记录`,
      },
      {
        name: '运营配置/字典/任务',
        status: configTotal >= 10 && dictTotal >= 20 && jobTotal >= 10 ? 'PASS' : 'WARN',
        detail: `${configTotal} 项配置 / ${dictTotal} 项字典 / ${jobTotal} 条任务日志`,
      },
    ],
  });

  const allChecks = stages.flatMap((stage) => stage.checks);
  const summary = {
    total: allChecks.length,
    pass: allChecks.filter((check) => check.status === 'PASS').length,
    warn: allChecks.filter((check) => check.status === 'WARN').length,
    fail: allChecks.filter((check) => check.status === 'FAIL').length,
  };
  return {
    checkedAt: formatDateTime(nowDate()),
    passed: summary.fail === 0,
    stages,
    summary,
  };
}
