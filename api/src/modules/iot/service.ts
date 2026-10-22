// IoT Mock：设备/读数/Geo Fence；超阈值自动预警（30 分钟去重）
import {
  ALERT_LEVEL_LABELS,
  ALERT_TYPE_LABELS,
  DEVICE_STATUS_LABELS,
  DEVICE_TYPE_LABELS,
  FENCE_STATUS_LABELS,
  FENCE_TYPE_LABELS,
} from '../../config/labels';
import { queryOne, queryRows, txExec, txQueryOne, withTransaction } from '../../db/pool';
import { ApiError } from '../../errors';
import { writeAudit } from '../../middleware/audit';
import { nextDocNo } from '../../platform/sequence';
import type {
  AlertLevel,
  AlertType,
  AuthUser,
  ContainerRow,
  DeviceStatus,
  DeviceType,
  FenceStatus,
  FenceType,
  IotDeviceRow,
  IotReadingRow,
} from '../../types';
import { formatDateTime, nowDate, todayCompact } from '../../utils/datetime';
import { toBool } from '../../utils/json';
import { optionalString, pageResult, parsePage } from '../shared/pagination';

/** GET /api/iot/devices */
export async function listDevices(query: Record<string, unknown>) {
  const pager = parsePage(query, 10, 100);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const containerId = optionalString(query.containerId);
  const deviceType = optionalString(query.deviceType);
  const status = optionalString(query.status);
  if (containerId) {
    conditions.push('d.container_id = ?');
    params.push(Number(containerId));
  }
  if (deviceType) {
    conditions.push('d.device_type = ?');
    params.push(deviceType);
  }
  if (status) {
    conditions.push('d.status = ?');
    params.push(status);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM iot_device d ${where}`,
    params,
  );
  const rows = await queryRows<{
    id: number;
    device_no: string;
    device_type: DeviceType;
    status: DeviceStatus;
    container_no: string | null;
    vehicle_no: string | null;
    last_seen_at: string | null;
  }>(
    `SELECT d.id, d.device_no, d.device_type, d.status, d.last_seen_at,
            c.container_no, v.vehicle_no
       FROM iot_device d
       LEFT JOIN container c ON c.id = d.container_id
       LEFT JOIN vehicle v ON v.id = d.vehicle_id
       ${where}
      ORDER BY d.id ASC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  const list = rows.map((row) => ({
    id: Number(row.id),
    deviceNo: row.device_no,
    deviceType: row.device_type,
    deviceTypeLabel: DEVICE_TYPE_LABELS[row.device_type],
    containerNo: row.container_no,
    vehicleNo: row.vehicle_no,
    status: row.status,
    statusLabel: DEVICE_STATUS_LABELS[row.status],
    lastSeenAt: row.last_seen_at,
  }));
  return pageResult(list, Number(totalRow?.total ?? 0), pager);
}

function readingDto(row: {
  id: number;
  device_no: string;
  container_no: string | null;
  temperature: number | null;
  humidity: number | null;
  door_open: number | boolean;
  impact_g: number | null;
  lng: number | null;
  lat: number | null;
  reported_at: string;
}) {
  return {
    id: Number(row.id),
    deviceNo: row.device_no,
    containerNo: row.container_no,
    temperature: row.temperature === null ? null : Number(row.temperature),
    humidity: row.humidity === null ? null : Number(row.humidity),
    doorOpen: toBool(row.door_open),
    impactG: row.impact_g === null ? null : Number(row.impact_g),
    lng: row.lng === null ? null : Number(row.lng),
    lat: row.lat === null ? null : Number(row.lat),
    reportedAt: row.reported_at,
  };
}

/** GET /api/iot/readings */
export async function listReadings(query: Record<string, unknown>) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const deviceId = optionalString(query.deviceId);
  const containerId = optionalString(query.containerId);
  const limitRaw = Number(query.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 50;
  if (deviceId) {
    conditions.push('r.device_id = ?');
    params.push(Number(deviceId));
  }
  if (containerId) {
    conditions.push('r.container_id = ?');
    params.push(Number(containerId));
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await queryRows<{
    id: number;
    device_no: string;
    container_no: string | null;
    temperature: number | null;
    humidity: number | null;
    door_open: number;
    impact_g: number | null;
    lng: number | null;
    lat: number | null;
    reported_at: string;
  }>(
    `SELECT r.id, d.device_no, c.container_no, r.temperature, r.humidity, r.door_open, r.impact_g,
            r.lng, r.lat, r.reported_at
       FROM iot_reading r
       JOIN iot_device d ON d.id = r.device_id
       LEFT JOIN container c ON c.id = r.container_id
       ${where}
      ORDER BY r.reported_at DESC, r.id DESC LIMIT ?`,
    [...params, limit],
  );
  return rows.map(readingDto);
}

interface AlertDraft {
  alertType: AlertType;
  level: AlertLevel;
  title: string;
  content: string;
  containerId: number | null;
  waybillId: number | null;
  nodeId: number | null;
  dedupeTitle: string;
}

async function createAlertWithDedup(
  conn: import('mysql2/promise').PoolConnection,
  draft: AlertDraft,
  occurredAt: string,
) {
  const existing = await txQueryOne<{ id: number; alert_no: string }>(
    conn,
    `SELECT id, alert_no FROM alert
      WHERE alert_type = ?
        AND occurred_at >= DATE_SUB(?, INTERVAL 30 MINUTE)
        AND ((container_id IS NOT NULL AND container_id = ?) OR (container_id IS NULL AND title = ?))
      ORDER BY id DESC LIMIT 1`,
    [draft.alertType, occurredAt, draft.containerId ?? -1, draft.dedupeTitle],
  );
  if (existing) {
    return null;
  }
  const alertNo = await nextDocNo(conn, {
    table: 'alert',
    column: 'alert_no',
    prefix: `AL${todayCompact()}`,
    width: 4,
  });
  const inserted = await txExec(
    conn,
    `INSERT INTO alert (alert_no, alert_type, level, waybill_id, segment_id, container_id, node_id,
       title, content, status, occurred_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'OPEN', ?)`,
    [
      alertNo,
      draft.alertType,
      draft.level,
      draft.waybillId,
      draft.containerId,
      draft.nodeId,
      draft.title,
      draft.content,
      occurredAt,
    ],
  );
  return {
    id: Number(inserted.insertId),
    alertNo,
    alertType: draft.alertType,
    alertTypeLabel: ALERT_TYPE_LABELS[draft.alertType],
    level: draft.level,
    levelLabel: ALERT_LEVEL_LABELS[draft.level],
    title: draft.title,
  };
}

export interface IngestReadingInput {
  deviceNo: string;
  temperature?: number | null;
  humidity?: number | null;
  doorOpen?: boolean | null;
  impactG?: number | null;
  lng?: number | null;
  lat?: number | null;
  reportedAt?: string | null;
}

/** POST /api/iot/readings（Mock 上报 + 规则触发预警 + 30 分钟去重） */
export async function ingestReading(input: IngestReadingInput, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const device = await txQueryOne<IotDeviceRow>(
      conn,
      'SELECT * FROM iot_device WHERE device_no = ? FOR UPDATE',
      [input.deviceNo],
    );
    if (!device) {
      throw new ApiError(40401, 'IoT 设备不存在');
    }
    const reportedAt = input.reportedAt ?? formatDateTime(nowDate());
    const previous = await txQueryOne<IotReadingRow>(
      conn,
      `SELECT * FROM iot_reading WHERE device_id = ? AND reported_at < ?
        ORDER BY reported_at DESC, id DESC LIMIT 1`,
      [device.id, reportedAt],
    );
    const inserted = await txExec(
      conn,
      `INSERT INTO iot_reading (device_id, container_id, temperature, humidity, door_open, impact_g, lng, lat, reported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        device.id,
        device.container_id,
        input.temperature ?? null,
        input.humidity ?? null,
        toBool(input.doorOpen) ? 1 : 0,
        input.impactG ?? null,
        input.lng ?? null,
        input.lat ?? null,
        reportedAt,
      ],
    );
    const readingId = Number(inserted.insertId);
    await txExec(conn, "UPDATE iot_device SET status = 'ONLINE', last_seen_at = ? WHERE id = ?", [
      reportedAt,
      device.id,
    ]);

    let container: ContainerRow | null = null;
    if (device.container_id) {
      container = await txQueryOne<ContainerRow>(conn, 'SELECT * FROM container WHERE id = ?', [
        device.container_id,
      ]);
    }
    const waybillId = container?.current_waybill_id ? Number(container.current_waybill_id) : null;
    const nodeId = container?.current_node_id ? Number(container.current_node_id) : null;
    const drafts: AlertDraft[] = [];

    if (input.temperature !== null && input.temperature !== undefined && Number(input.temperature) > 8) {
      drafts.push({
        alertType: 'TEMP_HUMIDITY',
        level: 'CRITICAL',
        title: '冷藏箱温度超标',
        content: `设备 ${device.device_no} 上报温度 ${Number(input.temperature)}℃ 超过阈值 8℃`,
        containerId: device.container_id ? Number(device.container_id) : null,
        waybillId,
        nodeId,
        dedupeTitle: '冷藏箱温度超标',
      });
    }
    if (toBool(input.doorOpen)) {
      drafts.push({
        alertType: 'DOOR_OPEN',
        level: 'WARN',
        title: '箱门异常开启',
        content: `设备 ${device.device_no} 检测到箱门开启`,
        containerId: device.container_id ? Number(device.container_id) : null,
        waybillId,
        nodeId,
        dedupeTitle: '箱门异常开启',
      });
    }
    // 异常停留：同一设备位置未变化且距上一次读数 ≥ 12 小时
    if (
      previous &&
      input.lng !== null &&
      input.lng !== undefined &&
      input.lat !== null &&
      input.lat !== undefined &&
      previous.lng !== null &&
      previous.lat !== null &&
      Math.abs(Number(input.lng) - Number(previous.lng)) < 0.0005 &&
      Math.abs(Number(input.lat) - Number(previous.lat)) < 0.0005
    ) {
      const gapHours =
        (new Date(reportedAt.replace(' ', 'T')).getTime() -
          new Date(String(previous.reported_at).replace(' ', 'T')).getTime()) /
        3600000;
      if (gapHours >= 12) {
        drafts.push({
          alertType: 'STAY',
          level: 'WARN',
          title: '车辆异常停留超 12 小时',
          content: `设备 ${device.device_no} 位置停留超过 ${Math.round(gapHours)} 小时`,
          containerId: device.container_id ? Number(device.container_id) : null,
          waybillId,
          nodeId,
          dedupeTitle: '车辆异常停留超 12 小时',
        });
      }
    }

    const alertsCreated: Array<NonNullable<Awaited<ReturnType<typeof createAlertWithDedup>>>> = [];
    for (const draft of drafts) {
      const alert = await createAlertWithDedup(conn, draft, reportedAt);
      if (alert) alertsCreated.push(alert);
    }

    await writeAudit(conn, {
      user,
      action: 'IOT_INGEST',
      actionLabel: 'IoT 读数上报',
      module: 'iot',
      targetType: 'IOT_READING',
      targetId: readingId,
      detail: { deviceNo: device.device_no, alertsCreated: alertsCreated.length },
      ip,
    });

    const readingRow = await txQueryOne<{
      id: number;
      device_no: string;
      container_no: string | null;
      temperature: number | null;
      humidity: number | null;
      door_open: number;
      impact_g: number | null;
      lng: number | null;
      lat: number | null;
      reported_at: string;
    }>(
      conn,
      `SELECT r.id, d.device_no, c.container_no, r.temperature, r.humidity, r.door_open, r.impact_g,
              r.lng, r.lat, r.reported_at
         FROM iot_reading r
         JOIN iot_device d ON d.id = r.device_id
         LEFT JOIN container c ON c.id = r.container_id
        WHERE r.id = ?`,
      [readingId],
    );

    return {
      reading: readingRow ? readingDto(readingRow) : null,
      alertsCreated,
    };
  });
}

/** GET /api/geo-fences */
export async function listGeoFences(query: Record<string, unknown>) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const fenceType = optionalString(query.fenceType);
  if (fenceType) {
    conditions.push('f.fence_type = ?');
    params.push(fenceType);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await queryRows<{
    id: number;
    name: string;
    fence_type: FenceType;
    node_id: number | null;
    node_name: string | null;
    center_lng: number;
    center_lat: number;
    radius_m: number;
    status: FenceStatus;
  }>(
    `SELECT f.*, n.node_name FROM geo_fence f LEFT JOIN port_station n ON n.id = f.node_id
      ${where} ORDER BY f.id ASC`,
    params,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    fenceType: row.fence_type,
    fenceTypeLabel: FENCE_TYPE_LABELS[row.fence_type],
    nodeId: row.node_id === null ? null : Number(row.node_id),
    nodeName: row.node_name,
    centerLng: Number(row.center_lng),
    centerLat: Number(row.center_lat),
    radiusM: Number(row.radius_m),
    status: row.status,
    statusLabel: FENCE_STATUS_LABELS[row.status],
  }));
}
