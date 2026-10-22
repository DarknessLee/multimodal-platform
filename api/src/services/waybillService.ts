import { WAYBILL_STATUS_LABELS } from '../config/labels';
import { queryOne, queryRows, txExec, txQuery, txQueryOne, withTransaction } from '../db/pool';
import { ApiError } from '../errors';
import { writeAudit } from '../middleware/audit';
import { buildSignTrackPoint } from '../mock/track';
import { emitEvent } from '../platform/eventBus';
import { nextDocNo } from '../platform/sequence';
import { appendWaybillEvent, signAllSegmentWaybills } from '../modules/waybill/events';
import type { AuthUser, OrderRow, SegmentRow, TrackPointRow, WaybillRow } from '../types';
import { formatDateTime, nowDate, todayCompact } from '../utils/datetime';
import { dtoSegment, dtoTrackPoint } from './mappers';

/** GET /api/waybills/:id/track：运单 + 分段 + 全量轨迹（按 occurredAt, seq 升序） */
export async function getWaybillTrack(waybillId: number) {
  const waybill = await queryOne<WaybillRow>('SELECT * FROM waybill WHERE id = ?', [waybillId]);
  if (!waybill) {
    throw new ApiError(40401, '运单不存在');
  }
  const segments = await queryRows<SegmentRow>(
    'SELECT * FROM waybill_segment WHERE waybill_id = ? ORDER BY seq ASC',
    [waybillId],
  );
  const points = await queryRows<TrackPointRow>(
    'SELECT * FROM track_point WHERE waybill_id = ? ORDER BY occurred_at ASC, seq ASC',
    [waybillId],
  );

  return {
    waybill: {
      id: Number(waybill.id),
      waybillNo: waybill.waybill_no,
      status: waybill.status,
      statusLabel: WAYBILL_STATUS_LABELS[waybill.status],
    },
    segments: segments.map(dtoSegment),
    points: points.map(dtoTrackPoint),
  };
}

/**
 * POST /api/waybills/:id/sign（货主签收，事务）
 * 前置：全部分段 COMPLETED 且运单 ARRIVED，否则 40901
 * 副作用：运单 SIGNED / 订单 SIGNED / 箱 DELIVERED / 追加 MTO 签收轨迹；
 *        写审计 + order.signed 事件（电子发票要素 + 通知结算）
 */
