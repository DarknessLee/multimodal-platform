// 监管：报送单生成/提交/受理 + 5 类合规检查 + 监管看板
import {
  COMPLIANCE_CHECK_TYPE_LABELS,
  COMPLIANCE_RESULT_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_TYPE_LABELS,
} from '../../config/labels';
import { queryOne, queryRows, txExec, txQueryOne, txQueryRows, withTransaction } from '../../db/pool';
import { ApiError } from '../../errors';
import { writeAudit } from '../../middleware/audit';
import { insertIntegrationMessage } from '../../platform/edi';
import { emitEvent } from '../../platform/eventBus';
import { nextDocNo } from '../../platform/sequence';
import type {
  AuthUser,
  ComplianceCheckRow,
  ComplianceCheckType,
  ComplianceResult,
  RegulatorReportRow,
  ReportStatus,
  ReportType,
} from '../../types';
import { formatDateTime, nowDate, todayCompact } from '../../utils/datetime';
import { parseJson, round2 } from '../../utils/json';
import { optionalString, pageResult, parsePage } from '../shared/pagination';

function reportDto(row: RegulatorReportRow) {
  return {
    id: Number(row.id),
    reportNo: row.report_no,
    reportType: row.report_type,
    reportTypeLabel: REPORT_TYPE_LABELS[row.report_type as ReportType],
    period: row.period,
    regulatorName: row.regulator_name,
    status: row.status,
    statusLabel: REPORT_STATUS_LABELS[row.status as ReportStatus],
    submittedAt: row.submitted_at,
    acceptedAt: row.accepted_at,
    remark: row.remark,
    createdAt: row.created_at,
  };
}

function checkDto(row: ComplianceCheckRow) {
  return {
    id: Number(row.id),
    checkNo: row.check_no,
    checkType: row.check_type,
    checkTypeLabel: COMPLIANCE_CHECK_TYPE_LABELS[row.check_type as ComplianceCheckType],
    targetType: row.target_type,
    targetId: row.target_id,
    result: row.result,
    resultLabel: COMPLIANCE_RESULT_LABELS[row.result as ComplianceResult],
    detail: row.detail,
    checkedAt: row.checked_at,
  };
}

async function loadReportRow(id: number): Promise<RegulatorReportRow> {
  const row = await queryOne<RegulatorReportRow>('SELECT * FROM regulator_report WHERE id = ?', [id]);
  if (!row) {
    throw new ApiError(40401, '监管报送单不存在');
  }
  return row;
}

