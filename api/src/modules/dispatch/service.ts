// 智能调度：三方案生成（COST/TIME/BALANCED）/ 列表 / 详情 / 确认签发 / 调度看板
import {
  MODE_LABELS,
  ORDER_STATUS_LABELS,
  PLAN_STATUS_LABELS,
  PLAN_STRATEGY_LABELS,
  TRANSFER_WINDOW_STATUS_LABELS,
  ALERT_LEVEL_LABELS,
  ALERT_TYPE_LABELS,
  VEHICLE_TYPE_LABELS,
} from '../../config/labels';
import { queryOne, queryRows, txExec, txQueryOne, txQueryRows, withTransaction } from '../../db/pool';
import { ApiError } from '../../errors';
import { writeAudit } from '../../middleware/audit';
import { ROAD_CARRIERS, SEA_SEGMENT, RAIL_SEGMENT, findRoadCarrier } from '../../mock/carriers';
import { getRouteNodes } from '../../mock/routes';
import { emitEvent } from '../../platform/eventBus';
import { appendNotarize } from '../../platform/notary';
import { nextDocNo } from '../../platform/sequence';
import type {
  AuthUser,
  DispatchPlanItemRow,
  DispatchPlanRow,
  OrderRow,
  PartnerRow,
  PlanStrategy,
  PortStationRow,
  RouteTemplateRow,
  ScheduleStatus,
  SegmentMode,
  SegmentRow,
  TrainScheduleRow,
  TransferWindowRow,
  VehicleRow,
  VesselScheduleRow,
} from '../../types';
import { formatDateTime, nowDate, todayCompact } from '../../utils/datetime';
import { parseJson, parseNumberArray, round1, round2 } from '../../utils/json';
import { getCapacitySummary } from '../capacity/service';
import { issueWaybillsForDispatch } from '../waybill/issueService';
import { optionalString, pageResult, parsePage } from '../shared/pagination';
import { dtoSegment } from '../../services/mappers';

const DISPATCHABLE = ['CREATED', 'CONTRACTED', 'CONFIRMED'];
const BASE_COST: Record<SegmentMode, number> = { ROAD: 1400, SEA: 5200, RAIL: 8600 };
const BASE_HOURS: Record<SegmentMode, number> = { ROAD: 6, SEA: 36, RAIL: 36 };
const MODE_RELIABILITY: Record<SegmentMode, number> = { ROAD: 96, SEA: 94, RAIL: 93 };
const STRATEGY_FACTORS: Record<PlanStrategy, { cost: number; hours: number; relPenalty: number }> = {
  COST: { cost: 0.94, hours: 1.15, relPenalty: 1.5 },
  TIME: { cost: 1.12, hours: 0.8, relPenalty: 6 },
  BALANCED: { cost: 1.03, hours: 0.95, relPenalty: 1 },
};
const STRATEGY_SUMMARY: Record<PlanStrategy, string> = {
  COST: '成本优先：选择价格指数最低的运力，成本最低',
  TIME: '时效优先：选择发运最快/在途最短的运力，总时长最短',
  BALANCED: '综合平衡：成本、时效与可靠度加权最优',
};

interface ResourceInfo {
  resourceType: 'VEHICLE' | 'TRAIN' | 'VESSEL';
  resourceId: number | null;
  resourceName: string;
  carrierPartnerId: number | null;
  carrierName: string;
  carrierCode: string;
  departureAt: string | null;
  baseHours: number;
  priceFactor: number;
}

interface PlanningContext {
  order: OrderRow;
  modes: SegmentMode[];
  nodes: PortStationRow[];
  nodeByName: Map<string, PortStationRow>;
  vehicles: Array<VehicleRow & { carrier_name: string | null }>;
  trains: Array<TrainScheduleRow & { operator_name: string | null }>;
  vessels: Array<VesselScheduleRow & { carrier_name: string | null }>;
  containerCount: number;
}

interface RawPlanItem {
  seq: number;
  mode: SegmentMode;
  carrierPartnerId: number | null;
  resourceType: 'VEHICLE' | 'TRAIN' | 'VESSEL';
  resourceId: number | null;
  startNodeId: number;
  endNodeId: number;
  startAt: string;
  endAt: string;
  cost: number;
  transitHours: number;
  reliability: number;
  // 展示用
  carrierName: string;
  resourceName: string;
  startNodeName: string;
  endNodeName: string;
}

interface RawWindow {
  nodeId: number;
  fromSeq: number;
  toSeq: number;
  arrivalAt: string;
  departureAt: string;
  waitHours: number;
  status: 'OK' | 'TIGHT' | 'MISSED';
  nodeName: string;
}

interface RawPlan {
  strategy: PlanStrategy;
  totalCost: number;
  totalHours: number;
  reliability: number;
  score: number;
  summary: string;
  items: RawPlanItem[];
  windows: RawWindow[];
}

function parseDateTime(value: string): number {
  return new Date(String(value).replace(' ', 'T')).getTime();
}

function formatFromMs(ms: number): string {
  return formatDateTime(new Date(ms));
}

function hoursBetween(from: string, to: string): number {
  const diff = parseDateTime(to) - parseDateTime(from);
  return round1(Math.max(0, diff / 3600000));
}

