// 对账：按对手方/周期汇总应收或应付账单 -> 草稿 -> 发送 -> 确认/异议
import {
  BILL_TYPE_LABELS,
  COUNTERPARTY_TYPE_LABELS,
  RECON_ITEM_STATUS_LABELS,
  RECON_STATUS_LABELS,
} from '../../config/labels';
import { queryOne, queryRows, txExec, txQueryOne, txQueryRows, withTransaction } from '../../db/pool';
import { ApiError } from '../../errors';
import { writeAudit } from '../../middleware/audit';
import { emitEvent } from '../../platform/eventBus';
import { nextDocNo } from '../../platform/sequence';
import type {
  AuthUser,
  BillRow,
  CounterpartyType,
  ReconciliationItemRow,
  ReconciliationRow,
  ReconItemStatus,
  ReconStatus,
} from '../../types';
import { formatDateTime, nowDate, todayCompact } from '../../utils/datetime';
import { round2 } from '../../utils/json';
import { optionalString, pageResult, parsePage } from '../shared/pagination';

interface ReconJoinedRow extends ReconciliationRow {
  counterparty_name: string | null;
}

const RECON_JOINED_SELECT = `
  SELECT r.*,
         CASE WHEN r.counterparty_type = 'CUSTOMER' THEN c.name ELSE p.name END AS counterparty_name
    FROM reconciliation r
    LEFT JOIN customer c ON r.counterparty_type = 'CUSTOMER' AND c.id = r.counterparty_id
    LEFT JOIN partner p ON r.counterparty_type IN ('CARRIER', 'FINANCE') AND p.id = r.counterparty_id`;

export function reconDto(row: ReconJoinedRow) {
  return {
    id: Number(row.id),
    reconNo: row.recon_no,
    counterparty: {
      type: row.counterparty_type,
      typeLabel: COUNTERPARTY_TYPE_LABELS[row.counterparty_type as CounterpartyType],
      id: Number(row.counterparty_id),
      name: row.counterparty_name,
    },
    periodStart: row.period_start,
    periodEnd: row.period_end,
    totalAmount: Number(row.total_amount),
    confirmedAmount: Number(row.confirmed_amount),
    differenceAmount: Number(row.difference_amount),
    status: row.status,
    statusLabel: RECON_STATUS_LABELS[row.status as ReconStatus],
    sentAt: row.sent_at,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
  };
}

async function loadReconJoined(id: number): Promise<ReconJoinedRow> {
  const row = await queryOne<ReconJoinedRow>(`${RECON_JOINED_SELECT} WHERE r.id = ?`, [id]);
  if (!row) {
    throw new ApiError(40401, '对账单不存在');
  }
  return row;
}

