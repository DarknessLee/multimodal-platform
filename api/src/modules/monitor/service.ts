// 监控大屏：总览 KPI / 实时运单 / 趋势
import {
  ALERT_LEVEL_LABELS,
  ALERT_TYPE_LABELS,
  CONTAINER_STATUS_LABELS,
  DEVICE_TYPE_LABELS,
  ORDER_STATUS_LABELS,
  WAYBILL_STATUS_LABELS,
  MODE_LABELS,
} from '../../config/labels';
import { queryOne, queryRows } from '../../db/pool';
import { ApiError } from '../../errors';
import type { AlertLevel, AlertType, ContainerStatus, OrderStatus, SegmentMode, WaybillStatus } from '../../types';
import { formatDate } from '../../utils/datetime';
import { round1 } from '../../utils/json';

function round1Rate(numerator: number, denominator: number, fallback = 100): number {
  return denominator > 0 ? round1((numerator / denominator) * 100) : fallback;
}

export function buildDates(days: number): string[] {
  const dates: string[] = [];
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  for (let i = 0; i < days; i += 1) {
    dates.push(formatDate(new Date(start.getTime() + i * 86400000)));
  }
  return dates;
}

export function clampDays(raw: unknown, fallback = 14): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), 90);
}

/** 时效达成趋势（按天） */
export async function computeTrend(days: number) {
  const dates = buildDates(days);
  const startDate = `${dates[0]} 00:00:00`;
  const segmentRows = await queryRows<{ d: string; total: number; onTime: number }>(
    `SELECT DATE_FORMAT(actual_end, '%Y-%m-%d') AS d, COUNT(*) AS total,
            COALESCE(SUM(actual_end <= planned_end), 0) AS onTime
       FROM waybill_segment
      WHERE status = 'COMPLETED' AND actual_end IS NOT NULL AND actual_end >= ?
      GROUP BY d`,
    [startDate],
  );
  const segmentByDate = new Map(segmentRows.map((row) => [row.d, row]));
  const alertRows = await queryRows<{ d: string; total: number }>(
    `SELECT DATE_FORMAT(occurred_at, '%Y-%m-%d') AS d, COUNT(*) AS total
       FROM alert WHERE occurred_at >= ? GROUP BY d`,
    [startDate],
  );
  const alertByDate = new Map(alertRows.map((row) => [row.d, Number(row.total)]));
  const onTimeRate = dates.map((date) => {
    const row = segmentByDate.get(date);
    return round1Rate(Number(row?.onTime ?? 0), Number(row?.total ?? 0));
  });
  const alerts = dates.map((date) => alertByDate.get(date) ?? 0);
  return {
    dates: dates.map((date) => date.slice(5)),
    onTime: onTimeRate,
    onTimeRate,
    alerts,
  };
}