async function loadPlanningContext(orderId: number): Promise<PlanningContext> {
  const order = await queryOne<OrderRow>('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!order) {
    throw new ApiError(40401, '订单不存在');
  }
  let route: RouteTemplateRow | null = null;
  if (order.route_template_id) {
    route = await queryOne<RouteTemplateRow>('SELECT * FROM route_template WHERE id = ?', [
      order.route_template_id,
    ]);
  }
  if (!route) {
    route = await queryOne<RouteTemplateRow>(
      "SELECT * FROM route_template WHERE status = 'ACTIVE' ORDER BY id ASC LIMIT 1",
    );
  }
  const modesRaw = route ? parseJson<unknown>(route.modes, []) : [];
  const modes = (Array.isArray(modesRaw) ? modesRaw.map((item) => String(item)) : []).filter(
    (mode): mode is SegmentMode => mode === 'ROAD' || mode === 'SEA' || mode === 'RAIL',
  );
  const effectiveModes: SegmentMode[] = modes.length > 0 ? modes : ['ROAD', 'SEA', 'RAIL'];

  const nodes: PortStationRow[] = [];
  if (route) {
    const ids = [Number(route.origin_node_id), ...parseNumberArray(route.transit_node_ids), Number(route.destination_node_id)];
    if (ids.length > 0) {
      const rows = await queryRows<PortStationRow>('SELECT * FROM port_station WHERE id IN (?) ORDER BY id ASC', [
        ids,
      ]);
      const byId = new Map(rows.map((row) => [Number(row.id), row]));
      for (const id of ids) {
        const row = byId.get(Number(id));
        if (row) nodes.push(row);
      }
    }
  }
  const nodeByName = new Map<string, PortStationRow>();
  for (const node of nodes) nodeByName.set(node.node_name, node);
  for (const mode of effectiveModes) {
    for (const node of getRouteNodes(mode)) {
      if (!nodeByName.has(node.name)) {
        const row = await queryOne<PortStationRow>('SELECT * FROM port_station WHERE node_name = ? LIMIT 1', [
          node.name,
        ]);
        if (row) nodeByName.set(node.name, row);
      }
    }
  }

  const vehicles = await queryRows<VehicleRow & { carrier_name: string | null }>(
    `SELECT v.*, p.name AS carrier_name FROM vehicle v LEFT JOIN partner p ON p.id = v.carrier_partner_id
      WHERE v.status = 'IDLE' ORDER BY v.id ASC`,
  );
  const trains = await queryRows<TrainScheduleRow & { operator_name: string | null }>(
    `SELECT t.*, p.name AS operator_name FROM train_schedule t LEFT JOIN partner p ON p.id = t.operator_partner_id
      WHERE t.status IN ('OPEN', 'PLANNED') ORDER BY t.departure_at ASC, t.id ASC`,
  );
  const vessels = await queryRows<VesselScheduleRow & { carrier_name: string | null }>(
    `SELECT v.*, p.name AS carrier_name FROM vessel_schedule v LEFT JOIN partner p ON p.id = v.carrier_partner_id
      WHERE v.status IN ('OPEN', 'PLANNED') ORDER BY v.etd ASC, v.id ASC`,
  );

  return {
    order,
    modes: effectiveModes,
    nodes,
    nodeByName,
    vehicles,
    trains,
    vessels,
    containerCount: Number(order.container_count) || 1,
  };
}

function nodeForMode(ctx: PlanningContext, mode: SegmentMode, index: number, modeCount: number) {
  const pick = (name: string, fallbackIndex: number) => {
    const row = ctx.nodeByName.get(name);
    if (row) return row;
    if (ctx.nodes.length > 0) return ctx.nodes[Math.min(Math.max(fallbackIndex, 0), ctx.nodes.length - 1)];
    return null;
  };
  const routeNodes = getRouteNodes(mode);
  const fallbackStart = routeNodes[0];
  const fallbackEnd = routeNodes[routeNodes.length - 1];
  let start: PortStationRow | null = null;
  let end: PortStationRow | null = null;
  if (ctx.nodes.length >= 2) {
    let startIdx: number;
    let endIdx: number;
    if (modeCount <= 1) {
      startIdx = 0;
      endIdx = ctx.nodes.length - 1;
    } else if (index === 0) {
      startIdx = 0;
      endIdx = 1;
    } else if (index === modeCount - 1) {
      startIdx = Math.max(0, ctx.nodes.length - 2);
      endIdx = ctx.nodes.length - 1;
    } else {
      startIdx = Math.min(index, ctx.nodes.length - 2);
      endIdx = Math.min(index + 1, ctx.nodes.length - 1);
    }
    if (startIdx < endIdx) {
      start = ctx.nodes[startIdx];
      end = ctx.nodes[endIdx];
    }
  }
  if (!start) start = pick(fallbackStart.name, 0);
  if (!end) end = pick(fallbackEnd.name, ctx.nodes.length - 1);
  return {
    startId: start ? Number(start.id) : 0,
    startName: start ? start.node_name : fallbackStart.name,
    endId: end ? Number(end.id) : 0,
    endName: end ? end.node_name : fallbackEnd.name,
  };
}

