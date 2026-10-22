// 保理（Mock）：应收账单申请 -> 审批（手续费）-> 放款（IN 支付 + 银行报文）
import { FACTORING_STATUS_LABELS } from '../../config/labels';
import { queryOne, queryRows, txExec, txQueryOne, withTransaction } from '../../db/pool';
import { ApiError } from '../../errors';
import { writeAudit } from '../../middleware/audit';
import { insertIntegrationMessage } from '../../platform/edi';
import { emitEvent } from '../../platform/eventBus';
import { billOutstandingTx } from '../../services/billService';
import { nextDocNo } from '../../platform/sequence';
import type { AuthUser, BillRow, FactoringApplicationRow, PartnerRow } from '../../types';
import { formatDateTime, formatDate, nowDate, todayCompact } from '../../utils/datetime';
import { round2 } from '../../utils/json';
import { optionalString, pageResult, parsePage } from '../shared/pagination';

interface FactoringJoinedRow extends FactoringApplicationRow {
  order_no: string | null;
  bill_no: string | null;
  applicant_name: string | null;
  finance_partner_name: string | null;
}

const FACTORING_JOINED_SELECT = `
  SELECT f.*, o.order_no, b.bill_no, c.name AS applicant_name, p.name AS finance_partner_name
    FROM factoring_application f
    LEFT JOIN orders o ON o.id = f.order_id
    LEFT JOIN bill b ON b.id = f.bill_id
    LEFT JOIN customer c ON c.id = f.applicant_customer_id
    LEFT JOIN partner p ON p.id = f.finance_partner_id`;

export function factoringDto(row: FactoringJoinedRow) {
  return {
    id: Number(row.id),
    appNo: row.app_no,
    orderId: row.order_id === null ? null : Number(row.order_id),
    orderNo: row.order_no,
    billId: Number(row.bill_id),
    billNo: row.bill_no,
    applicantName: row.applicant_name,
    financePartnerName: row.finance_partner_name,
    amount: Number(row.amount),
    discountRate: Number(row.discount_rate),
    fee: Number(row.fee),
    status: row.status,
    statusLabel: FACTORING_STATUS_LABELS[row.status],
    appliedAt: row.applied_at,
    approvedAt: row.approved_at,
    settledAt: row.settled_at,
  };
}

async function loadFactoringJoined(id: number): Promise<FactoringJoinedRow> {
  const row = await queryOne<FactoringJoinedRow>(`${FACTORING_JOINED_SELECT} WHERE f.id = ?`, [id]);
  if (!row) {
    throw new ApiError(40401, '保理申请不存在');
  }
  return row;
}