/** GET /api/monitor/overview */
export async function getMonitorOverview() {
  const kpiRow = await queryOne<{
    onlineWaybills: number;
    inTransit: number;
    containersInTransit: number;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM waybill w WHERE w.waybill_type = 'MASTER' AND w.status = 'IN_TRANSIT') AS onlineWaybills,
       (SELECT COUNT(*) FROM orders o WHERE o.status = 'IN_TRANSIT') AS inTransit,
       (SELECT COUNT(*) FROM container c WHERE c.status = 'IN_TRANSIT') AS containersInTransit`,
  );
  const alertOpen = await queryOne<{ total: number }>(
    "SELECT COUNT(*) AS total FROM alert WHERE status = 'OPEN'",
  );
  const segmentRow = await queryOne<{ total: number; onTime: number; avgHours: number | null }>(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(actual_end <= planned_end), 0) AS onTime,
            AVG(TIMESTAMPDIFF(MINUTE, actual_start, actual_end)) AS avgHours
       FROM waybill_segment
      WHERE status = 'COMPLETED' AND actual_start IS NOT NULL AND actual_end IS NOT NULL`,
  );
  const statusRows = await queryRows<{ status: OrderStatus; total: number }>(
    'SELECT status, COUNT(*) AS total FROM orders GROUP BY status',
  );
  const modeRows = await queryRows<{ mode: SegmentMode; total: number }>(
    `SELECT s.mode, COUNT(DISTINCT o.id) AS total
       FROM waybill_segment s
       JOIN waybill w ON w.id = s.waybill_id
       JOIN orders o ON o.id = w.order_id
      GROUP BY s.mode`,
  );
  const liveRows = await queryRows<{
    waybill_id: number;
    waybill_no: string;
    waybill_status: WaybillStatus;
    container_no: string | null;
    lng: number;
    lat: number;
    node_name: string;
    occurred_at: string;
    mode: SegmentMode | null;
  }>(
    `SELECT w.id AS waybill_id, w.waybill_no, w.status AS waybill_status,
            (SELECT c.container_no FROM waybill_container wc JOIN container c ON c.id = wc.container_id
              WHERE wc.waybill_id = w.id ORDER BY c.id ASC LIMIT 1) AS container_no,
            t.lng, t.lat, t.node_name, t.occurred_at,
            (SELECT s.mode FROM waybill_segment s WHERE s.waybill_id = w.id AND s.status = 'IN_TRANSIT'
              ORDER BY s.seq ASC LIMIT 1) AS mode
       FROM waybill w
       JOIN track_point t ON t.id = (SELECT tp.id FROM track_point tp WHERE tp.waybill_id = w.id
                                      ORDER BY tp.occurred_at DESC, tp.id DESC LIMIT 1)
      WHERE w.waybill_type = 'MASTER' AND w.status IN ('IN_TRANSIT', 'ARRIVED')
      ORDER BY t.occurred_at DESC LIMIT 50`,
  );
  const recentAlerts = await queryRows<{
    id: number;
    alert_type: AlertType;
    level: AlertLevel;
    title: string;
    occurred_at: string;
  }>('SELECT id, alert_type, level, title, occurred_at FROM alert ORDER BY occurred_at DESC, id DESC LIMIT 8');

  const onTimeTrend = await computeTrend(14);
  const totalSegments = Number(segmentRow?.total ?? 0);
  const onTimeSegments = Number(segmentRow?.onTime ?? 0);

  return {
    kpis: {
      onlineWaybills: Number(kpiRow?.onlineWaybills ?? 0),
      inTransit: Number(kpiRow?.inTransit ?? 0),
      onTimeRate: round1Rate(onTimeSegments, totalSegments),
      alertsOpen: Number(alertOpen?.total ?? 0),
      containersInTransit: Number(kpiRow?.containersInTransit ?? 0),
      avgTransitHours: segmentRow?.avgHours === null || segmentRow?.avgHours === undefined ? 0 : round1(Number(segmentRow.avgHours) / 60),
    },
    statusDistribution: statusRows.map((row) => ({
      status: row.status,
      statusLabel: ORDER_STATUS_LABELS[row.status],
      count: Number(row.total),
    })),
    modeDistribution: modeRows.map((row) => ({
      mode: row.mode,
      modeLabel: MODE_LABELS[row.mode],
      count: Number(row.total),
    })),
    livePoints: liveRows.map((row) => ({
      waybillId: Number(row.waybill_id),
      waybillNo: row.waybill_no,
      containerNo: row.container_no,
      lng: Number(row.lng),
      lat: Number(row.lat),
      nodeName: row.node_name,
      occurredAt: row.occurred_at,
      mode: row.mode,
      modeLabel: row.mode ? MODE_LABELS[row.mode] : null,
      statusLabel: WAYBILL_STATUS_LABELS[row.waybill_status],
    })),
    recentAlerts: recentAlerts.map((row) => ({
      id: Number(row.id),
      alertType: row.alert_type,
      alertTypeLabel: ALERT_TYPE_LABELS[row.alert_type],
      level: row.level,
      levelLabel: ALERT_LEVEL_LABELS[row.level],
      title: row.title,
      occurredAt: row.occurred_at,
    })),
    onTimeTrend,
    generatedAt: new Date().toISOString(),
  };
}