function pickVehicle(vehicles: PlanningContext['vehicles'], strategy: PlanStrategy) {
  if (vehicles.length === 0) return null;
  if (strategy === 'TIME') return vehicles[vehicles.length - 1];
  if (strategy === 'BALANCED') return vehicles[Math.floor(vehicles.length / 2)];
  return vehicles[0];
}

function pickTrain(trains: PlanningContext['trains'], strategy: PlanStrategy) {
  if (trains.length === 0) return null;
  const sorted = [...trains];
  if (strategy === 'COST') {
    sorted.sort((a, b) => Number(a.price_index) - Number(b.price_index) || parseDateTime(a.departure_at) - parseDateTime(b.departure_at));
    return sorted[0];
  }
  if (strategy === 'TIME') {
    return trains[0];
  }
  sorted.sort((a, b) => parseDateTime(a.departure_at) - parseDateTime(b.departure_at));
  return sorted[Math.min(1, sorted.length - 1)];
}

function pickVessel(vessels: PlanningContext['vessels'], strategy: PlanStrategy) {
  if (vessels.length === 0) return null;
  const sorted = [...vessels];
  if (strategy === 'COST') {
    sorted.sort((a, b) => Number(a.price_index) - Number(b.price_index) || parseDateTime(a.etd) - parseDateTime(b.etd));
    return sorted[0];
  }
  if (strategy === 'TIME') {
    return vessels[0];
  }
  sorted.sort((a, b) => parseDateTime(a.etd) - parseDateTime(b.etd));
  return sorted[Math.min(1, sorted.length - 1)];
}

function resolveResource(ctx: PlanningContext, mode: SegmentMode, strategy: PlanStrategy): ResourceInfo {
  if (mode === 'ROAD') {
    const vehicle = pickVehicle(ctx.vehicles, strategy);
    const roadCarrier = ROAD_CARRIERS.find((carrier) => carrier.name === vehicle?.carrier_name) ?? ROAD_CARRIERS[0];
    return {
      resourceType: 'VEHICLE',
      resourceId: vehicle ? Number(vehicle.id) : null,
      resourceName: vehicle
        ? `${vehicle.plate_no}（${vehicle.container_slots} 槽 ${VEHICLE_TYPE_LABELS[vehicle.vehicle_type]}）`
        : '沪A·D1234（40HQ 集卡）',
      carrierPartnerId: vehicle ? Number(vehicle.carrier_partner_id) : null,
      carrierName: vehicle?.carrier_name ?? roadCarrier.name,
      carrierCode: findRoadCarrier(roadCarrier.code)?.code ?? 'AJ-001',
      departureAt: null,
      baseHours: BASE_HOURS.ROAD,
      priceFactor: 1,
    };
  }
  if (mode === 'SEA') {
    const vessel = pickVessel(ctx.vessels, strategy);
    const baseHours = vessel
      ? Math.max(1, round1((parseDateTime(vessel.eta) - parseDateTime(vessel.etd)) / 3600000))
      : BASE_HOURS.SEA;
    return {
      resourceType: 'VESSEL',
      resourceId: vessel ? Number(vessel.id) : null,
      resourceName: vessel ? `${vessel.vessel_name} / ${vessel.voyage}` : 'COSCO SHIPPING / 2026E',
      carrierPartnerId: vessel ? Number(vessel.carrier_partner_id) : null,
      carrierName: vessel?.carrier_name ?? SEA_SEGMENT.carrierName,
      carrierCode: SEA_SEGMENT.carrierCode,
      departureAt: vessel ? vessel.etd : null,
      baseHours,
      priceFactor: vessel ? Number(vessel.price_index) / 100 : 1,
    };
  }
  const train = pickTrain(ctx.trains, strategy);
  const baseHours = train
    ? Math.max(1, round1((parseDateTime(train.arrival_at) - parseDateTime(train.departure_at)) / 3600000))
    : BASE_HOURS.RAIL;
  return {
    resourceType: 'TRAIN',
    resourceId: train ? Number(train.id) : null,
    resourceName: train ? `${train.train_no} 班列` : 'X8021 班列',
    carrierPartnerId: train ? Number(train.operator_partner_id) : null,
    carrierName: train?.operator_name ?? RAIL_SEGMENT.carrierName,
    carrierCode: RAIL_SEGMENT.carrierCode,
    departureAt: train ? train.departure_at : null,
    baseHours,
    priceFactor: train ? Number(train.price_index) / 100 : 1,
  };
}

