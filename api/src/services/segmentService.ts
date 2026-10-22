import { segmentStatusLabel } from '../config/labels';
import { txExec, txQuery, txQueryOne, withTransaction } from '../db/pool';
import { ApiError } from '../errors';
import { buildActionTrackPoints } from '../mock/track';
import type {
  AuthUser,
  ContainerRow,
  OrderRow,
  SegmentAction,
  SegmentDto,
  SegmentRow,
  SegmentStatus,
  TrackPointDto,
  WaybillRow,
} from '../types';
import { formatDateTime, nowDate } from '../utils/datetime';
import { dtoContainer, dtoSegment } from './mappers';

interface ActionRule {
  from: SegmentStatus;
  to: SegmentStatus;
  label: string;
}

const RULES: Record<SegmentAction, ActionRule> = {
  ACCEPT: { from: 'PENDING', to: 'ACCEPTED', label: '接单' },
  DEPART: { from: 'ACCEPTED', to: 'IN_TRANSIT', label: '提货出发' },
  GATE_IN: { from: 'PENDING', to: 'IN_TRANSIT', label: '进场确认' },
  ARRIVE: { from: 'IN_TRANSIT', to: 'COMPLETED', label: '到达确认' },
};

/** 权限矩阵（契约第 2 节）：承运人只碰自己的公路段；港站只碰海运/铁路段 */
function assertActionPermission(segment: SegmentRow, action: SegmentAction, user: AuthUser): void {
  const isRoad = segment.mode === 'ROAD';

  if (action === 'ACCEPT' || action === 'DEPART') {
    if (user.role !== 'CARRIER') {
      throw new ApiError(40301, '仅公路承运人可执行该操作');
    }
    if (!isRoad || Number(segment.carrier_user_id) !== user.uid) {
      throw new ApiError(40301, '无权操作该分段');
    }
    return;
  }

  if (action === 'GATE_IN') {
    if (user.role !== 'TERMINAL' || isRoad) {
      throw new ApiError(40301, '仅港站操作员可对海运/铁路段执行该操作');
    }
    return;
  }

  // ARRIVE：公路段归承运人，海运/铁路段归港站
  if (isRoad) {
    if (user.role !== 'CARRIER' || Number(segment.carrier_user_id) !== user.uid) {
      throw new ApiError(40301, '无权操作该分段');
    }
    return;
  }
  if (user.role !== 'TERMINAL') {
    throw new ApiError(40301, '仅港站操作员可对该分段执行该操作');
  }
}

interface SegmentUpdateResult {
  segment: SegmentDto;
  orderStatus: string;
  waybillStatus: string;
  containers: ReturnType<typeof dtoContainer>[];
  newTrackPoints: TrackPointDto[];
}

/**
 * POST /api/segments/:id/status：节点上报/推进（事务）
 * - 状态机 + 禁止跨段推进（40901）
 * - 每次动作追加 1~3 个 track_point，seq 按运单全局递增
 * - 订单/运单/箱状态联动（契约第 2、4.6 节）
 */
