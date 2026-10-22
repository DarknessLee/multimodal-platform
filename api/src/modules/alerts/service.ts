// 预警中心 + 异常工单
import {
  ALERT_LEVEL_LABELS,
  ALERT_STATUS_LABELS,
  ALERT_TYPE_LABELS,
  TICKET_STATUS_LABELS,
} from '../../config/labels';
import { queryOne, queryRows, txExec, txQueryOne, withTransaction } from '../../db/pool';
import { ApiError } from '../../errors';
import { writeAudit } from '../../middleware/audit';
import { emitEvent } from '../../platform/eventBus';
import type {
  AlertLevel,
  AlertRow,
  AlertStatus,
  AlertType,
  AuthUser,
  ExceptionTicketRow,
  TicketStatus,
} from '../../types';
import { formatDateTime, nowDate } from '../../utils/datetime';
import { optionalString, pageResult, parsePage } from '../shared/pagination';

const ALERT_JOINED_SELECT = `
  SELECT a.*, w.waybill_no, c.container_no, n.node_name
    FROM alert a
    LEFT JOIN waybill w ON w.id = a.waybill_id
    LEFT JOIN container c ON c.id = a.container_id
    LEFT JOIN port_station n ON n.id = a.node_id`;

interface AlertJoinedRow extends AlertRow {
  waybill_no: string | null;
  container_no: string | null;
  node_name: string | null;
}

export function alertDto(row: AlertJoinedRow) {
  return {
    id: Number(row.id),
    alertNo: row.alert_no,
    alertType: row.alert_type,
    alertTypeLabel: ALERT_TYPE_LABELS[row.alert_type as AlertType],
    level: row.level,
    levelLabel: ALERT_LEVEL_LABELS[row.level as AlertLevel],
    waybillId: row.waybill_id === null ? null : Number(row.waybill_id),
    waybillNo: row.waybill_no,
    containerId: row.container_id === null ? null : Number(row.container_id),
    containerNo: row.container_no,
    nodeId: row.node_id === null ? null : Number(row.node_id),
    nodeName: row.node_name,
    title: row.title,
    content: row.content,
    status: row.status,
    statusLabel: ALERT_STATUS_LABELS[row.status as AlertStatus],
    occurredAt: row.occurred_at,
    ackedBy: row.acked_by === null ? null : Number(row.acked_by),
    ackedAt: row.acked_at,
    closedAt: row.closed_at,
  };
}

async function loadAlertJoined(id: number): Promise<AlertJoinedRow> {
  const row = await queryOne<AlertJoinedRow>(`${ALERT_JOINED_SELECT} WHERE a.id = ?`, [id]);
  if (!row) {
    throw new ApiError(40401, '预警不存在');
  }
  return row;
}

/** GET /api/alerts */
export async function listAlerts(query: Record<string, unknown>) {
  const pager = parsePage(query, 10, 100);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const status = optionalString(query.status);
  const level = optionalString(query.level);
  const alertType = optionalString(query.alertType);
  const waybillId = optionalString(query.waybillId);
  if (status) {
    conditions.push('a.status = ?');
    params.push(status);
  }
  if (level) {
    conditions.push('a.level = ?');
    params.push(level);
  }
  if (alertType) {
    conditions.push('a.alert_type = ?');
    params.push(alertType);
  }
  if (waybillId) {
    conditions.push('a.waybill_id = ?');
    params.push(Number(waybillId));
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM alert a ${where}`, params);
  const rows = await queryRows<AlertJoinedRow>(
    `${ALERT_JOINED_SELECT} ${where} ORDER BY a.occurred_at DESC, a.id DESC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  return pageResult(rows.map(alertDto), Number(totalRow?.total ?? 0), pager);
}

/** POST /api/alerts/:id/ack：OPEN → ACK */
export async function ackAlert(id: number, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const alert = await txQueryOne<AlertRow>(conn, 'SELECT * FROM alert WHERE id = ? FOR UPDATE', [id]);
    if (!alert) {
      throw new ApiError(40401, '预警不存在');
    }
    if (alert.status === 'ACK') {
      throw new ApiError(40902, '预警已确认，请勿重复操作');
    }
    if (alert.status !== 'OPEN') {
      throw new ApiError(40902, '预警已关闭，不能再次确认');
    }
    const at = formatDateTime(nowDate());
    await txExec(conn, "UPDATE alert SET status = 'ACK', acked_by = ?, acked_at = ? WHERE id = ?", [
      user.uid,
      at,
      id,
    ]);
    await writeAudit(conn, {
      user,
      action: 'ALERT_ACK',
      actionLabel: '预警确认',
      module: 'alert',
      targetType: 'ALERT',
      targetId: id,
      detail: { alertNo: alert.alert_no, alertType: alert.alert_type, level: alert.level },
      ip,
    });
    const updated = await txQueryOne<AlertJoinedRow>(conn, `${ALERT_JOINED_SELECT} WHERE a.id = ?`, [id]);
    return updated ? alertDto(updated) : null;
  });
}

