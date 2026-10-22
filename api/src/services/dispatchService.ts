import { txExec, txQuery, txQueryOne, withTransaction } from '../db/pool';
import { ApiError } from '../errors';
import { ROAD_PLANNED_END_HOURS, ROAD_PLANNED_START_HOURS, SEA_SEGMENT, RAIL_SEGMENT, findRoadCarrier } from '../mock/carriers';
import { routeEndNode, routeStartNode } from '../mock/routes';
import type { OrderRow, SegmentRow, SegmentMode } from '../types';
import { addHours, formatDateTime, nowDate, todayCompact } from '../utils/datetime';
import { dtoSegment } from './mappers';
import { nextDailyNo } from './sequence';

interface NewSegmentPlan {
  seq: number;
  mode: SegmentMode;
  carrierCode: string;
  carrierName: string;
  carrierUserId: number | null;
  startNode: string;
  endNode: string;
  plannedStart: string;
  plannedEnd: string;
  costAmount: number;
}

/**
 * POST /api/orders/:id/dispatch（MTO）
 * 单事务：创建运单 + 3 个分段（公路/海运/铁路），订单 → DISPATCHED
 */
export async function dispatchOrder(orderId: number, roadCarrierCode: string) {
  const roadCarrier = findRoadCarrier(roadCarrierCode);
  if (!roadCarrier) {
    throw new ApiError(40001, '公路承运商不存在');
  }

  return withTransaction(async (conn) => {
    const order = await txQueryOne<OrderRow>(conn, 'SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (!order) {
      throw new ApiError(40401, '订单不存在');
    }
    if (order.status !== 'CREATED') {
      throw new ApiError(40901, '当前订单状态不允许调度');
    }

    // 演示版只有 1 个公路承运人账号（carrier01），任意所选承运商都指派给它
    const carrierUser = await txQueryOne<{ id: number }>(
      conn,
      "SELECT id FROM user WHERE role = 'CARRIER' ORDER BY id ASC LIMIT 1",
    );

    const at = formatDateTime(nowDate());
    const base = nowDate();
    const waybillNo = await nextDailyNo(conn, 'waybill', 'waybill_no', `WB${todayCompact()}`, 3);
    const waybillResult = await txExec(
      conn,
      `INSERT INTO waybill (waybill_no, order_id, status, created_at, updated_at)
       VALUES (?, ?, 'PENDING', ?, ?)`,
      [waybillNo, orderId, at, at],
    );
    const waybillId = Number(waybillResult.insertId);

    const plans: NewSegmentPlan[] = [
      {
        seq: 1,
        mode: 'ROAD',
        carrierCode: roadCarrier.code,
        carrierName: roadCarrier.name,
        carrierUserId: carrierUser ? Number(carrierUser.id) : null,
        startNode: routeStartNode('ROAD').name,
        endNode: routeEndNode('ROAD').name,
        plannedStart: addHours(base, ROAD_PLANNED_START_HOURS),
        plannedEnd: addHours(base, ROAD_PLANNED_END_HOURS),
        costAmount: roadCarrier.price,
      },
      {
        seq: SEA_SEGMENT.seq,
        mode: SEA_SEGMENT.mode,
        carrierCode: SEA_SEGMENT.carrierCode,
        carrierName: SEA_SEGMENT.carrierName,
        carrierUserId: null,
        startNode: SEA_SEGMENT.startNode,
        endNode: SEA_SEGMENT.endNode,
        plannedStart: addHours(base, SEA_SEGMENT.plannedStartHours),
        plannedEnd: addHours(base, SEA_SEGMENT.plannedEndHours),
        costAmount: SEA_SEGMENT.costAmount,
      },
      {
        seq: RAIL_SEGMENT.seq,
        mode: RAIL_SEGMENT.mode,
        carrierCode: RAIL_SEGMENT.carrierCode,
        carrierName: RAIL_SEGMENT.carrierName,
        carrierUserId: null,
        startNode: RAIL_SEGMENT.startNode,
        endNode: RAIL_SEGMENT.endNode,
        plannedStart: addHours(base, RAIL_SEGMENT.plannedStartHours),
        plannedEnd: addHours(base, RAIL_SEGMENT.plannedEndHours),
        costAmount: RAIL_SEGMENT.costAmount,
      },
    ];

    for (const plan of plans) {
      await txExec(
        conn,
        `INSERT INTO waybill_segment (waybill_id, seq, mode, carrier_code, carrier_name, carrier_user_id,
           start_node, end_node, planned_start, planned_end, status, cost_amount, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
        [
          waybillId,
          plan.seq,
          plan.mode,
          plan.carrierCode,
          plan.carrierName,
          plan.carrierUserId,
          plan.startNode,
          plan.endNode,
          plan.plannedStart,
          plan.plannedEnd,
          plan.costAmount,
          at,
          at,
        ],
      );
    }

    await txExec(conn, 'UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', ['DISPATCHED', at, orderId]);

    const segments = await txQuery<SegmentRow>(
      conn,
      'SELECT * FROM waybill_segment WHERE waybill_id = ? ORDER BY seq ASC',
      [waybillId],
    );

    return {
      orderId: Number(orderId),
      waybillId,
      waybillNo,
      segments: segments.map(dtoSegment),
    };
  });
}