function buildRawPlan(ctx: PlanningContext, strategy: PlanStrategy): RawPlan {
  const factors = STRATEGY_FACTORS[strategy];
  const items: RawPlanItem[] = [];
  let cursor = Date.now() + 2 * 3600000;
  let totalCost = 0;
  let totalHours = 0;
  let reliabilitySum = 0;

  for (let index = 0; index < ctx.modes.length; index += 1) {
    const mode = ctx.modes[index];
    const resource = resolveResource(ctx, mode, strategy);
    const nodes = nodeForMode(ctx, mode, index, ctx.modes.length);
    let startMs = cursor;
    if (resource.departureAt) {
      const departureMs = parseDateTime(resource.departureAt);
      if (Number.isFinite(departureMs) && departureMs > startMs) startMs = departureMs;
    }
    const transitHours = Math.max(1, round1(resource.baseHours * factors.hours));
    const endMs = startMs + transitHours * 3600000;
    const cost = round2(BASE_COST[mode] * ctx.containerCount * resource.priceFactor * factors.cost);
    const reliability = round2(MODE_RELIABILITY[mode] - factors.relPenalty);
    items.push({
      seq: index + 1,
      mode,
      carrierPartnerId: resource.carrierPartnerId,
      resourceType: resource.resourceType,
      resourceId: resource.resourceId,
      startNodeId: nodes.startId,
      endNodeId: nodes.endId,
      startAt: formatFromMs(startMs),
      endAt: formatFromMs(endMs),
      cost,
      transitHours,
      reliability,
      carrierName: resource.carrierName,
      resourceName: resource.resourceName,
      startNodeName: nodes.startName,
      endNodeName: nodes.endName,
    });
    totalCost += cost;
    totalHours += transitHours;
    reliabilitySum += reliability;
    cursor = endMs;
  }

  const windows: RawWindow[] = [];
  for (let index = 1; index < items.length; index += 1) {
    const prev = items[index - 1];
    const next = items[index];
    const waitHours = round1(
      Math.max(0, (parseDateTime(next.startAt) - parseDateTime(prev.endAt)) / 3600000),
    );
    const status = waitHours >= 2 ? 'OK' : 'TIGHT';
    windows.push({
      nodeId: next.startNodeId || prev.endNodeId,
      fromSeq: prev.seq,
      toSeq: next.seq,
      arrivalAt: prev.endAt,
      departureAt: next.startAt,
      waitHours,
      status,
      nodeName: next.startNodeName,
    });
  }

  return {
    strategy,
    totalCost: round2(totalCost),
    totalHours: round1(totalHours),
    reliability: items.length > 0 ? round2(reliabilitySum / items.length) : 0,
    score: 0,
    summary: STRATEGY_SUMMARY[strategy],
    items,
    windows,
  };
}

function scorePlans(plans: RawPlan[]): void {
  const costs = plans.map((plan) => plan.totalCost);
  const hours = plans.map((plan) => plan.totalHours);
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  const minHours = Math.min(...hours);
  const maxHours = Math.max(...hours);
  for (const plan of plans) {
    const costNorm = maxCost > minCost ? (plan.totalCost - minCost) / (maxCost - minCost) : 0;
    const hoursNorm = maxHours > minHours ? (plan.totalHours - minHours) / (maxHours - minHours) : 0;
    plan.score = round2(
      Math.min(100, Math.max(0, 100 - costNorm * 40 - hoursNorm * 40 + plan.reliability * 0.2)),
    );
  }
}

interface PersistedPlan {
  id: number;
  planNo: string;
}