/** GET /api/regulator/reports */
export async function listReports(query: Record<string, unknown>) {
  const pager = parsePage(query, 10, 100);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const status = optionalString(query.status);
  const reportType = optionalString(query.reportType);
  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (reportType) {
    conditions.push('report_type = ?');
    params.push(reportType);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM regulator_report ${where}`,
    params,
  );
  const rows = await queryRows<RegulatorReportRow>(
    `SELECT * FROM regulator_report ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  return pageResult(rows.map(reportDto), Number(totalRow?.total ?? 0), pager);
}

async function buildReportContent(period: string) {
  const monthStart = `${period}-01 00:00:00`;
  const [yearText, monthText] = period.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const nextMonth = month === 12 ? `${year + 1}-01-01 00:00:00` : `${year}-${String(month + 1).padStart(2, '0')}-01 00:00:00`;

  const orderStats = await queryRows<{ status: string; total: number }>(
    `SELECT status, COUNT(*) AS total FROM orders
      WHERE created_at >= ? AND created_at < ? GROUP BY status`,
    [monthStart, nextMonth],
  );
  const orderTotal = orderStats.reduce((sum, row) => sum + Number(row.total), 0);
  const waybillRow = await queryOne<{ total: number; in_transit: number }>(
    `SELECT COUNT(*) AS total, COALESCE(SUM(status = 'IN_TRANSIT'), 0) AS in_transit
       FROM waybill WHERE created_at >= ? AND created_at < ? AND waybill_type = 'MASTER'`,
    [monthStart, nextMonth],
  );
  const billRow = await queryOne<{
    receivable: number;
    receivable_amount: number | null;
    payable: number;
    payable_amount: number | null;
    profit: number | null;
  }>(
    `SELECT COALESCE(SUM(bill_type = 'RECEIVABLE'), 0) AS receivable,
            COALESCE(SUM(CASE WHEN bill_type = 'RECEIVABLE' THEN total_amount ELSE 0 END), 0) AS receivable_amount,
            COALESCE(SUM(bill_type = 'PAYABLE'), 0) AS payable,
            COALESCE(SUM(CASE WHEN bill_type = 'PAYABLE' THEN total_amount ELSE 0 END), 0) AS payable_amount,
            COALESCE(SUM(profit_amount), 0) AS profit
       FROM bill WHERE issued_at >= ? AND issued_at < ?`,
    [monthStart, nextMonth],
  );
  const alertRow = await queryOne<{ total: number; open: number; critical: number }>(
    `SELECT COUNT(*) AS total, COALESCE(SUM(status = 'OPEN'), 0) AS open,
            COALESCE(SUM(level = 'CRITICAL'), 0) AS critical
       FROM alert WHERE occurred_at >= ? AND occurred_at < ?`,
    [monthStart, nextMonth],
  );
  const invoiceRow = await queryOne<{ total: number; amount: number | null }>(
    `SELECT COUNT(*) AS total, COALESCE(SUM(total_amount), 0) AS amount
       FROM invoice WHERE issued_at >= ? AND issued_at < ?`,
    [monthStart, nextMonth],
  );
  const containerRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM container WHERE created_at >= ? AND created_at < ?`,
    [monthStart, nextMonth],
  );
  const orderByStatus: Record<string, number> = {};
  for (const row of orderStats) orderByStatus[row.status] = Number(row.total);

  return {
    period,
    generatedAt: formatDateTime(nowDate()),
    orders: { total: orderTotal, byStatus: orderByStatus },
    waybills: {
      total: Number(waybillRow?.total ?? 0),
      inTransit: Number(waybillRow?.in_transit ?? 0),
    },
    bills: {
      receivable: Number(billRow?.receivable ?? 0),
      payable: Number(billRow?.payable ?? 0),
      receivableAmount: round2(Number(billRow?.receivable_amount ?? 0)),
      payableAmount: round2(Number(billRow?.payable_amount ?? 0)),
      profit: round2(Number(billRow?.profit ?? 0)),
    },
    alerts: {
      total: Number(alertRow?.total ?? 0),
      open: Number(alertRow?.open ?? 0),
      critical: Number(alertRow?.critical ?? 0),
    },
    invoices: { total: Number(invoiceRow?.total ?? 0), amount: round2(Number(invoiceRow?.amount ?? 0)) },
    containers: { total: Number(containerRow?.total ?? 0) },
  };
}

export interface CreateReportInput {
  reportType: ReportType;
  period: string;
  regulatorName: string;
}

/** POST /api/regulator/reports：按周期聚合生成监管报送单（DRAFT） */
export async function createReport(input: CreateReportInput, user: AuthUser, ip: string | null) {
  if (!/^\d{4}-\d{2}$/.test(input.period)) {
    throw new ApiError(40001, '报送周期格式应为 YYYY-MM');
  }
  const content = await buildReportContent(input.period);
  return withTransaction(async (conn) => {
    const reportNo = await nextDocNo(conn, {
      table: 'regulator_report',
      column: 'report_no',
      prefix: `JG${todayCompact()}`,
      width: 3,
    });
    const at = formatDateTime(nowDate());
    const inserted = await txExec(
      conn,
      `INSERT INTO regulator_report (report_no, report_type, period, regulator_name, content, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?)`,
      [reportNo, input.reportType, input.period, input.regulatorName, JSON.stringify(content), user.uid, at],
    );
    const reportId = Number(inserted.insertId);
    await emitEvent(conn, {
      eventType: 'regulator.report.created',
      aggregateType: 'REGULATOR_REPORT',
      aggregateId: reportId,
      payload: { reportId, reportNo, reportType: input.reportType, period: input.period },
    });
    await writeAudit(conn, {
      user,
      action: 'REGULATOR_REPORT_CREATE',
      actionLabel: '生成监管报送',
      module: 'regulator',
      targetType: 'REGULATOR_REPORT',
      targetId: reportId,
      detail: { reportNo, reportType: input.reportType, period: input.period },
      ip,
    });
    const row = await txQueryOne<RegulatorReportRow>(conn, 'SELECT * FROM regulator_report WHERE id = ?', [reportId]);
    if (!row) {
      throw new ApiError(50000, '监管报送单创建后读取失败');
    }
    const dto = reportDto(row);
    return { ...dto, report: dto, content };
  });
}

/** GET /api/regulator/reports/:id */
export async function getReportDetail(id: number) {
  const row = await loadReportRow(id);
  const dto = reportDto(row);
  const content = parseJson<unknown>(row.content, null);
  return { ...dto, report: dto, content };
}

/** POST /api/regulator/reports/:id/submit：DRAFT -> SUBMITTED（REGULATOR_SUBMIT 报文） */
export async function submitReport(id: number, user: AuthUser, ip: string | null) {
  const result = await withTransaction(async (conn) => {
    const report = await txQueryOne<RegulatorReportRow>(
      conn,
      'SELECT * FROM regulator_report WHERE id = ? FOR UPDATE',
      [id],
    );
    if (!report) {
      throw new ApiError(40401, '监管报送单不存在');
    }
    if (report.status !== 'DRAFT') {
      if (report.status === 'SUBMITTED') {
        throw new ApiError(40902, '报送单已提交，请勿重复操作');
      }
      throw new ApiError(40901, '仅草稿状态的报送单可提交');
    }
    const at = formatDateTime(nowDate());
    await txExec(conn, "UPDATE regulator_report SET status = 'SUBMITTED', submitted_at = ? WHERE id = ?", [at, id]);
    const message = await insertIntegrationMessage(conn, {
      systemCode: 'REGULATOR',
      systemName: '监管报送平台',
      direction: 'OUT',
      msgType: 'REGULATOR_SUBMIT',
      standard: 'JSON 报送',
      relatedType: 'REGULATOR_REPORT',
      relatedId: id,
      payload: {
        reportNo: report.report_no,
        reportType: report.report_type,
        period: report.period,
        regulatorName: report.regulator_name,
        submittedAt: at,
      },
    });
    await emitEvent(conn, {
      eventType: 'regulator.report.submitted',
      aggregateType: 'REGULATOR_REPORT',
      aggregateId: id,
      payload: { reportId: id, reportNo: report.report_no, submittedAt: at, messageId: message.id },
    });
    await writeAudit(conn, {
      user,
      action: 'REGULATOR_REPORT_SUBMIT',
      actionLabel: '提交监管报送',
      module: 'regulator',
      targetType: 'REGULATOR_REPORT',
      targetId: id,
      detail: { reportNo: report.report_no, messageNo: message.msgNo },
      ip,
    });
    return { id };
  });
  return getReportDetail(result.id);
}

export interface AcceptReportInput {
  accepted: boolean;
  comment?: string;
}

/** POST /api/regulator/reports/:id/accept：SUBMITTED -> ACCEPTED / RETURNED（REGULATOR_RECEIPT 报文） */
export async function acceptReport(id: number, input: AcceptReportInput, user: AuthUser, ip: string | null) {
  const result = await withTransaction(async (conn) => {
    const report = await txQueryOne<RegulatorReportRow>(
      conn,
      'SELECT * FROM regulator_report WHERE id = ? FOR UPDATE',
      [id],
    );
    if (!report) {
      throw new ApiError(40401, '监管报送单不存在');
    }
    if (report.status === 'ACCEPTED' || report.status === 'RETURNED') {
      throw new ApiError(40902, '报送单已受理，请勿重复操作');
    }
    if (report.status !== 'SUBMITTED') {
      throw new ApiError(40901, '仅已提交的报送单可受理');
    }
    const nextStatus: ReportStatus = input.accepted ? 'ACCEPTED' : 'RETURNED';
    const at = formatDateTime(nowDate());
    await txExec(conn, 'UPDATE regulator_report SET status = ?, accepted_at = ?, remark = ? WHERE id = ?', [
      nextStatus,
      at,
      input.comment ?? null,
      id,
    ]);
    const message = await insertIntegrationMessage(conn, {
      systemCode: 'REGULATOR',
      systemName: '监管报送平台',
      direction: 'IN',
      msgType: 'REGULATOR_RECEIPT',
      standard: 'JSON 回执',
      relatedType: 'REGULATOR_REPORT',
      relatedId: id,
      payload: {
        reportNo: report.report_no,
        accepted: input.accepted,
        comment: input.comment ?? null,
        acceptedAt: at,
      },
    });
    await emitEvent(conn, {
      eventType: 'regulator.report.accepted',
      aggregateType: 'REGULATOR_REPORT',
      aggregateId: id,
      payload: {
        reportId: id,
        reportNo: report.report_no,
        status: nextStatus,
        accepted: input.accepted,
        acceptedAt: at,
        messageId: message.id,
      },
    });
    await writeAudit(conn, {
      user,
      action: 'REGULATOR_REPORT_ACCEPT',
      actionLabel: '监管受理回执',
      module: 'regulator',
      targetType: 'REGULATOR_REPORT',
      targetId: id,
      detail: { reportNo: report.report_no, accepted: input.accepted, status: nextStatus, messageNo: message.msgNo },
      ip,
    });
    return { id };
  });
  return getReportDetail(result.id);
}

/** GET /api/regulator/compliance-checks */
export async function listComplianceChecks(query: Record<string, unknown>) {
  const pager = parsePage(query, 10, 100);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const result = optionalString(query.result);
  const checkType = optionalString(query.checkType);
  if (result) {
    conditions.push('result = ?');
    params.push(result);
  }
  if (checkType) {
    conditions.push('check_type = ?');
    params.push(checkType);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM compliance_check ${where}`,
    params,
  );
  const rows = await queryRows<ComplianceCheckRow>(
    `SELECT * FROM compliance_check ${where} ORDER BY checked_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  return pageResult(rows.map(checkDto), Number(totalRow?.total ?? 0), pager);
}

const CONTAINER_LETTERS: Record<string, number> = {
  A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20,
  K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31,
  U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38,
};

/** ISO 6346 箱号校验位：返回 null 表示格式不合法，否则返回布尔 */
function validateContainerNo(containerNo: string): boolean | null {
  const value = String(containerNo ?? '').toUpperCase();
  if (!/^[A-Z]{4}\d{7}$/.test(value)) return null;
  let sum = 0;
  for (let index = 0; index < 10; index += 1) {
    const char = value[index];
    const numeric = /\d/.test(char) ? Number(char) : CONTAINER_LETTERS[char];
    if (numeric === undefined) return null;
    sum += numeric * 2 ** index;
  }
  return sum % 11 % 10 === Number(value[10]);
}

interface DraftCheck {
  checkType: ComplianceCheckType;
  targetType: string;
  targetId: string;
  result: ComplianceResult;
  detail: string;
}

async function buildComplianceChecks(): Promise<DraftCheck[]> {
  const drafts: DraftCheck[] = [];

  // 1) 箱号校验（最近 4 个箱）
  const containers = await queryRows<{ container_no: string }>(
    'SELECT container_no FROM container ORDER BY id DESC LIMIT 4',
  );
  if (containers.length === 0) {
    drafts.push({
      checkType: 'CONTAINER_NO',
      targetType: 'CONTAINER',
      targetId: 'N/A',
      result: 'WARN',
      detail: '无集装箱数据，跳过箱号校验',
    });
  }
  for (const container of containers) {
    const valid = validateContainerNo(container.container_no);
    drafts.push({
      checkType: 'CONTAINER_NO',
      targetType: 'CONTAINER',
      targetId: container.container_no,
      result: valid === null ? 'FAIL' : valid ? 'PASS' : 'FAIL',
      detail:
        valid === null
          ? `箱号 ${container.container_no} 格式不符合 ISO 6346`
          : valid
            ? `箱号 ${container.container_no} 校验位正确`
            : `箱号 ${container.container_no} 校验位错误`,
    });
  }

  // 2) 单证完整性（最近主运单）
  const waybill = await queryOne<{ id: number; waybill_no: string }>(
    "SELECT id, waybill_no FROM waybill WHERE waybill_type = 'MASTER' ORDER BY id DESC LIMIT 1",
  );
  if (waybill) {
    const segmentCount = await queryOne<{ total: number }>(
      'SELECT COUNT(*) AS total FROM waybill_segment WHERE waybill_id = ?',
      [waybill.id],
    );
    const docCount = await queryOne<{ total: number }>(
      "SELECT COUNT(*) AS total FROM document WHERE biz_type = 'WAYBILL' AND biz_id = ?",
      [waybill.id],
    );
    const segments = Number(segmentCount?.total ?? 0);
    const documents = Number(docCount?.total ?? 0);
    const ok = segments >= 3 && documents >= 4;
    drafts.push({
      checkType: 'WAYBILL_COMPLETE',
      targetType: 'WAYBILL',
      targetId: waybill.waybill_no,
      result: ok ? 'PASS' : segments > 0 ? 'WARN' : 'FAIL',
      detail: `分段 ${segments} 条 / 单证 ${documents} 份`,
    });
  }

  // 3) 发票一致性（最近 2 张发票）
  const invoices = await queryRows<{
    id: number;
    invoice_no: string;
    amount: number;
    tax_amount: number;
    bill_id: number;
  }>('SELECT id, invoice_no, amount, tax_amount, bill_id FROM invoice ORDER BY id DESC LIMIT 2');
  for (const invoice of invoices) {
    const bill = await queryOne<{ bill_no: string; total_amount: number }>(
      'SELECT bill_no, total_amount FROM bill WHERE id = ?',
      [invoice.bill_id],
    );
    const amountMatch = bill ? Math.abs(Number(invoice.amount) - Number(bill.total_amount)) < 0.02 : false;
    const expectedTax = Math.round((Number(invoice.amount) * 9 * 100) / 109) / 100;
    const taxMatch = Math.abs(Number(invoice.tax_amount) - expectedTax) < 0.02;
    drafts.push({
      checkType: 'INVOICE_MATCH',
      targetType: 'INVOICE',
      targetId: invoice.invoice_no,
      result: amountMatch && taxMatch ? 'PASS' : 'FAIL',
      detail: amountMatch && taxMatch
        ? '发票金额与税额与账单一致'
        : `发票金额/税额与账单不一致（账单 ${bill?.bill_no ?? invoice.bill_id}）`,
    });
  }

  // 4) 财务平衡（最近应收账单）
  const bill = await queryOne<{ id: number; bill_no: string; total_amount: number; profit_amount: number }>(
    "SELECT id, bill_no, total_amount, profit_amount FROM bill WHERE bill_type = 'RECEIVABLE' ORDER BY id DESC LIMIT 1",
  );
  if (bill) {
    const itemRow = await queryOne<{ total: number | null }>(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM bill_item WHERE bill_id = ?',
      [bill.id],
    );
    const payableRow = await queryOne<{ total: number | null }>(
      "SELECT COALESCE(SUM(total_amount), 0) AS total FROM bill WHERE order_id = (SELECT order_id FROM bill WHERE id = ?) AND bill_type = 'PAYABLE'",
      [bill.id],
    );
    const itemsSum = round2(Number(itemRow?.total ?? 0));
    const payableSum = round2(Number(payableRow?.total ?? 0));
    const itemBalanced = Math.abs(itemsSum - Number(bill.total_amount)) < 0.02;
    const profitBalanced = Math.abs(Number(bill.total_amount) - payableSum - Number(bill.profit_amount)) < 0.02;
    drafts.push({
      checkType: 'FINANCE_BALANCE',
      targetType: 'BILL',
      targetId: bill.bill_no,
      result: itemBalanced && profitBalanced ? 'PASS' : 'WARN',
      detail: `明细 ${itemsSum} / 总额 ${Number(bill.total_amount)} / 应付 ${payableSum} / 毛利 ${Number(bill.profit_amount)}`,
    });
  }

  // 5) 报文质量（最近 3 条报文）
  const messages = await queryRows<{
    id: number;
    msg_no: string;
    status: string;
    payload: unknown;
    response_payload: unknown;
    retry_count: number;
  }>('SELECT id, msg_no, status, payload, response_payload, retry_count FROM integration_message ORDER BY id DESC LIMIT 3');
  for (const message of messages) {
    const hasRequest = message.payload !== null && message.payload !== undefined;
    if (!hasRequest) {
      drafts.push({
        checkType: 'MESSAGE_QUALITY',
        targetType: 'MESSAGE',
        targetId: message.msg_no,
        result: 'FAIL',
        detail: '报文请求体缺失',
      });
    } else if (message.status === 'FAILED') {
      drafts.push({
        checkType: 'MESSAGE_QUALITY',
        targetType: 'MESSAGE',
        targetId: message.msg_no,
        result: 'WARN',
        detail: `报文失败，可重试（已重试 ${Number(message.retry_count)} 次）`,
      });
    } else {
      drafts.push({
        checkType: 'MESSAGE_QUALITY',
        targetType: 'MESSAGE',
        targetId: message.msg_no,
        result: 'PASS',
        detail: '请求/响应完整，状态正常',
      });
    }
  }

  return drafts;
}

/** POST /api/regulator/compliance-checks/run：执行 5 类合规检查并落库 */
export async function runComplianceChecks(user: AuthUser, ip: string | null) {
  const drafts = await buildComplianceChecks();
  const result = await withTransaction(async (conn) => {
    const at = formatDateTime(nowDate());
    const inserted: ComplianceCheckRow[] = [];
    for (const draft of drafts) {
      const checkNo = await nextDocNo(conn, {
        table: 'compliance_check',
        column: 'check_no',
        prefix: `HC${todayCompact()}`,
        width: 4,
      });
      const exec = await txExec(
        conn,
        `INSERT INTO compliance_check (check_no, check_type, target_type, target_id, result, detail, checked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [checkNo, draft.checkType, draft.targetType, draft.targetId, draft.result, draft.detail.slice(0, 500), at],
      );
      inserted.push({
        id: Number(exec.insertId),
        check_no: checkNo,
        check_type: draft.checkType,
        target_type: draft.targetType,
        target_id: draft.targetId,
        result: draft.result,
        detail: draft.detail,
        checked_at: at,
        created_at: at,
      });
    }
    const summary = {
      pass: inserted.filter((row) => row.result === 'PASS').length,
      warn: inserted.filter((row) => row.result === 'WARN').length,
      fail: inserted.filter((row) => row.result === 'FAIL').length,
      total: inserted.length,
    };
    await writeAudit(conn, {
      user,
      action: 'REGULATOR_CHECK_RUN',
      actionLabel: '执行合规检查',
      module: 'regulator',
      targetType: 'COMPLIANCE_CHECK',
      targetId: inserted[0]?.id ?? 0,
      detail: { summary, checks: inserted.map((row) => row.check_no) },
      ip,
    });
    return { checks: inserted.map(checkDto), summary };
  });
  return result;
}

