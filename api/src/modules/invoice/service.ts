// 电子发票（Mock 税务）：按应收账单开票 / 作废，写 TAX 集成报文
import {
  BILL_TYPE_LABELS,
  INVOICE_STATUS_LABELS,
  INVOICE_TYPE_LABELS,
} from '../../config/labels';
import { queryOne, queryRows, txExec, txQueryOne, withTransaction } from '../../db/pool';
import { ApiError } from '../../errors';
import { writeAudit } from '../../middleware/audit';
import { insertIntegrationMessage } from '../../platform/edi';
import { emitEvent } from '../../platform/eventBus';
import { nextDocNo } from '../../platform/sequence';
import type { AuthUser, BillRow, InvoiceRow, InvoiceStatus, InvoiceType } from '../../types';
import { formatDateTime, nowDate, todayCompact } from '../../utils/datetime';
import { round2 } from '../../utils/json';
import { optionalString, pageResult, parsePage } from '../shared/pagination';

const TAX_RATE = 9;
const SELLER_NAME = '中远海联运 MTO';
const SELLER_TAX_NO = '91310000MA1FL00001';

export function invoiceDto(row: InvoiceRow, billNo: string | null = null) {
  return {
    id: Number(row.id),
    invoiceNo: row.invoice_no,
    invoiceType: row.invoice_type,
    invoiceTypeLabel: INVOICE_TYPE_LABELS[row.invoice_type as InvoiceType],
    billId: Number(row.bill_id),
    billNo,
    orderId: row.order_id === null ? null : Number(row.order_id),
    buyerName: row.buyer_name,
    buyerTaxNo: row.buyer_tax_no,
    sellerName: row.seller_name,
    sellerTaxNo: row.seller_tax_no,
    amount: Number(row.amount),
    taxRate: Number(row.tax_rate),
    taxAmount: Number(row.tax_amount),
    totalAmount: Number(row.total_amount),
    status: row.status,
    statusLabel: INVOICE_STATUS_LABELS[row.status as InvoiceStatus],
    issuedAt: row.issued_at,
    voidedAt: row.voided_at,
    createdAt: row.created_at,
  };
}

const INVOICE_JOINED_SELECT = `
  SELECT i.*, b.bill_no, b.bill_type
    FROM invoice i JOIN bill b ON b.id = i.bill_id`;

interface InvoiceJoinedRow extends InvoiceRow {
  bill_no: string;
  bill_type: string;
}

