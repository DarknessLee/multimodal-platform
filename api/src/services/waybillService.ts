import { WAYBILL_STATUS_LABELS } from '../config/labels';
import { queryOne, queryRows, txExec, txQuery, txQueryOne, withTransaction } from '../db/pool';
import { ApiError } from '../errors';
import { buildSignTrackPoint } from '../mock/track';
import type { AuthUser, OrderRow, SegmentRow, TrackPointRow, WaybillRow } from '../types';
import { formatDateTime, nowDate } from '../utils/datetime';
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
 * 副作用：运单 SIGNED / 订单 SIGNED / 箱 DELIVERED / 追加 MTO 签收轨迹
 */
export async function signWaybill(waybillId: number, signerName: string, user: AuthUser) {
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
  if (Number(order.shipper_id) !== user.uid) {
    throw new ApiError(40301, '只能签收自己的订单');
  }

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