/** GET /api/factoring/applications */
export async function listFactoringApplications(query: Record<string, unknown>) {
  const pager = parsePage(query, 10, 100);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const status = optionalString(query.status);
  if (status) {
    conditions.push('f.status = ?');
    params.push(status);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM factoring_application f ${where}`,
    params,
  );
  const rows = await queryRows<FactoringJoinedRow>(
    `${FACTORING_JOINED_SELECT} ${where} ORDER BY f.applied_at DESC, f.id DESC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  return pageResult(rows.map(factoringDto), Number(totalRow?.total ?? 0), pager);
}

export interface CreateFactoringInput {
  billId: number;
  financePartnerId: number;
  amount?: number;
  discountRate?: number;
}

/** POST /api/factoring/applications：仅应收且未结清账单可申请 */
export async function createFactoringApplication(input: CreateFactoringInput, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const bill = await txQueryOne<BillRow>(conn, 'SELECT * FROM bill WHERE id = ? FOR UPDATE', [input.billId]);
    if (!bill) {
      throw new ApiError(40401, '账单不存在');
    }
    if (bill.bill_type !== 'RECEIVABLE') {
      throw new ApiError(42201, '仅应收账单可申请保理');
    }
    const outstanding = await billOutstandingTx(conn, input.billId);
    if (outstanding.outstanding <= 0) {
      throw new ApiError(42201, '账单已结清，不能申请保理');
    }
    const financePartner = await txQueryOne<PartnerRow>(conn, 'SELECT * FROM partner WHERE id = ?', [
      input.financePartnerId,
    ]);
    if (!financePartner) {
      throw new ApiError(40401, '保理金融机构不存在');
    }
    const amount = round2(input.amount === undefined ? outstanding.outstanding : Number(input.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ApiError(40001, '保理金额必须大于 0');
    }
    if (amount > outstanding.outstanding) {
      throw new ApiError(42201, `保理金额超过账单未结清金额（可申请 ${outstanding.outstanding} 元）`);
    }
    const applicantCustomerId = bill.counterparty_type === 'CUSTOMER' && bill.counterparty_id
      ? Number(bill.counterparty_id)
      : await (async () => {
          const order = await txQueryOne<{ customer_id: number | null }>(
            conn,
            'SELECT customer_id FROM orders WHERE id = ?',
            [bill.order_id],
          );
          return order?.customer_id === null || order?.customer_id === undefined ? 0 : Number(order.customer_id);
        })();
    const appNo = await nextDocNo(conn, {
      table: 'factoring_application',
      column: 'app_no',
      prefix: `FAC${todayCompact()}`,
      width: 4,
    });
    const at = formatDateTime(nowDate());
    const inserted = await txExec(
      conn,
      `INSERT INTO factoring_application (app_no, order_id, bill_id, applicant_customer_id, finance_partner_id,
         amount, discount_rate, fee, status, applied_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'SUBMITTED', ?, ?)`,
      [
        appNo,
        bill.order_id,
        input.billId,
        applicantCustomerId,
        input.financePartnerId,
        amount,
        round2(Number(input.discountRate ?? 6.5)),
        at,
        user.uid,
      ],
    );
    const appId = Number(inserted.insertId);
    await emitEvent(conn, {
      eventType: 'factoring.submitted',
      aggregateType: 'FACTORING_APPLICATION',
      aggregateId: appId,
      payload: { appId, appNo, billId: input.billId, amount, appliedAt: at },
    });
    await writeAudit(conn, {
      user,
      action: 'FACTORING_APPLY',
      actionLabel: '保理申请',
      module: 'factoring',
      targetType: 'FACTORING_APPLICATION',
      targetId: appId,
      detail: { appNo, billId: input.billId, amount, financePartnerId: input.financePartnerId },
      ip,
    });
    const row = await txQueryOne<FactoringJoinedRow>(conn, `${FACTORING_JOINED_SELECT} WHERE f.id = ?`, [appId]);
    if (!row) {
      throw new ApiError(50000, '保理申请创建后读取失败');
    }
    const dto = factoringDto(row);
    return { ...dto, application: dto };
  });
}

/** POST /api/factoring/applications/:id/approve */
export async function approveFactoringApplication(
  id: number,
  approved: boolean,
  user: AuthUser,
  ip: string | null,
) {
  return withTransaction(async (conn) => {
    const app = await txQueryOne<FactoringApplicationRow>(
      conn,
      'SELECT * FROM factoring_application WHERE id = ? FOR UPDATE',
      [id],
    );
    if (!app) {
      throw new ApiError(40401, '保理申请不存在');
    }
    if (app.status !== 'SUBMITTED') {
      if (app.status === 'APPROVED' || app.status === 'REJECTED' || app.status === 'SETTLED') {
        throw new ApiError(40902, '该保理申请已审批，请勿重复操作');
      }
      throw new ApiError(40901, '当前保理申请状态不允许审批');
    }
    const at = formatDateTime(nowDate());
    let fee = 0;
    if (approved) {
      const bill = await txQueryOne<BillRow>(conn, 'SELECT * FROM bill WHERE id = ?', [app.bill_id]);
      let termDays = 30;
      if (bill?.due_date) {
        const due = new Date(`${bill.due_date}T00:00:00`).getTime();
        const today = new Date(`${formatDate(new Date())}T00:00:00`).getTime();
        termDays = Math.max(1, Math.ceil((due - today) / 86400000));
      }
      fee = round2((Number(app.amount) * Number(app.discount_rate) * termDays) / (100 * 360));
      await txExec(
        conn,
        "UPDATE factoring_application SET status = 'APPROVED', fee = ?, approved_at = ? WHERE id = ?",
        [fee, at, id],
      );
    } else {
      await txExec(
        conn,
        "UPDATE factoring_application SET status = 'REJECTED', approved_at = ? WHERE id = ?",
        [at, id],
      );
    }
    await emitEvent(conn, {
      eventType: approved ? 'factoring.approved' : 'factoring.rejected',
      aggregateType: 'FACTORING_APPLICATION',
      aggregateId: id,
      payload: { appId: id, appNo: app.app_no, approved, fee, approvedAt: at },
    });
    await writeAudit(conn, {
      user,
      action: 'FACTORING_APPROVE',
      actionLabel: '保理审批',
      module: 'factoring',
      targetType: 'FACTORING_APPLICATION',
      targetId: id,
      detail: { appNo: app.app_no, approved, fee },
      ip,
    });
    const row = await txQueryOne<FactoringJoinedRow>(conn, `${FACTORING_JOINED_SELECT} WHERE f.id = ?`, [id]);
    if (!row) {
      throw new ApiError(50000, '保理申请读取失败');
    }
    const dto = factoringDto(row);
    return { ...dto, application: dto };
  });
}

