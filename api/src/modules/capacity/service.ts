// 运力池：车辆 / 班列 / 班轮 摘要与分页列表
import {
  SCHEDULE_STATUS_LABELS,
  VEHICLE_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
} from '../../config/labels';
import { queryOne, queryRows } from '../../db/pool';
import type { ScheduleStatus, VehicleStatus, VehicleType } from '../../types';
import { round1 } from '../../utils/json';
import { optionalString, pageResult, parsePage } from '../shared/pagination';

export interface CapacitySummary {
  vehicles: { total: number; idle: number; inTask: number; maintenance: number; utilization: number };
  trains: {
    total: number;
    upcoming: number;
    capacityTeu: number;
    bookedTeu: number;
    utilization: number;
  };
  vessels: {
    total: number;
    upcoming: number;
    capacityTeu: number;
    bookedTeu: number;
    utilization: number;
  };
}

/** GET /api/capacity/summary */
export async function getCapacitySummary(): Promise<CapacitySummary> {
  const vehicleRow = await queryOne<{ total: number; idle: number; inTask: number; maintenance: number }>(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(status = 'IDLE'), 0) AS idle,
            COALESCE(SUM(status = 'IN_TASK'), 0) AS inTask,
            COALESCE(SUM(status = 'MAINTENANCE'), 0) AS maintenance
       FROM vehicle`,
  );
  const trainRow = await queryOne<{
    total: number;
    upcoming: number;
    capacityTeu: number | null;
    bookedTeu: number | null;
  }>(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(status IN ('PLANNED', 'OPEN') AND departure_at >= NOW()), 0) AS upcoming,
            COALESCE(SUM(capacity_teu), 0) AS capacityTeu,
            COALESCE(SUM(booked_teu), 0) AS bookedTeu
       FROM train_schedule`,
  );
  const vesselRow = await queryOne<{
    total: number;
    upcoming: number;
    capacityTeu: number | null;
    bookedTeu: number | null;
  }>(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(status IN ('PLANNED', 'OPEN') AND etd >= NOW()), 0) AS upcoming,
            COALESCE(SUM(capacity_teu), 0) AS capacityTeu,
            COALESCE(SUM(booked_teu), 0) AS bookedTeu
       FROM vessel_schedule`,
  );

  const vehiclesTotal = Number(vehicleRow?.total ?? 0);
  const vehiclesInTask = Number(vehicleRow?.inTask ?? 0);
  const trainsTotal = Number(trainRow?.total ?? 0);
  const trainCapacity = Number(trainRow?.capacityTeu ?? 0);
  const trainBooked = Number(trainRow?.bookedTeu ?? 0);
  const vesselsTotal = Number(vesselRow?.total ?? 0);
  const vesselCapacity = Number(vesselRow?.capacityTeu ?? 0);
  const vesselBooked = Number(vesselRow?.bookedTeu ?? 0);

  return {
    vehicles: {
      total: vehiclesTotal,
      idle: Number(vehicleRow?.idle ?? 0),
      inTask: vehiclesInTask,
      maintenance: Number(vehicleRow?.maintenance ?? 0),
      utilization: vehiclesTotal > 0 ? round1((vehiclesInTask / vehiclesTotal) * 100) : 0,
    },
    trains: {
      total: trainsTotal,
      upcoming: Number(trainRow?.upcoming ?? 0),
      capacityTeu: trainCapacity,
      bookedTeu: trainBooked,
      utilization: trainCapacity > 0 ? round1((trainBooked / trainCapacity) * 100) : 0,
    },
    vessels: {
      total: vesselsTotal,
      upcoming: Number(vesselRow?.upcoming ?? 0),
      capacityTeu: vesselCapacity,
      bookedTeu: vesselBooked,
      utilization: vesselCapacity > 0 ? round1((vesselBooked / vesselCapacity) * 100) : 0,
    },
  };
}

/** GET /api/capacity/vehicles */
export async function listVehicles(query: Record<string, unknown>) {
  const pager = parsePage(query, 10, 100);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const status = optionalString(query.status);
  const carrierId = optionalString(query.carrierId);
  if (status) {
    conditions.push('v.status = ?');
    params.push(status);
  }
  if (carrierId) {
    conditions.push('v.carrier_partner_id = ?');
    params.push(Number(carrierId));
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM vehicle v ${where}`, params);
  const rows = await queryRows<{
    id: number;
    vehicle_no: string;
    plate_no: string;
    vehicle_type: VehicleType;
    carrier_name: string | null;
    driver_name: string;
    driver_phone: string;
    capacity_t: number;
    container_slots: number;
    status: VehicleStatus;
    node_name: string | null;
    lng: number | null;
    lat: number | null;
    last_seen_at: string | null;
  }>(
    `SELECT v.*, p.name AS carrier_name, n.node_name
       FROM vehicle v
       LEFT JOIN partner p ON p.id = v.carrier_partner_id
       LEFT JOIN port_station n ON n.id = v.current_node_id
       ${where}
      ORDER BY v.id ASC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  const list = rows.map((row) => ({
    id: Number(row.id),
    vehicleNo: row.vehicle_no,
    plateNo: row.plate_no,
    vehicleType: row.vehicle_type,
    vehicleTypeLabel: VEHICLE_TYPE_LABELS[row.vehicle_type],
    carrierName: row.carrier_name,
    driverName: row.driver_name,
    driverPhone: row.driver_phone,
    capacityT: Number(row.capacity_t),
    containerSlots: Number(row.container_slots),
    status: row.status,
    statusLabel: VEHICLE_STATUS_LABELS[row.status],
    currentNode: row.node_name,
    lng: row.lng === null ? null : Number(row.lng),
    lat: row.lat === null ? null : Number(row.lat),
    lastSeenAt: row.last_seen_at,
  }));
  return pageResult(list, Number(totalRow?.total ?? 0), pager);
}

/** GET /api/capacity/trains */
export async function listTrains(query: Record<string, unknown>) {
  const pager = parsePage(query, 10, 100);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const status = optionalString(query.status);
  if (status) {
    conditions.push('t.status = ?');
    params.push(status);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM train_schedule t ${where}`,
    params,
  );
  const rows = await queryRows<{
    id: number;
    train_no: string;
    operator_name: string | null;
    origin_node: string | null;
    dest_node: string | null;
    departure_at: string;
    arrival_at: string;
    capacity_teu: number;
    booked_teu: number;
    status: ScheduleStatus;
    price_index: number;
  }>(
    `SELECT t.*, p.name AS operator_name, o.node_name AS origin_node, d.node_name AS dest_node
       FROM train_schedule t
       LEFT JOIN partner p ON p.id = t.operator_partner_id
       LEFT JOIN port_station o ON o.id = t.origin_node_id
       LEFT JOIN port_station d ON d.id = t.dest_node_id
       ${where}
      ORDER BY t.departure_at ASC, t.id ASC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  const list = rows.map((row) => {
    const capacity = Number(row.capacity_teu);
    const booked = Number(row.booked_teu);
    return {
      id: Number(row.id),
      trainNo: row.train_no,
      operatorName: row.operator_name,
      originNode: row.origin_node,
      destNode: row.dest_node,
      departureAt: row.departure_at,
      arrivalAt: row.arrival_at,
      capacityTeu: capacity,
      bookedTeu: booked,
      utilization: capacity > 0 ? round1((booked / capacity) * 100) : 0,
      status: row.status,
      statusLabel: SCHEDULE_STATUS_LABELS[row.status],
      priceIndex: Number(row.price_index),
    };
  });
  return pageResult(list, Number(totalRow?.total ?? 0), pager);
}

/** GET /api/capacity/vessels */
export async function listVessels(query: Record<string, unknown>) {
  const pager = parsePage(query, 10, 100);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const status = optionalString(query.status);
  if (status) {
    conditions.push('v.status = ?');
    params.push(status);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM vessel_schedule v ${where}`,
    params,
  );
  const rows = await queryRows<{
    id: number;
    vessel_name: string;
    voyage: string;
    carrier_name: string | null;
    origin_port: string | null;
    dest_port: string | null;
    etd: string;
    eta: string;
    capacity_teu: number;
    booked_teu: number;
    status: ScheduleStatus;
    price_index: number;
  }>(
    `SELECT v.*, p.name AS carrier_name, o.node_name AS origin_port, d.node_name AS dest_port
       FROM vessel_schedule v
       LEFT JOIN partner p ON p.id = v.carrier_partner_id
       LEFT JOIN port_station o ON o.id = v.origin_node_id
       LEFT JOIN port_station d ON d.id = v.dest_node_id
       ${where}
      ORDER BY v.etd ASC, v.id ASC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  const list = rows.map((row) => {
    const capacity = Number(row.capacity_teu);
    const booked = Number(row.booked_teu);
    return {
      id: Number(row.id),
      vesselName: row.vessel_name,
      voyage: row.voyage,
      carrierName: row.carrier_name,
      originPort: row.origin_port,
      destPort: row.dest_port,
      etd: row.etd,
      eta: row.eta,
      capacityTeu: capacity,
      bookedTeu: booked,
      utilization: capacity > 0 ? round1((booked / capacity) * 100) : 0,
      status: row.status,
      statusLabel: SCHEDULE_STATUS_LABELS[row.status],
      priceIndex: Number(row.price_index),
    };
  });
  return pageResult(list, Number(totalRow?.total ?? 0), pager);
}