/** GET /api/invoices */
export async function listInvoices(query: Record<string, unknown>) {
  const pager = parsePage(query, 10, 100);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const status = optionalString(query.status);
  const billId = optionalString(query.billId);
  if (status) {
    conditions.push('i.status = ?');
    params.push(status);
  }
  if (billId) {
    conditions.push('i.bill_id = ?');
    params.push(Number(billId));
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM invoice i ${where}`,
    params,
  );
  const rows = await queryRows<InvoiceJoinedRow>(
    `${INVOICE_JOINED_SELECT} ${where} ORDER BY i.created_at DESC, i.id DESC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  return pageResult(
    rows.map((row) => ({ ...invoiceDto(row, row.bill_no), billType: row.bill_type })),
    Number(totalRow?.total ?? 0),
    pager,
  );
}

/** GET /api/invoices/:id */
export async function getInvoiceDetail(id: number) {
  const row = await queryOne<InvoiceJoinedRow>(`${INVOICE_JOINED_SELECT} WHERE i.id = ?`, [id]);
  if (!row) {
    throw new ApiError(40401, '发票不存在');
  }
  const dto = { ...invoiceDto(row, row.bill_no), billType: row.bill_type };
  return {
    // 兼容 data.invoice.* 与 data.status/invoiceNo（验收脚本使用后者）
    ...dto,
    invoice: dto,
    billId: Number(row.bill_id),
    bill: { id: Number(row.bill_id), billNo: row.bill_no },
  };
}

export interface CreateInvoiceInput {
  billId: number;
  invoiceType?: InvoiceType;
  title?: string;
  taxNo?: string;
}

/** POST /api/invoices：仅应收未开票账单可开票 */
export async function createInvoice(input: CreateInvoiceInput, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const bill = await txQueryOne<BillRow>(conn, 'SELECT * FROM bill WHERE id = ? FOR UPDATE', [input.billId]);
    if (!bill) {
      throw new ApiError(40401, '账单不存在');
    }
    if (bill.bill_type !== 'RECEIVABLE') {
      throw new ApiError(42201, '仅应收账单可开具发票');
    }
    const existing = await txQueryOne<InvoiceRow>(
      conn,
      "SELECT * FROM invoice WHERE bill_id = ? AND status <> 'VOID' ORDER BY id DESC LIMIT 1",
      [input.billId],
    );
    if (existing) {
      throw new ApiError(40902, '该账单已开票，请勿重复操作');
    }
    const buyer = bill.counterparty_id
      ? await txQueryOne<{ name: string; credit_code: string }>(
          conn,
          'SELECT name, credit_code FROM customer WHERE id = ?',
          [bill.counterparty_id],
        )
      : null;
    const amount = Number(bill.total_amount);
    const taxAmount = round2((amount * TAX_RATE) / (100 + TAX_RATE));
    const invoiceNo = await nextDocNo(conn, {
      table: 'invoice',
      column: 'invoice_no',
      prefix: `FP${todayCompact()}`,
      width: 4,
    });
    const at = formatDateTime(nowDate());
    const inserted = await txExec(
      conn,
      `INSERT INTO invoice (invoice_no, invoice_type, bill_id, order_id, buyer_name, buyer_tax_no,
         seller_name, seller_tax_no, amount, tax_rate, tax_amount, total_amount, status, issued_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ISSUED', ?, ?)`,
      [
        invoiceNo,
        input.invoiceType ?? 'VAT_SPECIAL',
        input.billId,
        bill.order_id,
        input.title ?? buyer?.name ?? '客户',
        input.taxNo ?? buyer?.credit_code ?? null,
        SELLER_NAME,
        SELLER_TAX_NO,
        amount,
        TAX_RATE,
        taxAmount,
        amount,
        at,
        user.uid,
      ],
    );
    const invoiceId = Number(inserted.insertId);

    await insertIntegrationMessage(conn, {
      systemCode: 'TAX',
      systemName: '税务电子发票',
      direction: 'OUT',
      msgType: 'TAX_INVOICE_ISSUE',
      standard: '电子发票要素',
      relatedType: 'INVOICE',
      relatedId: invoiceId,
      payload: {
        invoiceNo,
        invoiceType: input.invoiceType ?? 'VAT_SPECIAL',
        billNo: (await txQueryOne<{ bill_no: string }>(conn, 'SELECT bill_no FROM bill WHERE id = ?', [input.billId]))
          ?.bill_no,
        buyerName: input.title ?? buyer?.name ?? '客户',
        buyerTaxNo: input.taxNo ?? buyer?.credit_code ?? null,
        sellerName: SELLER_NAME,
        sellerTaxNo: SELLER_TAX_NO,
        amount,
        taxRate: TAX_RATE,
        taxAmount,
        totalAmount: amount,
        issuedAt: at,
      },
    });
    await emitEvent(conn, {
      eventType: 'invoice.issued',
      aggregateType: 'INVOICE',
      aggregateId: invoiceId,
      payload: { invoiceId, invoiceNo, billId: input.billId, amount, taxAmount, issuedAt: at },
    });
    await writeAudit(conn, {
      user,
      action: 'INVOICE_ISSUE',
      actionLabel: '开具发票',
      module: 'invoice',
      targetType: 'INVOICE',
      targetId: invoiceId,
      detail: { invoiceNo, billId: input.billId, amount, taxAmount },
      ip,
    });
    const row = await txQueryOne<InvoiceJoinedRow>(conn, `${INVOICE_JOINED_SELECT} WHERE i.id = ?`, [invoiceId]);
    if (!row) {
      throw new ApiError(50000, '发票创建后读取失败');
    }
    const dto = { ...invoiceDto(row, row.bill_no), billType: row.bill_type };
    return { ...dto, invoice: dto };
  });
}

/** POST /api/invoices/:id/void：ISSUED -> VOID（已支付账单禁止作废） */
export async function voidInvoice(id: number, user: AuthUser, ip: string | null) {
  await withTransaction(async (conn) => {
    const invoice = await txQueryOne<InvoiceRow>(conn, 'SELECT * FROM invoice WHERE id = ? FOR UPDATE', [id]);
    if (!invoice) {
      throw new ApiError(40401, '发票不存在');
    }
    if (invoice.status === 'VOID') {
      throw new ApiError(40902, '发票已作废，请勿重复操作');
    }
    if (invoice.status !== 'ISSUED') {
      throw new ApiError(40901, '当前发票状态不允许作废');
    }
    const bill = await txQueryOne<BillRow>(conn, 'SELECT * FROM bill WHERE id = ?', [invoice.bill_id]);
    if (bill && bill.status === 'PAID') {
      throw new ApiError(42201, '账单已支付，不能作废发票');
    }
    const at = formatDateTime(nowDate());
    await txExec(conn, "UPDATE invoice SET status = 'VOID', voided_at = ? WHERE id = ?", [at, id]);
    await insertIntegrationMessage(conn, {
      systemCode: 'TAX',
      systemName: '税务电子发票',
      direction: 'OUT',
      msgType: 'TAX_INVOICE_VOID',
      standard: '电子发票要素',
      relatedType: 'INVOICE',
      relatedId: id,
      payload: { invoiceNo: invoice.invoice_no, billNo: bill?.bill_no ?? null, voidedAt: at, reason: '作废重开' },
    });
    await emitEvent(conn, {
      eventType: 'invoice.voided',
      aggregateType: 'INVOICE',
      aggregateId: id,
      payload: { invoiceId: id, invoiceNo: invoice.invoice_no, voidedAt: at },
    });
    await writeAudit(conn, {
      user,
      action: 'INVOICE_VOID',
      actionLabel: '作废发票',
      module: 'invoice',
      targetType: 'INVOICE',
      targetId: id,
      detail: { invoiceNo: invoice.invoice_no, billId: Number(invoice.bill_id) },
      ip,
    });
    return id;
  });
  return getInvoiceDetail(id);
}

export { BILL_TYPE_LABELS };
