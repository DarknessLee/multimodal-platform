// 铁路工作台（Mock 95306）：任务列表、需求车提报、受理回执
import { queryOne, queryRows, txExec, txQueryOne, withTransaction } from '../../db/pool';
import { ApiError } from '../../errors';
import { writeAudit } from '../../middleware/audit';
import { insertIntegrationMessage } from '../../platform/edi';
import type { AuthUser, IntegrationMessageRow, OrderRow, SegmentRow, WaybillRow } from '../../types';
import { formatDateTime, nowDate, todayDateString } from '../../utils/datetime';
import { parseJson, round2 } from '../../utils/json';
import { appendWaybillEvent } from '../waybill/events';

interface RailTaskRow {
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

interface RailMessageRow {
  id: number;
  related_id: string | null;
  msg_type: string;
  status: string;
  created_at: string;
}

async function nodeCodeMap(): Promise<Map<string, string>> {
  const rows = await queryRows<{ node_name: string; node_code: string }>(
    'SELECT node_name, node_code FROM port_station',
  );
  return new Map(rows.map((row) => [row.node_name, row.node_code]));
}

/** GET /api/rail/tasks */
export async function listRailTasks(_user: AuthUser) {
  const rows = await queryRows<RailTaskRow>(
    `SELECT w.id AS waybill_id, w.waybill_no, o.id AS order_id, o.order_no, o.cargo_name, o.container_type,
            o.container_count AS order_container_count, seg.start_node, seg.end_node, seg.status AS seg_status,
            (SELECT COUNT(*) FROM waybill_container wc WHERE wc.waybill_id = w.id) AS linked_count
       FROM waybill w
       JOIN orders o ON o.id = w.order_id
       JOIN waybill_segment seg ON seg.waybill_id = w.id AND seg.mode = 'RAIL'
      WHERE w.waybill_type = 'MASTER'
      ORDER BY w.created_at DESC, w.id DESC`,
  );
  const ids = rows.map((row) => String(row.waybill_id));
  const messages = ids.length
    ? await queryRows<RailMessageRow>(
        `SELECT id, related_id, msg_type, status, created_at FROM integration_message
          WHERE system_code = 'RAIL_95306' AND related_type = 'WAYBILL' AND related_id IN (?)
          ORDER BY created_at ASC, id ASC`,
        [ids],
      )
    : [];
  const msgByWaybill = new Map<string, RailMessageRow[]>();
  for (const message of messages) {
    const key = String(message.related_id);
    if (!msgByWaybill.has(key)) msgByWaybill.set(key, []);
    msgByWaybill.get(key)?.push(message);
  }
  const nodeCodes = await nodeCodeMap();

  return rows.map((row) => {
    const list = msgByWaybill.get(String(row.waybill_id)) ?? [];
    const applies = list.filter((message) => message.msg_type === 'RAIL_DEMAND_APPLY');
    const accepts = list.filter((message) => message.msg_type === 'RAIL_DEMAND_ACCEPT');
    let demandStatus = 'NOT_APPLIED';
    if (accepts.some((message) => message.status === 'SUCCESS')) {
      demandStatus = 'ACCEPTED';
    } else if (applies.some((message) => message.status === 'PENDING')) {
      demandStatus = 'APPLIED';
    } else if (applies.some((message) => message.status === 'SUCCESS')) {
      demandStatus = 'APPLIED';
    } else if (applies.some((message) => message.status === 'FAILED')) {
      demandStatus = 'FAILED';
    }
    const demandStatusLabelMap: Record<string, string> = {
      NOT_APPLIED: '未提报',
      APPLIED: '已提报待受理',
      ACCEPTED: '已受理',
      FAILED: '提报失败',
    };
    return {
      waybillId: Number(row.waybill_id),
      waybillNo: row.waybill_no,
      orderId: Number(row.order_id),
      orderNo: row.order_no,
      fromStation: nodeCodes.get(row.start_node) ?? row.start_node,
      toStation: nodeCodes.get(row.end_node) ?? row.end_node,
      containerCount: Number(row.linked_count) > 0 ? Number(row.linked_count) : Number(row.order_container_count),
      segmentStatus: row.seg_status,
      demandStatus,
      demandStatusLabel: demandStatusLabelMap[demandStatus],
      lastMessageAt: list.length > 0 ? list[list.length - 1].created_at : null,
    };
  });
}

/** POST /api/rail/tasks/:waybillId/apply：95306 需求车提报（JT/T 1351 语义） */
export async function applyRailDemand(waybillId: number, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const waybill = await txQueryOne<WaybillRow>(conn, 'SELECT * FROM waybill WHERE id = ? FOR UPDATE', [
      waybillId,
    ]);
    if (!waybill) {
      throw new ApiError(40401, '运单不存在');
    }
    if (waybill.waybill_type !== 'MASTER') {
      throw new ApiError(42201, '仅主运单可提报铁路需求车');
    }
    const segment = await txQueryOne<SegmentRow>(
      conn,
      "SELECT * FROM waybill_segment WHERE waybill_id = ? AND mode = 'RAIL' ORDER BY seq ASC LIMIT 1",
      [waybillId],
    );
    if (!segment) {
      throw new ApiError(42201, '该运单没有铁路分段');
    }
    const existing = await txQueryOne<{ id: number; status: string; msg_no: string }>(
      conn,
      `SELECT id, status, msg_no FROM integration_message
        WHERE system_code = 'RAIL_95306' AND msg_type = 'RAIL_DEMAND_APPLY'
          AND related_type = 'WAYBILL' AND related_id = ?
        ORDER BY id DESC LIMIT 1`,
      [String(waybillId)],
    );
    const accepted = await txQueryOne<{ id: number }>(
      conn,
      `SELECT id FROM integration_message
        WHERE system_code = 'RAIL_95306' AND msg_type = 'RAIL_DEMAND_ACCEPT'
          AND related_type = 'WAYBILL' AND related_id = ?
        ORDER BY id DESC LIMIT 1`,
      [String(waybillId)],
    );
    if (accepted) {
      throw new ApiError(40902, '该运单需求车已受理，请勿重复提报');
    }
    if (existing && existing.status === 'PENDING') {
      throw new ApiError(40902, '该运单需求车已提报待受理，请勿重复操作');
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
    const demandDate = order?.required_pickup_date ?? todayDateString();
    const demandPayload = {
      messageNo: `RD-${waybillId}-${Date.now()}`,
      demandNo: `RC${waybillId}`,
      waybillNo: waybill.waybill_no,
      orderNo: order?.order_no ?? '',
      shipperName: '中远海联运 MTO',
      fromStation: fromNode?.node_code ?? segment.start_node,
      toStation: toNode?.node_code ?? segment.end_node,
      containerType: order?.container_type ?? '40HQ',
      containerCount,
      cargoName: order?.cargo_name ?? '',
      cargoWeight: round2(Number(order?.cargo_weight ?? 0)),
      requiredDate: demandDate,
      wagonType: 'X70',
      applyDate: todayDateString(),
      status: '待受理',
    };
    // 调度事件会预生成一条 RAIL_DEMAND_APPLY（自动报文）；人工提报复用并置为 PENDING 待受理
    let messageRef: { id: number; msgNo: string; status: string };
    if (existing) {
      await txExec(
        conn,
        `UPDATE integration_message SET payload = ?, status = 'PENDING', processed_at = NULL,
           error_message = NULL, retry_count = retry_count + 1 WHERE id = ?`,
        [JSON.stringify(demandPayload), existing.id],
      );
      messageRef = { id: Number(existing.id), msgNo: existing.msg_no, status: 'PENDING' };
    } else {
      const created = await insertIntegrationMessage(conn, {
        systemCode: 'RAIL_95306',
        systemName: '铁路 95306',
        direction: 'OUT',
        msgType: 'RAIL_DEMAND_APPLY',
        standard: 'JT/T 1351-2020 语义',
        relatedType: 'WAYBILL',
        relatedId: waybillId,
        status: 'PENDING',
        payload: demandPayload,
      });
      messageRef = { id: created.id, msgNo: created.msgNo, status: created.status };
    }
    await writeAudit(conn, {
      user,
      action: 'RAIL_APPLY',
      actionLabel: '铁路需求车提报',
      module: 'rail',
      targetType: 'WAYBILL',
      targetId: waybillId,
      detail: { waybillNo: waybill.waybill_no, msgNo: messageRef.msgNo, containerCount },
      ip,
    });
    return { messageId: messageRef.id, msgNo: messageRef.msgNo, status: messageRef.status };
  });
}