export async function updateSegmentStatus(
  segmentId: number,
  action: SegmentAction,
  conditionText: string | undefined,
  user: AuthUser,
): Promise<SegmentUpdateResult> {
  return withTransaction(async (conn) => {
    const segment = await txQueryOne<SegmentRow>(
      conn,
      'SELECT * FROM waybill_segment WHERE id = ? FOR UPDATE',
      [segmentId],
    );
    if (!segment) {
      throw new ApiError(40401, '分段不存在');
    }

    assertActionPermission(segment, action, user);

    const rule = RULES[action];
    if (segment.status !== rule.from) {
      throw new ApiError(
        40901,
        `当前分段状态（${segmentStatusLabel(segment.mode, segment.status)}）不允许执行${rule.label}操作`,
      );
    }

    // 禁止跨段推进：第 n 段 GATE_IN 前，第 n-1 段必须 COMPLETED
    if (action === 'GATE_IN' && Number(segment.seq) > 1) {
      const previous = await txQueryOne<SegmentRow>(
        conn,
        'SELECT * FROM waybill_segment WHERE waybill_id = ? AND seq = ?',
        [segment.waybill_id, Number(segment.seq) - 1],
      );
      if (!previous || previous.status !== 'COMPLETED') {
        throw new ApiError(40901, '上一段未完成，禁止跨段推进');
      }
    }

    const waybill = await txQueryOne<WaybillRow>(conn, 'SELECT * FROM waybill WHERE id = ? FOR UPDATE', [
      segment.waybill_id,
    ]);
    if (!waybill) {
      throw new ApiError(40401, '运单不存在');
    }
    const order = await txQueryOne<OrderRow>(conn, 'SELECT * FROM orders WHERE id = ? FOR UPDATE', [waybill.order_id]);
    if (!order) {
      throw new ApiError(40401, '订单不存在');
    }

    const now = nowDate();
    const at = formatDateTime(now);

    const setClauses: string[] = ['status = ?', 'updated_at = ?'];
    const updateParams: unknown[] = [rule.to, at];
    if (action === 'ACCEPT') {
      setClauses.push('accepted_at = ?');
      updateParams.push(at);
    }
    if (action === 'DEPART' || action === 'GATE_IN') {
      setClauses.push('actual_start = ?');
      updateParams.push(at);
    }
    if (action === 'ARRIVE') {
      setClauses.push('actual_end = ?');
      updateParams.push(at);
    }
    updateParams.push(segmentId);
    await txExec(conn, `UPDATE waybill_segment SET ${setClauses.join(', ')} WHERE id = ?`, updateParams);

    // 轨迹点：运单内 seq 全局递增
    const maxRow = await txQueryOne<{ maxSeq: number | null }>(
      conn,
      'SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM track_point WHERE waybill_id = ?',
      [segment.waybill_id],
    );
    let seq = Number(maxRow?.maxSeq ?? 0);
    const drafts = buildActionTrackPoints({ segment, action, at: now });
    const newTrackPoints: TrackPointDto[] = [];
    for (const draft of drafts) {
      seq += 1;
      const inserted = await txExec(
        conn,
        `INSERT INTO track_point (waybill_id, segment_id, seq, node_name, lng, lat, occurred_at, source, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          segment.waybill_id,
          draft.segmentId,
          seq,
          draft.nodeName,
          draft.lng,
          draft.lat,
          draft.occurredAt,
          draft.source,
          draft.description,
        ],
      );
      newTrackPoints.push({
        id: Number(inserted.insertId),
        seq,
        segmentId: draft.segmentId,
        nodeName: draft.nodeName,
        lng: draft.lng,
        lat: draft.lat,
        occurredAt: draft.occurredAt,
        source: draft.source,
        description: draft.description,
      });
    }

    // 订单 / 运单状态联动
    let orderStatus = order.status;
    let waybillStatus = waybill.status;

    if (action === 'DEPART' || action === 'GATE_IN') {
      if (orderStatus === 'DISPATCHED') {
        await txExec(conn, 'UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', ['IN_TRANSIT', at, order.id]);
        orderStatus = 'IN_TRANSIT';
      }
      if (waybillStatus === 'PENDING') {
        await txExec(conn, 'UPDATE waybill SET status = ?, updated_at = ? WHERE id = ?', ['IN_TRANSIT', at, waybill.id]);
        waybillStatus = 'IN_TRANSIT';
      }
    }

    if (action === 'ARRIVE' && segment.mode === 'RAIL') {
      await txExec(conn, 'UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', ['ARRIVED', at, order.id]);
      await txExec(conn, 'UPDATE waybill SET status = ?, updated_at = ? WHERE id = ?', ['ARRIVED', at, waybill.id]);
      orderStatus = 'ARRIVED';
      waybillStatus = 'ARRIVED';
    }

    // 箱状态联动：GATE_IN 可录箱况（EMPTY→GATE_IN）；海运到港 ARRIVED
    if (action === 'GATE_IN') {
      if (conditionText !== undefined && conditionText !== '') {
        await txExec(conn, 'UPDATE container SET condition_text = ?, updated_at = ? WHERE order_id = ?', [
          conditionText,
          at,
          order.id,
        ]);
      }
      await txExec(
        conn,
        "UPDATE container SET status = 'GATE_IN', updated_at = ? WHERE order_id = ? AND status = 'EMPTY'",
        [at, order.id],
      );
    }
    if (action === 'ARRIVE' && segment.mode === 'SEA') {
      await txExec(
        conn,
        "UPDATE container SET status = 'ARRIVED', updated_at = ? WHERE order_id = ? AND status IN ('GATE_IN', 'LOADED', 'IN_TRANSIT')",
        [at, order.id],
      );
    }

    const updatedSegment = await txQueryOne<SegmentRow>(
      conn,
      'SELECT * FROM waybill_segment WHERE id = ?',
      [segmentId],
    );
    const containers = await txQuery<ContainerRow>(
      conn,
      'SELECT * FROM container WHERE order_id = ? ORDER BY id ASC',
      [order.id],
    );

    return {
      segment: dtoSegment(updatedSegment ?? segment),
      orderStatus,
      waybillStatus,
      containers: containers.map(dtoContainer),
      newTrackPoints,
    };
  });
}