export async function signWaybill(
  waybillId: number,
  signerName: string,
  user: AuthUser,
  ip: string | null = null,
) {
  const waybill = await queryOne<WaybillRow>('SELECT * FROM waybill WHERE id = ?', [waybillId]);
  if (!waybill) {
    throw new ApiError(40401, '运单不存在');
  }
  const order = await queryOne<OrderRow>('SELECT * FROM orders WHERE id = ?', [waybill.order_id]);
  if (!order) {
    throw new ApiError(40401, '订单不存在');
  }
  if (user.role !== 'SHIPPER') {
    throw new ApiError(40301, '仅货主可签收');
  }
  const owns = Number(order.shipper_id) === user.uid ||
    (user.role === 'SHIPPER' && user.uid && order.customer_id !== null && Number(order.customer_id) === Number(user.uid));
  if (Number(order.shipper_id) !== user.uid) {
    // v1 报价转单可能由货代创建；货主账号按客户归属放行
    const shipperOwner = await queryOne<{ customer_id: number | null }>(
      'SELECT customer_id FROM user WHERE id = ?',
      [user.uid],
    );
    const customerId = shipperOwner?.customer_id === null || shipperOwner?.customer_id === undefined
      ? null
      : Number(shipperOwner.customer_id);
    if (customerId === null || order.customer_id === null || customerId !== Number(order.customer_id)) {
      throw new ApiError(40301, '只能签收自己的订单');
    }
  }
  void owns;

  return withTransaction(async (conn) => {
    const lockedWaybill = await txQueryOne<WaybillRow>(conn, 'SELECT * FROM waybill WHERE id = ? FOR UPDATE', [
      waybillId,
    ]);
    if (!lockedWaybill) {
      throw new ApiError(40401, '运单不存在');
    }
    const lockedOrder = await txQueryOne<OrderRow>(conn, 'SELECT * FROM orders WHERE id = ? FOR UPDATE', [
      lockedWaybill.order_id,
    ]);
    if (!lockedOrder) {
      throw new ApiError(40401, '订单不存在');
    }
    const segments = await txQuery<SegmentRow>(
      conn,
      'SELECT * FROM waybill_segment WHERE waybill_id = ? ORDER BY seq ASC',
      [waybillId],
    );

    const allCompleted = segments.length > 0 && segments.every((segment) => segment.status === 'COMPLETED');
    if (lockedWaybill.status !== 'ARRIVED' || !allCompleted) {
      throw new ApiError(40901, '运单未到达或分段未全部完成，不能签收');
    }

    const at = formatDateTime(nowDate());
    await txExec(
      conn,
      'UPDATE waybill SET status = ?, signer_name = ?, signed_at = ?, updated_at = ? WHERE id = ?',
      ['SIGNED', signerName, at, at, waybillId],
    );
    await txExec(conn, 'UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', ['SIGNED', at, lockedOrder.id]);
    await txExec(conn, "UPDATE container SET status = 'DELIVERED', updated_at = ? WHERE order_id = ?", [
      at,
      lockedOrder.id,
    ]);

    // 签收轨迹：source=MTO，终点坐标
    const signPoint = buildSignTrackPoint({ segments, signerName, at: nowDate() });
    const maxRow = await txQueryOne<{ maxSeq: number | null }>(
      conn,
      'SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM track_point WHERE waybill_id = ?',
      [waybillId],
    );
    const seq = Number(maxRow?.maxSeq ?? 0) + 1;
    await txExec(
      conn,
      `INSERT INTO track_point (waybill_id, segment_id, seq, node_name, lng, lat, occurred_at, source, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        waybillId,
        signPoint.segmentId,
        seq,
        signPoint.nodeName,
        signPoint.lng,
        signPoint.lat,
        signPoint.occurredAt,
        signPoint.source,
        signPoint.description,
      ],
    );

    const customer = lockedOrder.customer_id
      ? await txQueryOne<{ name: string }>(conn, 'SELECT name FROM customer WHERE id = ?', [lockedOrder.customer_id])
      : null;

    await emitEvent(conn, {
      eventType: 'order.signed',
      aggregateType: 'WAYBILL',
      aggregateId: Number(lockedWaybill.id),
      payload: {
        orderId: Number(lockedOrder.id),
        orderNo: lockedOrder.order_no,
        waybillId: Number(lockedWaybill.id),
        waybillNo: lockedWaybill.waybill_no,
        signerName,
        signedAt: at,
        amount: Number(lockedOrder.total_amount),
        customerId: lockedOrder.customer_id === null ? null : Number(lockedOrder.customer_id),
        customerName: customer?.name ?? '',
      },
    });

    await writeAudit(conn, {
      user,
      action: 'SIGN',
      actionLabel: '运单签收',
      module: 'waybill',
      targetType: 'WAYBILL',
      targetId: Number(lockedWaybill.id),
      detail: {
        waybillNo: lockedWaybill.waybill_no,
        orderId: Number(lockedOrder.id),
        orderNo: lockedOrder.order_no,
        signerName,
      },
      ip,
    });

    // Stage 2：签收事件/存证 + 分段运单同步签收 + 回单占位（待上传）
    await appendWaybillEvent(conn, {
      waybillId: Number(lockedWaybill.id),
      eventType: 'SIGN',
      operatorUserId: user.uid,
      description: '货主签收',
      payload: {
        orderNo: lockedOrder.order_no,
        waybillNo: lockedWaybill.waybill_no,
        signerName,
        signedAt: at,
      },
      occurredAt: at,
    });
    await signAllSegmentWaybills(conn, Number(lockedWaybill.id), signerName, at);

    const existingPod = await txQueryOne<{ id: number }>(
      conn,
      "SELECT id FROM document WHERE doc_type = 'POD' AND biz_type = 'WAYBILL' AND biz_id = ? LIMIT 1",
      [lockedWaybill.id],
    );
    if (!existingPod) {
      const docNo = await nextDocNo(conn, {
        table: 'document',
        column: 'doc_no',
        prefix: `DOC${todayCompact()}`,
        width: 5,
      });
      await txExec(
        conn,
        `INSERT INTO document (doc_no, doc_type, biz_type, biz_id, file_name, mime_type, file_path, file_size,
           ocr_status, sign_status, created_by, created_at, updated_at)
         VALUES (?, 'POD', 'WAYBILL', ?, ?, 'text/plain', NULL, 0, 'NONE', 'UNSIGNED', ?, ?, ?)`,
        [
          docNo,
          lockedWaybill.id,
          `${lockedWaybill.waybill_no}-签收回单.txt`,
          user.uid,
          at,
          at,
        ],
      );
    }

    return {
      waybill: {
        id: Number(lockedWaybill.id),
        waybillNo: lockedWaybill.waybill_no,
        status: 'SIGNED' as const,
        statusLabel: WAYBILL_STATUS_LABELS.SIGNED,
        signerName,
        signedAt: at,
        createdAt: lockedWaybill.created_at,
      },
      order: {
        id: Number(lockedOrder.id),
        status: 'SIGNED' as const,
        statusLabel: '已签收',
      },
    };
  });
}
