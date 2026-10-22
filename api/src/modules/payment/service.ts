// 收付款：登记 -> 银行回执 Mock -> 核销账单，写 BANK 集成报文
import {
  PAYMENT_DIRECTION_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from '../../config/labels';
import { queryOne, queryRows, txExec, txQueryOne, withTransaction } from '../../db/pool';
import { ApiError } from '../../errors';
import { writeAudit } from '../../middleware/audit';
import { insertIntegrationMessage } from '../../platform/edi';
import { emitEvent } from '../../platform/eventBus';
import { nextDocNo } from '../../platform/sequence';
import { billOutstandingTx, getBillDetail } from '../../services/billService';
import type {
  AuthUser,
  BillRow,
  CounterpartyType,
  PaymentDirection,
  PaymentMethod,
  PaymentRow,
  PaymentStatus,
} from '../../types';
import { formatDateTime, nowDate, todayCompact } from '../../utils/datetime';
import { round2 } from '../../utils/json';
import { optionalString, pageResult, parsePage } from '../shared/pagination';

interface PaymentJoinedRow extends PaymentRow {
  bill_no: string | null;
  customer_name: string | null;
  partner_name: string | null;
}

const PAYMENT_JOINED_SELECT = `
  SELECT p.*, b.bill_no, c.name AS customer_name, pt.name AS partner_name
    FROM payment p
    LEFT JOIN bill b ON b.id = p.bill_id
    LEFT JOIN customer c ON p.counterparty_type = 'CUSTOMER' AND c.id = p.counterparty_id
    LEFT JOIN partner pt ON p.counterparty_type IN ('CARRIER','FINANCE','INSURER') AND pt.id = p.counterparty_id`;

export function paymentDto(row: PaymentJoinedRow) {
  const counterpartyName =
    row.customer_name ?? row.partner_name ?? (row.counterparty_type === 'CUSTOMER' ? '客户' : null);
  return {
    id: Number(row.id),
    paymentNo: row.payment_no,
    direction: row.direction,
    directionLabel: PAYMENT_DIRECTION_LABELS[row.direction as PaymentDirection],
    counterparty: {
      type: row.counterparty_type,
      typeLabel: row.counterparty_type,
      id: row.counterparty_id === null ? null : Number(row.counterparty_id),
      name: counterpartyName,
    },
    billId: row.bill_id === null ? null : Number(row.bill_id),
    billNo: row.bill_no,
    amount: Number(row.amount),
    method: row.method,
    methodLabel: PAYMENT_METHOD_LABELS[row.method as PaymentMethod],
    status: row.status,
    statusLabel: PAYMENT_STATUS_LABELS[row.status as PaymentStatus],
    bankSerial: row.bank_serial,
    paidAt: row.paid_at,
    remark: row.remark,
    createdAt: row.created_at,
  };
}

async function loadPaymentJoined(id: number): Promise<PaymentJoinedRow> {
  const row = await queryOne<PaymentJoinedRow>(`${PAYMENT_JOINED_SELECT} WHERE p.id = ?`, [id]);
  if (!row) {
    throw new ApiError(40401, '支付记录不存在');
  }
  return row;
}

/** GET /api/payments */
export async function listPayments(query: Record<string, unknown>) {
  const pager = parsePage(query, 10, 100);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const direction = optionalString(query.direction);
  const status = optionalString(query.status);
  const billId = optionalString(query.billId);
  if (direction) {
    conditions.push('p.direction = ?');
    params.push(direction);
  }
  if (status) {
    conditions.push('p.status = ?');
    params.push(status);
  }
  if (billId) {
    conditions.push('p.bill_id = ?');
    params.push(Number(billId));
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM payment p ${where}`,
    params,
  );
  const rows = await queryRows<PaymentJoinedRow>(
    `${PAYMENT_JOINED_SELECT} ${where} ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  return pageResult(rows.map(paymentDto), Number(totalRow?.total ?? 0), pager);
}

export interface CreatePaymentInput {
  direction: PaymentDirection;
  billId: number;
  amount: number;
  method?: PaymentMethod;
  payerName?: string;
  remark?: string;
}

/** POST /api/payments：登记收付款（PENDING，金额不能超过账单未核销额） */
export async function createPayment(input: CreatePaymentInput, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const bill = await txQueryOne<BillRow>(conn, 'SELECT * FROM bill WHERE id = ? FOR UPDATE', [input.billId]);
    if (!bill) {
      throw new ApiError(40401, '账单不存在');
    }
    const outstanding = await billOutstandingTx(conn, input.billId);
    const amount = round2(Number(input.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ApiError(40001, '支付金额必须大于 0');
    }
    if (amount > outstanding.outstanding) {
      throw new ApiError(42201, `支付金额超过账单未核销金额（可核销 ${outstanding.outstanding} 元）`);
    }
    const paymentNo = await nextDocNo(conn, {
      table: 'payment',
      column: 'payment_no',
      prefix: `PAY${todayCompact()}`,
      width: 4,
    });
    const at = formatDateTime(nowDate());
    const counterpartyType = (bill.counterparty_type ?? (input.direction === 'IN' ? 'CUSTOMER' : 'CARRIER')) as CounterpartyType;
    const inserted = await txExec(
      conn,
      `INSERT INTO payment (payment_no, direction, counterparty_type, counterparty_id, bill_id, amount, method,
         status, remark, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      [
        paymentNo,
        input.direction,
        counterpartyType,
        bill.counterparty_id === null ? null : Number(bill.counterparty_id),
        input.billId,
        amount,
        input.method ?? 'BANK_TRANSFER',
        input.payerName ? `付款方/收款方：${input.payerName}` : input.remark ?? null,
        user.uid,
        at,
      ],
    );
    const paymentId = Number(inserted.insertId);
    await emitEvent(conn, {
      eventType: 'payment.created',
      aggregateType: 'PAYMENT',
      aggregateId: paymentId,
      payload: { paymentId, paymentNo, billId: input.billId, amount, direction: input.direction, createdAt: at },
    });
    await writeAudit(conn, {
      user,
      action: 'PAYMENT_RECORD',
      actionLabel: '登记收付款',
      module: 'payment',
      targetType: 'PAYMENT',
      targetId: paymentId,
      detail: { paymentNo, billId: input.billId, amount, direction: input.direction },
      ip,
    });
    const row = await txQueryOne<PaymentJoinedRow>(conn, `${PAYMENT_JOINED_SELECT} WHERE p.id = ?`, [paymentId]);
    if (!row) {
      throw new ApiError(50000, '支付记录创建后读取失败');
    }
    const dto = paymentDto(row);
    return { ...dto, payment: dto };
  });
}

/** POST /api/payments/:id/confirm：银行回执 Mock + 核销账单 */
export async function confirmPayment(id: number, user: AuthUser, ip: string | null) {
  const result = await withTransaction(async (conn) => {
    const payment = await txQueryOne<PaymentRow>(conn, 'SELECT * FROM payment WHERE id = ? FOR UPDATE', [id]);
    if (!payment) {
      throw new ApiError(40401, '支付记录不存在');
    }
    if (payment.status === 'SUCCESS') {
      throw new ApiError(40902, '该支付已确认，请勿重复操作');
    }
    if (payment.status !== 'PENDING') {
      throw new ApiError(40901, '当前支付状态不允许确认');
    }
    if (!payment.bill_id) {
      throw new ApiError(42201, '支付记录未关联账单，无法核销');
    }
    const bill = await txQueryOne<BillRow>(conn, 'SELECT * FROM bill WHERE id = ? FOR UPDATE', [payment.bill_id]);
    if (!bill) {
      throw new ApiError(40401, '账单不存在');
    }
    const outstanding = await billOutstandingTx(conn, Number(payment.bill_id));
    const amount = round2(Number(payment.amount));
    if (amount > outstanding.outstanding) {
      throw new ApiError(42201, `核销金额超过账单未核销金额（可核销 ${outstanding.outstanding} 元）`);
    }
    const at = formatDateTime(nowDate());
    const bankSerial = `BK${todayCompact()}${String(payment.id).padStart(6, '0')}`;
    await txExec(
      conn,
      "UPDATE payment SET status = 'SUCCESS', bank_serial = ?, paid_at = ? WHERE id = ?",
      [bankSerial, at, id],
    );
    const allocation = await txExec(
      conn,
      'INSERT INTO payment_allocation (payment_id, bill_id, amount) VALUES (?, ?, ?)',
      [id, payment.bill_id, amount],
    );
    const allocatedAfter = round2(outstanding.allocated + amount);
    const billTotal = Number(bill.total_amount);
    const billStatus = allocatedAfter >= billTotal - 0.01 ? 'PAID' : 'ISSUED';
    await txExec(conn, 'UPDATE bill SET status = ?, paid_at = ? WHERE id = ?', [
      billStatus,
      billStatus === 'PAID' ? at : null,
      payment.bill_id,
    ]);
    await insertIntegrationMessage(conn, {
      systemCode: 'BANK',
      systemName: '银行支付',
      direction: 'OUT',
      msgType: 'BANK_PAYMENT_RECEIPT',
      standard: 'JSON 回执',
      relatedType: 'PAYMENT',
      relatedId: id,
      payload: {
        paymentNo: payment.payment_no,
        direction: payment.direction,
        billNo: bill.bill_no,
        amount,
        bankSerial,
        paidAt: at,
        status: 'SUCCESS',
      },
    });
    await emitEvent(conn, {
      eventType: 'payment.confirmed',
      aggregateType: 'PAYMENT',
      aggregateId: id,
      payload: {
        paymentId: id,
        paymentNo: payment.payment_no,
        billId: Number(payment.bill_id),
        amount,
        bankSerial,
        paidAt: at,
      },
    });
    await writeAudit(conn, {
      user,
      action: 'PAYMENT_CONFIRM',
      actionLabel: '支付回执确认',
      module: 'payment',
      targetType: 'PAYMENT',
      targetId: id,
      detail: { paymentNo: payment.payment_no, billId: Number(payment.bill_id), amount, bankSerial },
      ip,
    });
    return {
      paymentId: id,
      allocationId: Number(allocation.insertId),
      billId: Number(payment.bill_id),
      billStatus,
    };
  });
  const paymentRow = await loadPaymentJoined(result.paymentId);
  const billDetail = await getBillDetail(result.billId);
  const dto = paymentDto(paymentRow);
  return {
    // 兼容 data.payment.* 与 data.status/bankSerial（验收脚本使用后者）
    ...dto,
    payment: dto,
    allocation: {
      id: result.allocationId,
      paymentId: result.paymentId,
      billId: result.billId,
      amount: Number(paymentRow.amount),
    },
    bill: billDetail.bill,
  };
}