/** GET /api/regulator/dashboard */
export async function getRegulatorDashboard() {
  const reportRows = await queryRows<{ status: ReportStatus; total: number }>(
    'SELECT status, COUNT(*) AS total FROM regulator_report GROUP BY status',
  );
  const reportCounts: Record<string, number> = { DRAFT: 0, SUBMITTED: 0, ACCEPTED: 0, RETURNED: 0 };
  for (const row of reportRows) reportCounts[row.status] = Number(row.total);
  const totalReports = Object.values(reportCounts).reduce((sum, value) => sum + value, 0);
  const checkRows = await queryRows<{ result: ComplianceResult; total: number }>(
    'SELECT result, COUNT(*) AS total FROM compliance_check GROUP BY result',
  );
  const compliance = { pass: 0, warn: 0, fail: 0 };
  for (const row of checkRows) {
    if (row.result === 'PASS') compliance.pass = Number(row.total);
    if (row.result === 'WARN') compliance.warn = Number(row.total);
    if (row.result === 'FAIL') compliance.fail = Number(row.total);
  }
  const latestReports = await queryRows<RegulatorReportRow>(
    'SELECT * FROM regulator_report ORDER BY created_at DESC, id DESC LIMIT 5',
  );
  const latestChecks = await queryRows<ComplianceCheckRow>(
    'SELECT * FROM compliance_check ORDER BY checked_at DESC, id DESC LIMIT 5',
  );
  return {
    reports: {
      total: totalReports,
      draft: reportCounts.DRAFT,
      submitted: reportCounts.SUBMITTED,
      accepted: reportCounts.ACCEPTED,
      returned: reportCounts.RETURNED,
    },
    compliance,
    latestReports: latestReports.map(reportDto),
    latestChecks: latestChecks.map(checkDto),
  };
}