async function persistPlan(
  conn: import('mysql2/promise').PoolConnection,
  orderId: number,
  userId: number,
  plan: RawPlan,
): Promise<PersistedPlan> {
  const planNo = await nextDocNo(conn, {
    table: 'dispatch_plan',
    column: 'plan_no',
    prefix: `DP${todayCompact()}`,
    width: 4,
  });
  const at = formatDateTime(nowDate());
  const inserted = await txExec(
    conn,
    `INSERT INTO dispatch_plan (plan_no, order_id, strategy, total_cost, total_hours, reliability, score, status, summary, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)`,
    [planNo, orderId, plan.strategy, plan.totalCost, plan.totalHours, plan.reliability, plan.score, plan.summary, userId, at],
  );
  const planId = Number(inserted.insertId);
  for (const item of plan.items) {
    await txExec(
      conn,
      `INSERT INTO dispatch_plan_item (plan_id, seq, mode, carrier_partner_id, resource_type, resource_id,
         start_node_id, end_node_id, start_at, end_at, cost, transit_hours, reliability)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        planId,
        item.seq,
        item.mode,
        item.carrierPartnerId,
        item.resourceType,
        item.resourceId,
        item.startNodeId,
        item.endNodeId,
        item.startAt,
        item.endAt,
        item.cost,
        item.transitHours,
        item.reliability,
      ],
    );
  }
  for (const window of plan.windows) {
    await txExec(
      conn,
      `INSERT INTO transfer_window (plan_id, node_id, from_seq, to_seq, arrival_at, departure_at, wait_hours, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [planId, window.nodeId, window.fromSeq, window.toSeq, window.arrivalAt, window.departureAt, window.waitHours, window.status],
    );
  }
  return { id: planId, planNo };
}

/** POST /api/dispatch/plans/generate：生成三套方案 */
export async function generatePlans(orderId: number, user: AuthUser, ip: string | null) {
  const ctx = await loadPlanningContext(orderId);
  if (!DISPATCHABLE.includes(ctx.order.status)) {
    throw new ApiError(40901, `当前订单状态（${ORDER_STATUS_LABELS[ctx.order.status]}）不允许生成调度方案`);
  }
  const rawPlans: RawPlan[] = (['COST', 'TIME', 'BALANCED'] as PlanStrategy[]).map((strategy) =>
    buildRawPlan(ctx, strategy),
  );
  scorePlans(rawPlans);

  const created = await withTransaction(async (conn) => {
    const order = await txQueryOne<OrderRow>(conn, 'SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (!order) {
      throw new ApiError(40401, '订单不存在');
    }
    if (!DISPATCHABLE.includes(order.status)) {
      throw new ApiError(40901, `当前订单状态（${ORDER_STATUS_LABELS[order.status]}）不允许生成调度方案`);
    }
    // 旧 DRAFT 方案作废
    await txExec(conn, "UPDATE dispatch_plan SET status = 'REJECTED' WHERE order_id = ? AND status = 'DRAFT'", [
      orderId,
    ]);
    const persisted: Array<PersistedPlan & { strategy: PlanStrategy }> = [];
    for (const plan of rawPlans) {
      const row = await persistPlan(conn, orderId, user.uid, plan);
      persisted.push({ ...row, strategy: plan.strategy });
    }
    await writeAudit(conn, {
      user,
      action: 'DISPATCH_PLAN_GENERATE',
      actionLabel: '生成调度方案',
      module: 'dispatch',
      targetType: 'ORDER',
      targetId: orderId,
      detail: { orderNo: order.order_no, plans: persisted.map((plan) => plan.planNo) },
      ip,
    });
    return { persisted, order };
  });

  const plans = [];
  for (const plan of created.persisted) {
    plans.push(await getPlanDetail(plan.id));
  }
  return {
    order: {
      id: Number(created.order.id),
      orderNo: created.order.order_no,
      status: created.order.status,
      statusLabel: ORDER_STATUS_LABELS[created.order.status],
    },
    plans,
  };
}

interface PlanJoinedRow extends DispatchPlanRow {
  order_no: string;
}

const PLAN_JOINED_SELECT = `
  SELECT p.*, o.order_no
    FROM dispatch_plan p
    JOIN orders o ON o.id = p.order_id`;

interface PlanItemJoinedRow extends DispatchPlanItemRow {
  carrier_name: string | null;
  start_node: string | null;
  end_node: string | null;
}

function planItemDto(row: PlanItemJoinedRow) {
  return {
    id: Number(row.id),
    seq: Number(row.seq),
    mode: row.mode,
    modeLabel: MODE_LABELS[row.mode],
    carrierName: row.carrier_name,
    resourceType: row.resource_type,
    resourceId: row.resource_id === null ? null : Number(row.resource_id),
    resourceName: null as string | null,
    startNode: row.start_node,
    endNode: row.end_node,
    startAt: row.start_at,
    endAt: row.end_at,
    cost: Number(row.cost),
    transitHours: Number(row.transit_hours),
    reliability: Number(row.reliability),
  };
}

async function planItems(planId: number) {
  const rows = await queryRows<PlanItemJoinedRow>(
    `SELECT i.*, p.name AS carrier_name, s.node_name AS start_node, e.node_name AS end_node
       FROM dispatch_plan_item i
       LEFT JOIN partner p ON p.id = i.carrier_partner_id
       LEFT JOIN port_station s ON s.id = i.start_node_id
       LEFT JOIN port_station e ON e.id = i.end_node_id
      WHERE i.plan_id = ? ORDER BY i.seq ASC`,
    [planId],
  );
  return rows.map(planItemDto);
}

async function planWindows(planId: number) {
  const rows = await queryRows<TransferWindowRow & { node_name: string | null }>(
    `SELECT w.*, n.node_name FROM transfer_window w LEFT JOIN port_station n ON n.id = w.node_id
      WHERE w.plan_id = ? ORDER BY w.from_seq ASC`,
    [planId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    nodeName: row.node_name,
    fromSeq: Number(row.from_seq),
    toSeq: Number(row.to_seq),
    arrivalAt: row.arrival_at,
    departureAt: row.departure_at,
    waitHours: Number(row.wait_hours),
    status: row.status,
    statusLabel: TRANSFER_WINDOW_STATUS_LABELS[row.status],
  }));
}

async function resolveResourceNames(items: Array<{ resourceType: string; resourceId: number | null; mode: SegmentMode }>) {
  // 资源名称回填（车辆/班列/班轮）
  const names = new Map<string, string>();
  for (const item of items) {
    if (!item.resourceId) continue;
    const key = `${item.resourceType}:${item.resourceId}`;
    if (names.has(key)) continue;
    if (item.resourceType === 'VEHICLE') {
      const row = await queryOne<{ plate_no: string; container_slots: number; vehicle_type: string }>(
        'SELECT plate_no, container_slots, vehicle_type FROM vehicle WHERE id = ?',
        [item.resourceId],
      );
      if (row) names.set(key, `${row.plate_no}（${row.container_slots} 槽）`);
    } else if (item.resourceType === 'TRAIN') {
      const row = await queryOne<{ train_no: string }>('SELECT train_no FROM train_schedule WHERE id = ?', [
        item.resourceId,
      ]);
      if (row) names.set(key, `${row.train_no} 班列`);
    } else {
      const row = await queryOne<{ vessel_name: string; voyage: string }>(
        'SELECT vessel_name, voyage FROM vessel_schedule WHERE id = ?',
        [item.resourceId],
      );
      if (row) names.set(key, `${row.vessel_name} / ${row.voyage}`);
    }
  }
  return names;
}