/** GET /api/monitor/waybills/:id/live */
export async function getWaybillLive(id: number) {
  const waybill = await queryOne<{
    id: number;
    waybill_no: string;
    status: WaybillStatus;
    waybill_type: string;
    parent_waybill_id: number | null;
  }>('SELECT id, waybill_no, status, waybill_type, parent_waybill_id FROM waybill WHERE id = ?', [id]);
  if (!waybill) {
    throw new ApiError(40401, '运单不存在');
  }
  const masterId =
    waybill.waybill_type === 'SEGMENT' && waybill.parent_waybill_id
      ? Number(waybill.parent_waybill_id)
      : Number(waybill.id);
  const children = await queryRows<{ id: number }>('SELECT id FROM waybill WHERE parent_waybill_id = ?', [
    masterId,
  ]);
  const familyIds = [masterId, ...children.map((child) => Number(child.id))];

  const latestPoint = await queryOne<{
    lng: number;
    lat: number;
    node_name: string;
    occurred_at: string;
  }>(
    `SELECT lng, lat, node_name, occurred_at FROM track_point
      WHERE waybill_id IN (?) ORDER BY occurred_at DESC, id DESC LIMIT 1`,
    [familyIds],
  );
  const containers = await queryRows<{ id: number; container_no: string; current_node_id: number | null }>(
    `SELECT DISTINCT c.id, c.container_no, c.current_node_id
       FROM waybill_container wc JOIN container c ON c.id = wc.container_id
      WHERE wc.waybill_id = ? ORDER BY c.id ASC`,
    [masterId],
  );
  const containerIds = containers.map((container) => Number(container.id));
  const devices = containerIds.length
    ? await queryRows<{
        id: number;
        device_no: string;
        device_type: keyof typeof DEVICE_TYPE_LABELS;
        status: 'ONLINE' | 'OFFLINE';
        container_id: number | null;
        last_seen_at: string | null;
      }>(
        `SELECT id, device_no, device_type, status, container_id, last_seen_at
           FROM iot_device WHERE container_id IN (?) ORDER BY id ASC`,
        [containerIds],
      )
    : [];
  const deviceIds = devices.map((device) => Number(device.id));
  const latestReading = deviceIds.length
    ? await queryOne<{
        device_no: string;
        temperature: number | null;
        humidity: number | null;
        door_open: number;
        impact_g: number | null;
        lng: number | null;
        lat: number | null;
        reported_at: string;
      }>(
        `SELECT d.device_no, r.temperature, r.humidity, r.door_open, r.impact_g, r.lng, r.lat, r.reported_at
           FROM iot_reading r JOIN iot_device d ON d.id = r.device_id
          WHERE r.device_id IN (?)
          ORDER BY r.reported_at DESC, r.id DESC LIMIT 1`,
        [deviceIds],
      )
    : null;
  const readings = deviceIds.length
    ? await queryRows<{
        id: number;
        device_no: string;
        temperature: number | null;
        humidity: number | null;
        door_open: number;
        impact_g: number | null;
        lng: number | null;
        lat: number | null;
        reported_at: string;
      }>(
        `SELECT r.id, d.device_no, r.temperature, r.humidity, r.door_open, r.impact_g, r.lng, r.lat, r.reported_at
           FROM iot_reading r JOIN iot_device d ON d.id = r.device_id
          WHERE r.device_id IN (?)
          ORDER BY r.reported_at DESC, r.id DESC LIMIT 20`,
        [deviceIds],
      )
    : [];
  const alerts = await queryRows<{
    id: number;
    alert_no: string;
    alert_type: keyof typeof ALERT_TYPE_LABELS;
    level: keyof typeof ALERT_LEVEL_LABELS;
    title: string;
    status: string;
    occurred_at: string;
  }>(
    `SELECT id, alert_no, alert_type, level, title, status, occurred_at
       FROM alert
      WHERE waybill_id IN (?) OR container_id IN (?)
      ORDER BY occurred_at DESC, id DESC LIMIT 10`,
    [familyIds, containerIds.length ? containerIds : [-1]],
  );
  const trailRows = await queryRows<{
    id: number;
    seq: number;
    node_name: string;
    lng: number;
    lat: number;
    occurred_at: string;
    source: string;
    description: string | null;
  }>(
    `SELECT id, seq, node_name, lng, lat, occurred_at, source, description
       FROM track_point WHERE waybill_id IN (?)
      ORDER BY occurred_at ASC, seq ASC`,
    [familyIds],
  );

  const fallbackContainer = containers.find((container) => container.current_node_id);
  let livePosition = latestPoint
    ? {
        lng: Number(latestPoint.lng),
        lat: Number(latestPoint.lat),
        nodeName: latestPoint.node_name,
        occurredAt: latestPoint.occurred_at,
        source: 'TRACK_POINT',
      }
    : null;
  if (!livePosition && fallbackContainer) {
    const node = await queryOne<{ node_name: string; lng: number; lat: number }>(
      'SELECT node_name, lng, lat FROM port_station WHERE id = ?',
      [fallbackContainer.current_node_id],
    );
    if (node) {
      livePosition = {
        lng: Number(node.lng),
        lat: Number(node.lat),
        nodeName: node.node_name,
        occurredAt: latestPoint?.occurred_at ?? '',
        source: 'CONTAINER_NODE',
      };
    }
  }

  return {
    waybill: {
      id: Number(waybill.id),
      waybillNo: waybill.waybill_no,
      status: waybill.status,
      statusLabel: WAYBILL_STATUS_LABELS[waybill.status],
    },
    livePosition,
    containers: containers.map((container) => ({
      id: Number(container.id),
      containerNo: container.container_no,
      statusLabel: null,
    })),
    devices: devices.map((device) => ({
      id: Number(device.id),
      deviceNo: device.device_no,
      deviceType: device.device_type,
      deviceTypeLabel: DEVICE_TYPE_LABELS[device.device_type],
      status: device.status,
      containerId: device.container_id === null ? null : Number(device.container_id),
      lastSeenAt: device.last_seen_at,
    })),
    readings: latestReading
      ? {
          deviceNo: latestReading.device_no,
          temperature: latestReading.temperature === null ? null : Number(latestReading.temperature),
          humidity: latestReading.humidity === null ? null : Number(latestReading.humidity),
          doorOpen: Number(latestReading.door_open) === 1,
          impactG: latestReading.impact_g === null ? null : Number(latestReading.impact_g),
          lng: latestReading.lng === null ? null : Number(latestReading.lng),
          lat: latestReading.lat === null ? null : Number(latestReading.lat),
          reportedAt: latestReading.reported_at,
        }
      : null,
    readingsList: readings.map((row) => ({
      id: Number(row.id),
      deviceNo: row.device_no,
      temperature: row.temperature === null ? null : Number(row.temperature),
      humidity: row.humidity === null ? null : Number(row.humidity),
      doorOpen: Number(row.door_open) === 1,
      reportedAt: row.reported_at,
    })),
    alerts: alerts.map((row) => ({
      id: Number(row.id),
      alertNo: row.alert_no,
      alertType: row.alert_type,
      alertTypeLabel: ALERT_TYPE_LABELS[row.alert_type],
      level: row.level,
      levelLabel: ALERT_LEVEL_LABELS[row.level],
      title: row.title,
      status: row.status,
      occurredAt: row.occurred_at,
    })),
    trail: trailRows.map((row) => ({
      id: Number(row.id),
      seq: Number(row.seq),
      nodeName: row.node_name,
      lng: Number(row.lng),
      lat: Number(row.lat),
      occurredAt: row.occurred_at,
      source: row.source,
      description: row.description,
    })),
  };
}

export { CONTAINER_STATUS_LABELS, formatDate };
