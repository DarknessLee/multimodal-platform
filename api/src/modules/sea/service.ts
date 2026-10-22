// 水路工作台（Mock 港口 EDI）：任务列表、订舱、订舱确认回执
import { queryOne, queryRows, txExec, txQueryOne, withTransaction } from '../../db/pool';
import { ApiError } from '../../errors';
import { writeAudit } from '../../middleware/audit';
import { insertIntegrationMessage } from '../../platform/edi';
import type { AuthUser, IntegrationMessageRow, OrderRow, SegmentRow, WaybillRow } from '../../types';
import { formatDateTime, nowDate, todayDateString } from '../../utils/datetime';
import { parseJson, round2 } from '../../utils/json';
import { appendWaybillEvent } from '../waybill/events';

interface SeaTaskRow {
  waybill_id: number;
  waybill_no: string;
  order_id: number;
  order_no: string;
  cargo_name: string;
  container_type: string;
  order_container_count: number;
  start_node: string;
  end_node: string;
  seg_status: string;
  linked_count: number;
}

const SEA_DEMAND_LABELS: Record<string, string> = {
  NOT_BOOKED: '未订舱',
  BOOKED: '已订舱待确认',
  CONFIRMED: '已确认舱位',
  FAILED: '订舱失败',
};

/** GET /api/sea/tasks */
export async function listSeaTasks(_user: AuthUser) {
  const rows = await queryRows<SeaTaskRow>(
    `SELECT w.id AS waybill_id, w.waybill_no, o.id AS order_id, o.order_no, o.cargo_name, o.container_type,
            o.container_count AS order_container_count, seg.start_node, seg.end_node, seg.status AS seg_status,
            (SELECT COUNT(*) FROM waybill_container wc WHERE wc.waybill_id = w.id) AS linked_count
       FROM waybill w
       JOIN orders o ON o.id = w.order_id
       JOIN waybill_segment seg ON seg.waybill_id = w.id AND seg.mode = 'SEA'
      WHERE w.waybill_type = 'MASTER'
      ORDER BY w.created_at DESC, w.id DESC`,
  );
  const ids = rows.map((row) => String(row.waybill_id));
  const messages = ids.length
    ? await queryRows<{ id: number; related_id: string | null; msg_type: string; status: string; created_at: string }>(
        `SELECT id, related_id, msg_type, status, created_at FROM integration_message
          WHERE system_code = 'PORT_EDI' AND related_type = 'WAYBILL' AND related_id IN (?)
            AND msg_type IN ('SEA_BOOKING', 'SEA_BOOKING_CONFIRM')
          ORDER BY created_at ASC, id ASC`,
        [ids],
      )
    : [];
  const msgByWaybill = new Map<string, typeof messages>();
  for (const message of messages) {
    const key = String(message.related_id);
    if (!msgByWaybill.has(key)) msgByWaybill.set(key, []);
    msgByWaybill.get(key)?.push(message);
  }
  const nodeCodes = new Map(
    (await queryRows<{ node_name: string; node_code: string }>('SELECT node_name, node_code FROM port_station')).map(
      (row) => [row.node_name, row.node_code],
    ),
  );

  return rows.map((row) => {
    const list = msgByWaybill.get(String(row.waybill_id)) ?? [];
    const bookings = list.filter((message) => message.msg_type === 'SEA_BOOKING');
    const confirms = list.filter((message) => message.msg_type === 'SEA_BOOKING_CONFIRM');
    let bookingStatus = 'NOT_BOOKED';
    if (confirms.some((message) => message.status === 'SUCCESS')) bookingStatus = 'CONFIRMED';
    else if (bookings.some((message) => message.status === 'PENDING')) bookingStatus = 'BOOKED';
    else if (bookings.some((message) => message.status === 'SUCCESS')) bookingStatus = 'BOOKED';
    else if (bookings.some((message) => message.status === 'FAILED')) bookingStatus = 'FAILED';
    return {
      waybillId: Number(row.waybill_id),
      waybillNo: row.waybill_no,
      orderId: Number(row.order_id),
      orderNo: row.order_no,
      fromPort: nodeCodes.get(row.start_node) ?? row.start_node,
      toPort: nodeCodes.get(row.end_node) ?? row.end_node,
      containerCount: Number(row.linked_count) > 0 ? Number(row.linked_count) : Number(row.order_container_count),
      segmentStatus: row.seg_status,
      bookingStatus,
      bookingStatusLabel: SEA_DEMAND_LABELS[bookingStatus],
      lastMessageAt: list.length > 0 ? list[list.length - 1].created_at : null,
    };
  });
}