/** POST /api/rail/demands/:messageId/confirm：95306 受理回执（Mock） */
export async function confirmRailDemand(messageId: number, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const message = await txQueryOne<IntegrationMessageRow>(
      conn,
      'SELECT * FROM integration_message WHERE id = ? FOR UPDATE',
      [messageId],
    );
    if (!message) {
      throw new ApiError(40401, '报文不存在');
    }
    if (message.msg_type !== 'RAIL_DEMAND_APPLY' || message.system_code !== 'RAIL_95306') {
      throw new ApiError(42201, '该报文不是铁路需求车提报');
    }
    if (message.status !== 'PENDING') {
      throw new ApiError(40902, '该需求车已确认，请勿重复操作');
    }
    const payload = parseJson<Record<string, unknown>>(message.payload, {});
    const matchedCars = Number(payload.containerCount ?? 2) || 2;
    const acceptNo = `95306-${messageId}`;
    const at = formatDateTime(nowDate());
    await connExecuteUpdate(conn, message.id, acceptNo, matchedCars, at);
    await insertIntegrationMessage(conn, {
      systemCode: 'RAIL_95306',
      systemName: '铁路 95306',
      direction: 'IN',
      msgType: 'RAIL_DEMAND_ACCEPT',
      standard: 'JT/T 1351-2020 语义',
      relatedType: message.related_type,
      relatedId: message.related_id,
      status: 'SUCCESS',
      payload: {
        acceptNo,
        matchedCars,
        acceptDate: todayDateString(),
        status: '已受理',
        applyMsgNo: message.msg_no,
      },
    });
    const waybillId = Number(message.related_id);
    if (Number.isFinite(waybillId) && waybillId > 0) {
      await appendWaybillEvent(conn, {
        waybillId,
        eventType: 'LOAD',
        operatorUserId: user.uid,
        description: `95306 需求车受理（承认车 ${matchedCars} 辆）`,
        payload: { acceptNo, matchedCars, applyMsgNo: message.msg_no },
        occurredAt: at,
      });
    }
    await writeAudit(conn, {
      user,
      action: 'RAIL_CONFIRM',
      actionLabel: '铁路需求车受理确认',
      module: 'rail',
      targetType: 'INTEGRATION_MESSAGE',
      targetId: message.id,
      detail: { msgNo: message.msg_no, acceptNo, matchedCars },
      ip,
    });
    return {
      status: 'ACCEPTED',
      statusLabel: '已受理',
      matchedCars,
      acceptNo,
      message: '95306 需求车受理成功',
    };
  });
}

async function connExecuteUpdate(
  conn: import('mysql2/promise').PoolConnection,
  id: number,
  acceptNo: string,
  matchedCars: number,
  at: string,
) {
  await txExec(
    conn,
    `UPDATE integration_message SET status = 'SUCCESS', response_payload = ?, processed_at = ? WHERE id = ?`,
    [JSON.stringify({ acceptNo, matchedCars, acceptedAt: at, result: 'SUCCESS' }), at, id],
  );
}

export { queryOne };