/** GET /api/dispatch/plans/:id：方案详情 */
export async function getPlanDetail(id: number) {
  const plan = await queryOne<PlanJoinedRow>(`${PLAN_JOINED_SELECT} WHERE p.id = ?`, [id]);
  if (!plan) {
    throw new ApiError(40401, '调度方案不存在');
  }
  const order = await queryOne<OrderRow>('SELECT * FROM orders WHERE id = ?', [plan.order_id]);
  const items = await planItems(id);
  const resourceNames = await resolveResourceNames(
    items.map((item) => ({
      resourceType: item.resourceType,
      resourceId: item.resourceId,
      mode: item.mode,
    })),
  );
  const itemsWithResource = items.map((item) => {
    const key = item.resourceId === null ? '' : `${item.resourceType}:${item.resourceId}`;
    const fallback =
      item.mode === 'ROAD'
        ? '沪A·D1234（40HQ 集卡）'
        : item.mode === 'SEA'
          ? 'COSCO SHIPPING / 2026E'
          : 'X8021 班列';
    return { ...item, resourceName: resourceNames.get(key) ?? fallback };
  });
  const windows = await planWindows(id);
  return {
    id: Number(plan.id),
    planNo: plan.plan_no,
    planNoLabel: plan.plan_no,
    orderId: Number(plan.order_id),
    orderNo: plan.order_no,
    waybillId: plan.waybill_id === null ? null : Number(plan.waybill_id),
    strategy: plan.strategy,
    strategyLabel: PLAN_STRATEGY_LABELS[plan.strategy],
    totalCost: Number(plan.total_cost),
    totalHours: Number(plan.total_hours),
    reliability: Number(plan.reliability),
    score: Number(plan.score),
    status: plan.status,
    statusLabel: PLAN_STATUS_LABELS[plan.status],
    summary: plan.summary,
    createdAt: plan.created_at,
    confirmedAt: plan.confirmed_at,
    order: order
      ? {
          id: Number(order.id),
          orderNo: order.order_no,
          status: order.status,
          statusLabel: ORDER_STATUS_LABELS[order.status],
          cargoName: order.cargo_name,
          containerType: order.container_type,
          containerCount: Number(order.container_count),
          origin: order.origin,
          destination: order.destination,
        }
      : null,
    items: itemsWithResource,
    transferWindows: windows,
  };
}