/** POST /api/sea/tasks/:waybillId/book：订舱（PORT_EDI SEA_BOOKING） */
export async function bookSeaTask(waybillId: number, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const waybill = await txQueryOne<WaybillRow>(conn, 'SELECT * FROM waybill WHERE id = ? FOR UPDATE', [
      waybillId,
    ]);
    if (!waybill) {
      throw new ApiError(40401, '运单不存在');
    }
    if (waybill.waybill_type !== 'MASTER') {
      throw new ApiError(42201, '仅主运单可订舱');
    }
    const segment = await txQueryOne<SegmentRow>(
      conn,
      "SELECT * FROM waybill_segment WHERE waybill_id = ? AND mode = 'SEA' ORDER BY seq ASC LIMIT 1",
      [waybillId],
    );
    if (!segment) {
      throw new ApiError(42201, '该运单没有海运分段');
    }
    const existing = await txQueryOne<{ id: number; status: string }>(
      conn,
      `SELECT id, status FROM integration_message
        WHERE system_code = 'PORT_EDI' AND msg_type = 'SEA_BOOKING'
          AND related_type = 'WAYBILL' AND related_id = ?
        ORDER BY id DESC LIMIT 1`,
      [String(waybillId)],
    );
    if (existing && existing.status !== 'FAILED') {
      throw new ApiError(40902, '该运单已订舱，请勿重复操作');
    }
    const order = await txQueryOne<OrderRow>(conn, 'SELECT * FROM orders WHERE id = ?', [waybill.order_id]);
    const containers = await txQueryOne<{ total: number }>(
      conn,
      'SELECT COUNT(*) AS total FROM waybill_container WHERE waybill_id = ?',
      [waybillId],
    );
    const fromNode = await txQueryOne<{ node_code: string }>(
      conn,
      'SELECT node_code FROM port_station WHERE node_name = ? LIMIT 1',
      [segment.start_node],
    );
    const toNode = await txQueryOne<{ node_code: string }>(
      conn,
      'SELECT node_code FROM port_station WHERE node_name = ? LIMIT 1',
      [segment.end_node],
    );
    const containerCount = Number(containers?.total ?? 0) || Number(order?.container_count ?? 1);
    const message = await insertIntegrationMessage(conn, {
      systemCode: 'PORT_EDI',
      systemName: '港口 EDI',
      direction: 'OUT',
      msgType: 'SEA_BOOKING',
      standard: 'UN/EDIFACT 语义',
      relatedType: 'WAYBILL',
      relatedId: waybillId,
      status: 'PENDING',
      payload: {
        bookingNo: `BK-${waybillId}`,
        waybillNo: waybill.waybill_no,
        orderNo: order?.order_no ?? '',
        fromPort: fromNode?.node_code ?? segment.start_node,
        toPort: toNode?.node_code ?? segment.end_node,
        containerType: order?.container_type ?? '40HQ',
        containerCount,
        cargoName: order?.cargo_name ?? '',
        departureDate: order?.required_pickup_date ?? todayDateString(),
        vessel: 'COSCO SHIPPING',
        voyage: '2026E',
        status: '待确认',
      },
    });
    await writeAudit(conn, {
      user,
      action: 'SEA_BOOK',
      actionLabel: '水路订舱',
      module: 'sea',
      targetType: 'WAYBILL',
      targetId: waybillId,
      detail: { waybillNo: waybill.waybill_no, msgNo: message.msgNo, containerCount },
      ip,
    });
    return { messageId: message.id, msgNo: message.msgNo, status: message.status };
  });
}

/** POST /api/sea/bookings/:messageId/confirm：订舱确认回执（Mock） */
export async function confirmSeaBooking(messageId: number, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const message = await txQueryOne<IntegrationMessageRow>(
      conn,
      'SELECT * FROM integration_message WHERE id = ? FOR UPDATE',
      [messageId],
    );
    if (!message) {
      throw new ApiError(40401, '报文不存在');
    }
    if (message.msg_type !== 'SEA_BOOKING' || message.system_code !== 'PORT_EDI') {
      throw new ApiError(42201, '该报文不是订舱报文');
    }
    if (message.status !== 'PENDING') {
      throw new ApiError(40902, '该订舱已确认，请勿重复操作');
    }
    const payload = parseJson<Record<string, unknown>>(message.payload, {});
    const vessel = String(payload.vessel ?? 'COSCO SHIPPING');
    const voyage = String(payload.voyage ?? '2026E');
    const slot = `S-${String(messageId).padStart(4, '0')}`;
    const at = formatDateTime(nowDate());
    await txExec(
      conn,
      `UPDATE integration_message SET status = 'SUCCESS', response_payload = ?, processed_at = ? WHERE id = ?`,
      [JSON.stringify({ bookingNo: payload.bookingNo, vessel, voyage, slot, confirmedAt: at, result: 'SUCCESS' }), at, messageId],
    );
    await insertIntegrationMessage(conn, {
      systemCode: 'PORT_EDI',
      systemName: '港口 EDI',
      direction: 'IN',
      msgType: 'SEA_BOOKING_CONFIRM',
      standard: 'UN/EDIFACT 语义',
      relatedType: message.related_type,
      relatedId: message.related_id,
      status: 'SUCCESS',
      payload: {
        bookingNo: payload.bookingNo ?? '',
        vessel,
        voyage,
        slot,
        containerCount: Number(payload.containerCount ?? 1),
        confirmedAt: at,
        status: '已确认',
        bookingMsgNo: message.msg_no,
      },
    });
    const waybillId = Number(message.related_id);
    if (Number.isFinite(waybillId) && waybillId > 0) {
      await appendWaybillEvent(conn, {
        waybillId,
        eventType: 'LOAD',
        operatorUserId: user.uid,
        description: `订舱确认（${vessel}/${voyage}，舱位 ${slot}）`,
        payload: { vessel, voyage, slot, bookingMsgNo: message.msg_no },
        occurredAt: at,
      });
    }
    await writeAudit(conn, {
      user,
      action: 'SEA_CONFIRM',
      actionLabel: '水路订舱确认',
      module: 'sea',
      targetType: 'INTEGRATION_MESSAGE',
      targetId: messageId,
      detail: { msgNo: message.msg_no, vessel, voyage, slot },
      ip,
    });
    return {
      status: 'BOOKED',
      statusLabel: '已确认舱位',
      vessel,
      voyage,
      slot,
      message: '港口订舱确认成功',
    };
  });
}

export { queryOne, round2, queryRows };
