import { MODE_LABELS, ORDER_STATUS_LABELS } from '../config/labels';
import { queryOne, txExec, txQuery, txQueryOne, withTransaction } from '../db/pool';
import { ApiError } from '../errors';
import type {
  BillBreakdownItem,
  BillRow,
  OrderRow,
  OrderStatus,
  SegmentRow,
  WaybillRow,
} from '../types';
import { formatDateTime, nowDate, todayCompact } from '../utils/datetime';
import { dtoBillHeader } from './mappers';
import { nextDailyNo } from './sequence';

interface BillJoinedRow extends BillRow {
  order_no: string;
  order_status: OrderStatus;
  order_origin: string;
  order_destination: string;
  waybill_no: string;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseBreakdown(value: unknown): BillBreakdownItem[] {
  if (Array.isArray(value)) {
    return value as BillBreakdownItem[];
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as BillBreakdownItem[]) : [];
  }
  return [];
}

/**
 * POST /api/orders/:id/settle（结算出账，事务）
 * 前置：order.status = SIGNED 且无账单，否则 40901
 * 副作用：生成 bill（bill_no = BL + yyyyMMdd + 3 位；total = Σ cost_amount）并置订单 BILLED
 */
export async function settleOrder(orderId: number) {
  const billId = await withTransaction(async (conn) => {
    const order = await txQueryOne<OrderRow>(conn, 'SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (!order) {
      throw new ApiError(40401, '订单不存在');
    }
    if (order.status !== 'SIGNED') {
      throw new ApiError(40901, '订单未签收，不能出账');
    }
    const existingBill = await txQueryOne<BillRow>(conn, 'SELECT * FROM bill WHERE order_id = ? LIMIT 1', [orderId]);
    if (existingBill) {
      throw new ApiError(40901, '该订单已出账');
    }

    const waybill = await txQueryOne<WaybillRow>(
      conn,
      'SELECT * FROM waybill WHERE order_id = ? ORDER BY id ASC LIMIT 1',
      [orderId],
    );
    if (!waybill) {
      throw new ApiError(40901, '订单缺少运单，不能出账');
    }

    const segments = await txQuery<SegmentRow>(
      conn,
      'SELECT * FROM waybill_segment WHERE waybill_id = ? ORDER BY seq ASC',
      [waybill.id],
    );
    const breakdown: BillBreakdownItem[] = segments.map((segment) => ({
      segmentId: Number(segment.id),
      seq: Number(segment.seq),
      mode: segment.mode,
      modeLabel: MODE_LABELS[segment.mode],
      carrierName: segment.carrier_name,
      startNode: segment.start_node,
      endNode: segment.end_node,
      amount: Number(segment.cost_amount),
    }));
    const totalAmount = round2(breakdown.reduce((sum, item) => sum + item.amount, 0));

    const billNo = await nextDailyNo(conn, 'bill', 'bill_no', `BL${todayCompact()}`, 3);
    const at = formatDateTime(nowDate());
    const inserted = await txExec(
      conn,
      `INSERT INTO bill (bill_no, order_id, waybill_id, total_amount, status, segment_breakdown, issued_at)
       VALUES (?, ?, ?, ?, 'ISSUED', ?, ?)`,
      [billNo, orderId, waybill.id, totalAmount, JSON.stringify(breakdown), at],
    );

    await txExec(conn, 'UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', ['BILLED', at, orderId]);

    return Number(inserted.insertId);
  });

  return getBillDetail(billId);
}

/** GET /api/bills/:id：分段账单（账单头 + 订单/运单摘要 + breakdown） */
export async function getBillDetail(billId: number) {
  const bill = await queryOne<BillJoinedRow>(
    `SELECT b.*, o.order_no, o.status AS order_status, o.origin AS order_origin,
            o.destination AS order_destination, w.waybill_no
       FROM bill b
       JOIN orders o ON o.id = b.order_id
       JOIN waybill w ON w.id = b.waybill_id
      WHERE b.id = ?`,
    [billId],
  );
  if (!bill) {
    throw new ApiError(40401, '账单不存在');
  }

  return {
    bill: dtoBillHeader(bill),
    order: {
      id: Number(bill.order_id),
      orderNo: bill.order_no,
      origin: bill.order_origin,
      destination: bill.order_destination,
      status: bill.order_status,
      statusLabel: ORDER_STATUS_LABELS[bill.order_status],
    },
    waybill: {
      id: Number(bill.waybill_id),
      waybillNo: bill.waybill_no,
    },
    breakdown: parseBreakdown(bill.segment_breakdown),
  };
}