/** GET /api/dispatch/plans：分页列表 */
export async function listPlans(query: Record<string, unknown>) {
  const pager = parsePage(query, 10);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const orderId = optionalString(query.orderId);
  const strategy = optionalString(query.strategy);
  const status = optionalString(query.status);
  if (orderId) {
    conditions.push('p.order_id = ?');
    params.push(Number(orderId));
  }
  if (strategy) {
    conditions.push('p.strategy = ?');
    params.push(strategy);
  }
  if (status) {
    conditions.push('p.status = ?');
    params.push(status);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM dispatch_plan p ${where}`,
    params,
  );
  const rows = await queryRows<PlanJoinedRow>(
    `${PLAN_JOINED_SELECT} ${where} ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  const list = rows.map((row) => ({
    id: Number(row.id),
    planNo: row.plan_no,
    orderId: Number(row.order_id),
    orderNo: row.order_no,
    strategy: row.strategy,
    strategyLabel: PLAN_STRATEGY_LABELS[row.strategy],
    totalCost: Number(row.total_cost),
    totalHours: Number(row.total_hours),
    reliability: Number(row.reliability),
    score: Number(row.score),
    status: row.status,
    statusLabel: PLAN_STATUS_LABELS[row.status],
    createdAt: row.created_at,
  }));
  return pageResult(list, Number(totalRow?.total ?? 0), pager);
}

async function modeCarrierInfo(mode: SegmentMode, partnerId: number | null) {
  const partner = partnerId
    ? await queryOne<PartnerRow>('SELECT * FROM partner WHERE id = ?', [partnerId])
    : null;
  if (mode === 'ROAD') {
    const mock = ROAD_CARRIERS.find((carrier) => carrier.name === partner?.name) ?? ROAD_CARRIERS[0];
    return { carrierCode: mock.code, carrierName: partner?.name ?? mock.name, price: mock.price };
  }
  if (mode === 'SEA') {
    return {
      carrierCode: SEA_SEGMENT.carrierCode,
      carrierName: partner?.name ?? SEA_SEGMENT.carrierName,
      price: SEA_SEGMENT.costAmount,
    };
  }
  return {
    carrierCode: RAIL_SEGMENT.carrierCode,
    carrierName: partner?.name ?? RAIL_SEGMENT.carrierName,
    price: RAIL_SEGMENT.costAmount,
  };
}

/** POST /api/dispatch/plans/:id/confirm：确认方案并按方案签发运单/分段 */
export async function confirmPlan(id: number, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const plan = await txQueryOne<DispatchPlanRow>(conn, 'SELECT * FROM dispatch_plan WHERE id = ? FOR UPDATE', [
      id,
    ]);
    if (!plan) {
      throw new ApiError(40401, '调度方案不存在');
    }
    if (plan.status === 'CONFIRMED') {
      throw new ApiError(40902, '该方案已确认，请勿重复操作');
    }
    if (plan.status !== 'DRAFT') {
      throw new ApiError(40901, `当前方案状态（${PLAN_STATUS_LABELS[plan.status]}）不允许确认`);
    }
    const order = await txQueryOne<OrderRow>(conn, 'SELECT * FROM orders WHERE id = ? FOR UPDATE', [
      plan.order_id,
    ]);
    if (!order) {
      throw new ApiError(40401, '订单不存在');
    }
    if (!DISPATCHABLE.includes(order.status)) {
      throw new ApiError(40901, `当前订单状态（${ORDER_STATUS_LABELS[order.status]}）不允许调度`);
    }
    const existingWaybill = await txQueryOne<{ id: number }>(
      conn,
      'SELECT id FROM waybill WHERE order_id = ? LIMIT 1',
      [order.id],
    );
    if (existingWaybill) {
      throw new ApiError(40902, '该订单已签发运单，请勿重复调度');
    }
    const items = await txQueryRows<DispatchPlanItemRow>(
      conn,
      'SELECT * FROM dispatch_plan_item WHERE plan_id = ? ORDER BY seq ASC',
      [id],
    );
    if (items.length === 0) {
      throw new ApiError(42201, '调度方案缺少分段明细');
    }
    const carrierUser = await txQueryOne<{ id: number }>(
      conn,
      "SELECT id FROM user WHERE role = 'CARRIER' ORDER BY id ASC LIMIT 1",
    );
    const at = formatDateTime(nowDate());
    const waybillNo = await nextDocNo(conn, {
      table: 'waybill',
      column: 'waybill_no',
      prefix: `WB${todayCompact()}`,
      width: 5,
    });
    const waybillInsert = await txExec(
      conn,
      `INSERT INTO waybill (waybill_no, order_id, status, created_at, updated_at)
       VALUES (?, ?, 'PENDING', ?, ?)`,
      [waybillNo, order.id, at, at],
    );
    const waybillId = Number(waybillInsert.insertId);

    const partnerCache = new Map<number, PartnerRow | null>();
    for (const item of items) {
      const partnerId = item.carrier_partner_id === null ? null : Number(item.carrier_partner_id);
      let partner: PartnerRow | null = null;
      if (partnerId) {
        if (partnerCache.has(partnerId)) {
          partner = partnerCache.get(partnerId) ?? null;
        } else {
          partner = await txQueryOne<PartnerRow>(conn, 'SELECT * FROM partner WHERE id = ?', [partnerId]);
          partnerCache.set(partnerId, partner);
        }
      }
      const carrier = await modeCarrierInfo(item.mode as SegmentMode, partnerId);
      const startNode = await txQueryOne<PortStationRow>(conn, 'SELECT * FROM port_station WHERE id = ?', [
        item.start_node_id,
      ]);
      const endNode = await txQueryOne<PortStationRow>(conn, 'SELECT * FROM port_station WHERE id = ?', [
        item.end_node_id,
      ]);
      await txExec(
        conn,
        `INSERT INTO waybill_segment (waybill_id, seq, mode, carrier_code, carrier_name, carrier_user_id,
           start_node, end_node, planned_start, planned_end, status, cost_amount, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
        [
          waybillId,
          Number(item.seq),
          item.mode,
          carrier.carrierCode,
          carrier.carrierName,
          item.mode === 'ROAD' && carrierUser ? Number(carrierUser.id) : null,
          startNode?.node_name ?? '',
          endNode?.node_name ?? '',
          item.start_at,
          item.end_at,
          Number(item.cost),
          at,
          at,
        ],
      );
    }

    await txExec(conn, 'UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', ['DISPATCHED', at, order.id]);
    await txExec(
      conn,
      "UPDATE dispatch_plan SET status = 'CONFIRMED', waybill_id = ?, confirmed_at = ? WHERE id = ?",
      [waybillId, at, id],
    );
    await txExec(
      conn,
      "UPDATE dispatch_plan SET status = 'REJECTED' WHERE order_id = ? AND id <> ? AND status = 'DRAFT'",
      [order.id, id],
    );

    const containers = await txQueryRows<import('../../types').ContainerRow>(
      conn,
      'SELECT * FROM container WHERE order_id = ? ORDER BY id ASC',
      [order.id],
    );
    const segments = await txQueryRows<SegmentRow>(
      conn,
      'SELECT * FROM waybill_segment WHERE waybill_id = ? ORDER BY seq ASC',
      [waybillId],
    );
    const master = await txQueryOne<import('../../types').WaybillRow>(
      conn,
      'SELECT * FROM waybill WHERE id = ?',
      [waybillId],
    );
    if (!master) {
      throw new ApiError(50000, '运单创建后读取失败');
    }
    await issueWaybillsForDispatch(conn, { master, order, segments, containers, user });

    // 方案确认存证（ORDER 域）
    await appendNotarize(conn, {
      bizType: 'ORDER',
      bizId: Number(order.id),
      eventType: 'DISPATCH_CONFIRM',
      payload: { planNo: plan.plan_no, strategy: plan.strategy, orderNo: order.order_no, waybillNo },
    });

    await emitEvent(conn, {
      eventType: 'order.dispatched',
      aggregateType: 'ORDER',
      aggregateId: Number(order.id),
      payload: {
        orderId: Number(order.id),
        orderNo: order.order_no,
        waybillId,
        waybillNo,
        carrierUserId: carrierUser ? Number(carrierUser.id) : null,
        containerType: order.container_type,
        containerCount: Number(order.container_count),
        cargoName: order.cargo_name,
        requiredPickupDate: order.required_pickup_date,
        customerId: order.customer_id === null ? null : Number(order.customer_id),
        planNo: plan.plan_no,
        dispatchedAt: at,
      },
    });

    await writeAudit(conn, {
      user,
      action: 'ORDER_DISPATCH',
      actionLabel: '方案确认调度',
      module: 'dispatch',
      targetType: 'ORDER',
      targetId: Number(order.id),
      detail: { orderNo: order.order_no, planNo: plan.plan_no, waybillNo, strategy: plan.strategy },
      ip,
    });

    return {
      planId: Number(plan.id),
      planNo: plan.plan_no,
      orderId: Number(order.id),
      waybillId,
      waybillNo,
      segments: segments.map(dtoSegment),
    };
  });
}

/** GET /api/dispatch/board：调度看板聚合 */
export async function getDispatchBoard() {
  const pendingOrders = await queryRows<{
    id: number;
    order_no: string;
    status: string;
    cargo_name: string;
    customer_name: string | null;
  }>(
    `SELECT o.id, o.order_no, o.status, o.cargo_name, c.name AS customer_name
       FROM orders o LEFT JOIN customer c ON c.id = o.customer_id
      WHERE o.status IN ('CREATED', 'CONTRACTED', 'CONFIRMED')
      ORDER BY o.created_at DESC, o.id DESC LIMIT 10`,
  );
  const capacity = await getCapacitySummary();
  const upcomingTrains = await queryRows<{
    train_no: string;
    origin_node: string | null;
    dest_node: string | null;
    departure_at: string;
    booked_teu: number;
    capacity_teu: number;
  }>(
    `SELECT t.train_no, o.node_name AS origin_node, d.node_name AS dest_node, t.departure_at, t.booked_teu, t.capacity_teu
       FROM train_schedule t
       LEFT JOIN port_station o ON o.id = t.origin_node_id
       LEFT JOIN port_station d ON d.id = t.dest_node_id
      WHERE t.status IN ('OPEN', 'PLANNED')
      ORDER BY t.departure_at ASC LIMIT 5`,
  );
  const upcomingVessels = await queryRows<{
    vessel_name: string;
    voyage: string;
    origin_port: string | null;
    dest_port: string | null;
    etd: string;
  }>(
    `SELECT v.vessel_name, v.voyage, o.node_name AS origin_port, d.node_name AS dest_port, v.etd
       FROM vessel_schedule v
       LEFT JOIN port_station o ON o.id = v.origin_node_id
       LEFT JOIN port_station d ON d.id = v.dest_node_id
      WHERE v.status IN ('OPEN', 'PLANNED')
      ORDER BY v.etd ASC LIMIT 5`,
  );
  const windows = await queryRows<{
    plan_no: string;
    node_name: string | null;
    wait_hours: number;
    status: 'OK' | 'TIGHT' | 'MISSED';
  }>(
    `SELECT p.plan_no, n.node_name, w.wait_hours, w.status
       FROM transfer_window w
       JOIN dispatch_plan p ON p.id = w.plan_id
       LEFT JOIN port_station n ON n.id = w.node_id
      WHERE p.status IN ('DRAFT', 'CONFIRMED')
      ORDER BY p.created_at DESC, w.from_seq ASC LIMIT 10`,
  );
  const alerts = await queryRows<{
    id: number;
    alert_type: keyof typeof ALERT_TYPE_LABELS;
    level: keyof typeof ALERT_LEVEL_LABELS;
    title: string;
  }>(
    "SELECT id, alert_type, level, title FROM alert WHERE status = 'OPEN' ORDER BY occurred_at DESC LIMIT 5",
  );

  return {
    pendingOrders: pendingOrders.map((row) => ({
      id: Number(row.id),
      orderNo: row.order_no,
      status: row.status,
      statusLabel: ORDER_STATUS_LABELS[row.status as keyof typeof ORDER_STATUS_LABELS] ?? row.status,
      cargoName: row.cargo_name,
      customerName: row.customer_name,
    })),
    capacity,
    upcomingTrains: upcomingTrains.map((row) => ({
      trainNo: row.train_no,
      route: `${row.origin_node ?? ''} → ${row.dest_node ?? ''}`,
      departureAt: row.departure_at,
      bookedTeu: Number(row.booked_teu),
      capacityTeu: Number(row.capacity_teu),
    })),
    upcomingVessels: upcomingVessels.map((row) => ({
      vesselName: row.vessel_name,
      voyage: row.voyage,
      route: `${row.origin_port ?? ''} → ${row.dest_port ?? ''}`,
      etd: row.etd,
    })),
    transferWindows: windows.map((row) => ({
      planNo: row.plan_no,
      nodeName: row.node_name,
      waitHours: Number(row.wait_hours),
      status: row.status,
      statusLabel: TRANSFER_WINDOW_STATUS_LABELS[row.status],
    })),
    alerts: alerts.map((row) => ({
      id: Number(row.id),
      alertType: row.alert_type,
      alertTypeLabel: ALERT_TYPE_LABELS[row.alert_type],
      level: row.level,
      levelLabel: ALERT_LEVEL_LABELS[row.level],
      title: row.title,
    })),
  };
}

export { hoursBetween };