/** GET /api/reconciliations */
export async function listReconciliations(query: Record<string, unknown>) {
  const pager = parsePage(query, 10, 100);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const status = optionalString(query.status);
  const counterpartyType = optionalString(query.counterpartyType);
  if (status) {
    conditions.push('r.status = ?');
    params.push(status);
  }
  if (counterpartyType) {
    conditions.push('r.counterparty_type = ?');
    params.push(counterpartyType);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM reconciliation r ${where}`,
    params,
  );
  const rows = await queryRows<ReconJoinedRow>(
    `${RECON_JOINED_SELECT} ${where} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  return pageResult(rows.map(reconDto), Number(totalRow?.total ?? 0), pager);
}

async function assertCounterparty(type: string, id: number): Promise<void> {
  if (type === 'CUSTOMER') {
    const customer = await queryOne<{ id: number }>('SELECT id FROM customer WHERE id = ?', [id]);
    if (!customer) throw new ApiError(40401, '客户不存在');
    return;
  }
  if (type === 'CARRIER' || type === 'FINANCE') {
    const partner = await queryOne<{ id: number }>('SELECT id FROM partner WHERE id = ?', [id]);
    if (!partner) throw new ApiError(40401, '对手方不存在');
    return;
  }
  throw new ApiError(40001, '对手方类型不合法');
}

export interface CreateReconInput {
  counterpartyType: 'CUSTOMER' | 'CARRIER' | 'FINANCE';
  counterpartyId: number;
  periodStart: string;
  periodEnd: string;
}

/** POST /api/reconciliations：按对手方/周期汇总账单生成对账单草稿 */
export async function createReconciliation(input: CreateReconInput, user: AuthUser, ip: string | null) {
  if (input.periodStart > input.periodEnd) {
    throw new ApiError(40001, '对账周期起始日期不能晚于结束日期');
  }
  await assertCounterparty(input.counterpartyType, input.counterpartyId);
  const billType = input.counterpartyType === 'CUSTOMER' ? 'RECEIVABLE' : 'PAYABLE';
  const bills = await queryRows<BillRow>(
    `SELECT * FROM bill
      WHERE bill_type = ? AND counterparty_type = ? AND counterparty_id = ?
        AND DATE(issued_at) BETWEEN ? AND ?
      ORDER BY issued_at ASC, id ASC`,
    [billType, input.counterpartyType, input.counterpartyId, input.periodStart, input.periodEnd],
  );
  if (bills.length === 0) {
    throw new ApiError(42201, '该对手方在所选周期内无可对账账单');
  }
  return withTransaction(async (conn) => {
    const reconNo = await nextDocNo(conn, {
      table: 'reconciliation',
      column: 'recon_no',
      prefix: `DZ${todayCompact()}`,
      width: 4,
    });
    const totalAmount = round2(bills.reduce((sum, bill) => sum + Number(bill.total_amount), 0));
    const at = formatDateTime(nowDate());
    const inserted = await txExec(
      conn,
      `INSERT INTO reconciliation (recon_no, counterparty_type, counterparty_id, period_start, period_end,
         total_amount, confirmed_amount, difference_amount, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'DRAFT', ?, ?)`,
      [reconNo, input.counterpartyType, input.counterpartyId, input.periodStart, input.periodEnd, totalAmount, user.uid, at],
    );
    const reconId = Number(inserted.insertId);
    for (const bill of bills) {
      await txExec(
        conn,
        `INSERT INTO reconciliation_item (recon_id, bill_id, amount, confirmed_amount, status)
         VALUES (?, ?, ?, 0, 'MATCH')`,
        [reconId, bill.id, Number(bill.total_amount)],
      );
    }
    await writeAudit(conn, {
      user,
      action: 'RECON_CREATE',
      actionLabel: '创建对账单',
      module: 'reconciliation',
      targetType: 'RECONCILIATION',
      targetId: reconId,
      detail: {
        reconNo,
        counterpartyType: input.counterpartyType,
        counterpartyId: input.counterpartyId,
        bills: bills.length,
        totalAmount,
      },
      ip,
    });
    return reconId;
  }).then(async (reconId) => {
    const detail = await getReconciliationDetail(reconId);
    return detail;
  });
}

/** GET /api/reconciliations/:id */
export async function getReconciliationDetail(id: number) {
  const recon = await loadReconJoined(id);
  const items = await queryRows<
    ReconciliationItemRow & { bill_no: string; bill_type: string }
  >(
    `SELECT ri.*, b.bill_no, b.bill_type
       FROM reconciliation_item ri JOIN bill b ON b.id = ri.bill_id
      WHERE ri.recon_id = ? ORDER BY ri.id ASC`,
    [id],
  );
  const dto = reconDto(recon);
  return {
    // 兼容两种调用方式：data.recon.* 与 data.status/reconNo（验收脚本使用后者）
    ...dto,
    recon: dto,
    items: items.map((item) => ({
      id: Number(item.id),
      billId: Number(item.bill_id),
      billNo: item.bill_no,
      billType: item.bill_type,
      billTypeLabel: BILL_TYPE_LABELS[item.bill_type as 'RECEIVABLE' | 'PAYABLE'],
      amount: Number(item.amount),
      confirmedAmount: Number(item.confirmed_amount),
      differenceReason: item.difference_reason,
      status: item.status,
      statusLabel: RECON_ITEM_STATUS_LABELS[item.status as ReconItemStatus],
    })),
  };
}

/** POST /api/reconciliations/:id/send：DRAFT -> SENT */
export async function sendReconciliation(id: number, user: AuthUser, ip: string | null) {
  await withTransaction(async (conn) => {
    const recon = await txQueryOne<ReconciliationRow>(conn, 'SELECT * FROM reconciliation WHERE id = ? FOR UPDATE', [
      id,
    ]);
    if (!recon) {
      throw new ApiError(40401, '对账单不存在');
    }
    if (recon.status === 'SENT' || recon.status === 'CONFIRMED' || recon.status === 'DISPUTED') {
      throw new ApiError(40902, '对账单已发送，请勿重复操作');
    }
    if (recon.status !== 'DRAFT') {
      throw new ApiError(40901, '当前对账单状态不允许发送');
    }
    const at = formatDateTime(nowDate());
    await txExec(conn, "UPDATE reconciliation SET status = 'SENT', sent_at = ? WHERE id = ?", [at, id]);
    await emitEvent(conn, {
      eventType: 'reconciliation.sent',
      aggregateType: 'RECONCILIATION',
      aggregateId: id,
      payload: { reconId: id, reconNo: recon.recon_no, totalAmount: Number(recon.total_amount), sentAt: at },
    });
    await writeAudit(conn, {
      user,
      action: 'RECON_SEND',
      actionLabel: '发送对账单',
      module: 'reconciliation',
      targetType: 'RECONCILIATION',
      targetId: id,
      detail: { reconNo: recon.recon_no },
      ip,
    });
    return id;
  });
  return getReconciliationDetail(id);
}

export interface ConfirmReconInput {
  confirmedAmount?: number;
  items?: Array<{ billId: number; confirmedAmount: number }>;
}

/** POST /api/reconciliations/:id/confirm：SENT -> CONFIRMED（记录确认额/差异） */
export async function confirmReconciliation(id: number, input: ConfirmReconInput, user: AuthUser, ip: string | null) {
  await withTransaction(async (conn) => {
    const recon = await txQueryOne<ReconciliationRow>(conn, 'SELECT * FROM reconciliation WHERE id = ? FOR UPDATE', [
      id,
    ]);
    if (!recon) {
      throw new ApiError(40401, '对账单不存在');
    }
    if (recon.status === 'CONFIRMED') {
      throw new ApiError(40902, '对账单已确认，请勿重复操作');
    }
    if (recon.status !== 'SENT') {
      throw new ApiError(40901, '仅已发送的对账单可确认');
    }
    const items = await txQueryRows<ReconciliationItemRow>(
      conn,
      'SELECT * FROM reconciliation_item WHERE recon_id = ? ORDER BY id ASC',
      [id],
    );
    let confirmedTotal = 0;
    for (const item of items) {
      const provided = input.items?.find((row) => Number(row.billId) === Number(item.bill_id));
      const confirmed = provided ? round2(Number(provided.confirmedAmount)) : Number(item.amount);
      const status: ReconItemStatus = confirmed === Number(item.amount) ? 'MATCH' : 'DIFF';
      await txExec(
        conn,
        'UPDATE reconciliation_item SET confirmed_amount = ?, status = ?, difference_reason = ? WHERE id = ?',
        [
          confirmed,
          status,
          status === 'DIFF'
            ? item.difference_reason ?? `确认额 ${confirmed} 与账单额 ${Number(item.amount)} 存在差异`
            : null,
          item.id,
        ],
      );
      confirmedTotal += confirmed;
    }
    confirmedTotal = input.confirmedAmount !== undefined
      ? round2(Number(input.confirmedAmount))
      : round2(confirmedTotal);
    const total = Number(recon.total_amount);
    const difference = round2(total - confirmedTotal);
    const at = formatDateTime(nowDate());
    await txExec(
      conn,
      "UPDATE reconciliation SET status = 'CONFIRMED', confirmed_amount = ?, difference_amount = ?, confirmed_at = ? WHERE id = ?",
      [confirmedTotal, difference, at, id],
    );
    await emitEvent(conn, {
      eventType: 'reconciliation.confirmed',
      aggregateType: 'RECONCILIATION',
      aggregateId: id,
      payload: {
        reconId: id,
        reconNo: recon.recon_no,
        totalAmount: total,
        confirmedAmount: confirmedTotal,
        differenceAmount: difference,
        confirmedAt: at,
      },
    });
    await writeAudit(conn, {
      user,
      action: 'RECON_CONFIRM',
      actionLabel: '确认对账单',
      module: 'reconciliation',
      targetType: 'RECONCILIATION',
      targetId: id,
      detail: { reconNo: recon.recon_no, confirmedAmount: confirmedTotal, differenceAmount: difference },
      ip,
    });
    return id;
  });
  return getReconciliationDetail(id);
}

export interface DisputeReconInput {
  reason: string;
  items?: Array<{ billId: number; differenceReason: string }>;
}

/** POST /api/reconciliations/:id/dispute：SENT -> DISPUTED（差异明细 DIFF） */
export async function disputeReconciliation(id: number, input: DisputeReconInput, user: AuthUser, ip: string | null) {
  await withTransaction(async (conn) => {
    const recon = await txQueryOne<ReconciliationRow>(conn, 'SELECT * FROM reconciliation WHERE id = ? FOR UPDATE', [
      id,
    ]);
    if (!recon) {
      throw new ApiError(40401, '对账单不存在');
    }
    if (recon.status === 'DISPUTED') {
      throw new ApiError(40902, '对账单已提交差异，请勿重复操作');
    }
    if (recon.status !== 'SENT') {
      throw new ApiError(40901, '仅已发送的对账单可提交差异');
    }
    const items = await txQueryRows<ReconciliationItemRow>(
      conn,
      'SELECT * FROM reconciliation_item WHERE recon_id = ? ORDER BY id ASC',
      [id],
    );
    const targets = input.items && input.items.length > 0 ? input.items : items.map((item) => ({
      billId: Number(item.bill_id),
      differenceReason: input.reason,
    }));
    for (const target of targets) {
      const item = items.find((row) => Number(row.bill_id) === Number(target.billId));
      if (!item) continue;
      await txExec(
        conn,
        "UPDATE reconciliation_item SET status = 'DIFF', difference_reason = ? WHERE id = ?",
        [target.differenceReason, item.id],
      );
    }
    const difference = round2(Number(recon.total_amount) - Number(recon.confirmed_amount));
    await txExec(
      conn,
      "UPDATE reconciliation SET status = 'DISPUTED', difference_amount = ? WHERE id = ?",
      [difference, id],
    );
    await emitEvent(conn, {
      eventType: 'reconciliation.disputed',
      aggregateType: 'RECONCILIATION',
      aggregateId: id,
      payload: { reconId: id, reconNo: recon.recon_no, reason: input.reason, differenceAmount: difference },
    });
    await writeAudit(conn, {
      user,
      action: 'RECON_DISPUTE',
      actionLabel: '对账差异',
      module: 'reconciliation',
      targetType: 'RECONCILIATION',
      targetId: id,
      detail: { reconNo: recon.recon_no, reason: input.reason, items: targets.length },
      ip,
    });
    return id;
  });
  return getReconciliationDetail(id);
}