/** POST /api/alerts/:id/close：ACK/OPEN → CLOSED（CRITICAL 需先处置关联工单） */
export async function closeAlert(id: number, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const alert = await txQueryOne<AlertRow>(conn, 'SELECT * FROM alert WHERE id = ? FOR UPDATE', [id]);
    if (!alert) {
      throw new ApiError(40401, '预警不存在');
    }
    if (alert.status === 'CLOSED') {
      throw new ApiError(40902, '预警已关闭，请勿重复操作');
    }
    if (alert.level === 'CRITICAL') {
      const pendingTicket = await txQueryOne<{ id: number; ticket_no: string; status: string }>(
        conn,
        `SELECT id, ticket_no, status FROM exception_ticket
          WHERE alert_id = ? AND status NOT IN ('RESOLVED', 'CLOSED')
          ORDER BY id ASC LIMIT 1`,
        [id],
      );
      if (pendingTicket) {
        throw new ApiError(42201, `存在关联未处置异常工单（${pendingTicket.ticket_no}），请先处置`);
      }
    }
    const at = formatDateTime(nowDate());
    await txExec(conn, "UPDATE alert SET status = 'CLOSED', closed_at = ? WHERE id = ?", [at, id]);
    await writeAudit(conn, {
      user,
      action: 'ALERT_CLOSE',
      actionLabel: '预警关闭',
      module: 'alert',
      targetType: 'ALERT',
      targetId: id,
      detail: { alertNo: alert.alert_no, alertType: alert.alert_type, level: alert.level },
      ip,
    });
    const updated = await txQueryOne<AlertJoinedRow>(conn, `${ALERT_JOINED_SELECT} WHERE a.id = ?`, [id]);
    return updated ? alertDto(updated) : null;
  });
}

const TICKET_TYPE_LABELS: Record<string, string> = {
  DELAY: '运输延误',
  DEVIATION: '路线偏航',
  TEMP_HUMIDITY: '温湿度异常',
  STAY: '异常停留',
  DOOR_OPEN: '箱门异常',
  EXCEPTION: '异常事件',
};

interface TicketJoinedRow extends ExceptionTicketRow {
  alert_no: string | null;
  order_no: string | null;
  waybill_no: string | null;
  assignee_name: string | null;
}

const TICKET_JOINED_SELECT = `
  SELECT t.*, a.alert_no, o.order_no, w.waybill_no, u.display_name AS assignee_name
    FROM exception_ticket t
    LEFT JOIN alert a ON a.id = t.alert_id
    LEFT JOIN orders o ON o.id = t.order_id
    LEFT JOIN waybill w ON w.id = t.waybill_id
    LEFT JOIN user u ON u.id = t.assignee_user_id`;

function ticketDto(row: TicketJoinedRow) {
  const status = row.status as TicketStatus;
  return {
    id: Number(row.id),
    ticketNo: row.ticket_no,
    alertId: row.alert_id === null ? null : Number(row.alert_id),
    alertNo: row.alert_no,
    orderId: row.order_id === null ? null : Number(row.order_id),
    orderNo: row.order_no,
    waybillId: row.waybill_id === null ? null : Number(row.waybill_id),
    waybillNo: row.waybill_no,
    type: row.type,
    typeLabel: TICKET_TYPE_LABELS[row.type] ?? row.type,
    description: row.description,
    assignee: row.assignee_name,
    status,
    statusLabel: TICKET_STATUS_LABELS[status],
    resolution: row.resolution,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

/** GET /api/exceptions */
export async function listExceptions(query: Record<string, unknown>) {
  const pager = parsePage(query, 10, 100);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const status = optionalString(query.status);
  const type = optionalString(query.type);
  if (status) {
    conditions.push('t.status = ?');
    params.push(status);
  }
  if (type) {
    conditions.push('t.type = ?');
    params.push(type);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM exception_ticket t ${where}`,
    params,
  );
  const rows = await queryRows<TicketJoinedRow>(
    `${TICKET_JOINED_SELECT} ${where} ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  return pageResult(rows.map(ticketDto), Number(totalRow?.total ?? 0), pager);
}

export interface HandleExceptionInput {
  resolution: string;
  status?: TicketStatus;
}

/** POST /api/exceptions/:id/handle */
export async function handleException(id: number, input: HandleExceptionInput, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const ticket = await txQueryOne<ExceptionTicketRow>(
      conn,
      'SELECT * FROM exception_ticket WHERE id = ? FOR UPDATE',
      [id],
    );
    if (!ticket) {
      throw new ApiError(40401, '异常工单不存在');
    }
    if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
      throw new ApiError(40902, '异常工单已处置，请勿重复操作');
    }
    const nextStatus: TicketStatus = input.status ?? 'RESOLVED';
    const at = formatDateTime(nowDate());
    const resolvedAt = nextStatus === 'RESOLVED' || nextStatus === 'CLOSED' ? at : null;
    await txExec(
      conn,
      'UPDATE exception_ticket SET status = ?, resolution = ?, resolved_at = ? WHERE id = ?',
      [nextStatus, input.resolution, resolvedAt, id],
    );
    await emitEvent(conn, {
      eventType: 'exception.handled',
      aggregateType: 'EXCEPTION_TICKET',
      aggregateId: Number(ticket.id),
      payload: {
        ticketNo: ticket.ticket_no,
        status: nextStatus,
        resolution: input.resolution,
        alertId: ticket.alert_id === null ? null : Number(ticket.alert_id),
        waybillId: ticket.waybill_id === null ? null : Number(ticket.waybill_id),
      },
    });
    await writeAudit(conn, {
      user,
      action: 'EXCEPTION_HANDLE',
      actionLabel: '异常工单处置',
      module: 'exception',
      targetType: 'EXCEPTION_TICKET',
      targetId: id,
      detail: { ticketNo: ticket.ticket_no, status: nextStatus, resolution: input.resolution },
      ip,
    });
    const updated = await txQueryOne<TicketJoinedRow>(conn, `${TICKET_JOINED_SELECT} WHERE t.id = ?`, [id]);
    return updated ? ticketDto(updated) : null;
  });
}