/** POST /api/factoring/applications/:id/settle：放款（生成 IN 支付 + 银行报文） */
export async function settleFactoringApplication(id: number, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const app = await txQueryOne<FactoringApplicationRow>(
      conn,
      'SELECT * FROM factoring_application WHERE id = ? FOR UPDATE',
      [id],
    );
    if (!app) {
      throw new ApiError(40401, '保理申请不存在');
    }
    if (app.status === 'SETTLED') {
      throw new ApiError(40902, '该保理申请已放款，请勿重复操作');
    }
    if (app.status !== 'APPROVED') {
      throw new ApiError(40901, '仅已审批的保理申请可放款');
    }
    const at = formatDateTime(nowDate());
    const netAmount = round2(Number(app.amount) - Number(app.fee));
    const paymentNo = await nextDocNo(conn, {
      table: 'payment',
      column: 'payment_no',
      prefix: `PAY${todayCompact()}`,
      width: 4,
    });
    const bankSerial = `FACT${todayCompact()}${String(app.id).padStart(6, '0')}`;
    const paymentInsert = await txExec(
      conn,
      `INSERT INTO payment (payment_no, direction, counterparty_type, counterparty_id, bill_id, amount, method,
         status, bank_serial, paid_at, remark, created_by, created_at)
       VALUES (?, 'IN', 'FINANCE', ?, ?, ?, 'FACTORING', 'SUCCESS', ?, ?, ?, ?, ?)`,
      [
        paymentNo,
        app.finance_partner_id,
        app.bill_id,
        netAmount,
        bankSerial,
        at,
        `保理放款（申请 ${app.app_no}，手续费 ${Number(app.fee)}）`,
        user.uid,
        at,
      ],
    );
    const paymentId = Number(paymentInsert.insertId);
    await txExec(conn, "UPDATE factoring_application SET status = 'SETTLED', settled_at = ? WHERE id = ?", [
      at,
      id,
    ]);
    await insertIntegrationMessage(conn, {
      systemCode: 'BANK',
      systemName: '银行支付',
      direction: 'OUT',
      msgType: 'BANK_PAYMENT_RECEIPT',
      standard: 'JSON 回执',
      relatedType: 'FACTORING_APPLICATION',
      relatedId: id,
      payload: {
        appNo: app.app_no,
        paymentNo,
        amount: netAmount,
        fee: Number(app.fee),
        direction: 'IN',
        method: 'FACTORING',
        bankSerial,
        paidAt: at,
        status: 'SUCCESS',
      },
    });
    await emitEvent(conn, {
      eventType: 'factoring.settled',
      aggregateType: 'FACTORING_APPLICATION',
      aggregateId: id,
      payload: { appId: id, appNo: app.app_no, paymentId, amount: netAmount, settledAt: at },
    });
    await writeAudit(conn, {
      user,
      action: 'FACTORING_SETTLE',
      actionLabel: '保理放款',
      module: 'factoring',
      targetType: 'FACTORING_APPLICATION',
      targetId: id,
      detail: { appNo: app.app_no, paymentNo, amount: netAmount, fee: Number(app.fee) },
      ip,
    });
    const row = await txQueryOne<FactoringJoinedRow>(conn, `${FACTORING_JOINED_SELECT} WHERE f.id = ?`, [id]);
    if (!row) {
      throw new ApiError(50000, '保理申请读取失败');
    }
    const dto = factoringDto(row);
    return {
      ...dto,
      application: dto,
      payment: { id: paymentId, paymentNo, amount: netAmount, bankSerial, paidAt: at, status: 'SUCCESS' },
    };
  });
}

export { loadFactoringJoined };
