// 总览看板：KPI / 状态分布 / 模式分布 / 最近订单 / 待办 / 集成健康度 / 趋势
import { ORDER_STATUS_LABELS, ORDER_STATUS_ORDER } from '../../config/labels';
import { queryOne, queryRows } from '../../db/pool';
import type { AuthUser, OrderStatus } from '../../types';
import { formatDate } from '../../utils/datetime';
import { round1, round2 } from '../../utils/json';
import { orderScopeForRole, type SqlScope } from '../shared/scope';

interface KpiRow {
  ordersTotal: number;
  inTransit: number;
  pendingDispatch: number;
  signed: number;
  billed: number;
  revenue: number;
}

async function kpiOf(scope: SqlScope): Promise<KpiRow> {
  const row = await queryOne<KpiRow>(
    `SELECT COUNT(*) AS ordersTotal,
            COALESCE(SUM(o.status = 'IN_TRANSIT'), 0) AS inTransit,
            COALESCE(SUM(o.status IN ('CREATED', 'CONTRACTED', 'CONFIRMED')), 0) AS pendingDispatch,
            COALESCE(SUM(o.status = 'SIGNED'), 0) AS signed,
            COALESCE(SUM(o.status = 'BILLED'), 0) AS billed,
            COALESCE(SUM(CASE WHEN o.status = 'BILLED' THEN o.total_amount ELSE 0 END), 0) AS revenue
       FROM orders o
      WHERE ${scope.where}`,
    scope.params,
  );
  return {
    ordersTotal: Number(row?.ordersTotal ?? 0),
    inTransit: Number(row?.inTransit ?? 0),
    pendingDispatch: Number(row?.pendingDispatch ?? 0),
    signed: Number(row?.signed ?? 0),
    billed: Number(row?.billed ?? 0),
    revenue: round2(Number(row?.revenue ?? 0)),
  };
}

async function onTimeRateOf(scope: SqlScope): Promise<number> {
  const row = await queryOne<{ total: number; onTime: number }>(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(s.actual_end <= s.planned_end), 0) AS onTime
       FROM waybill_segment s
       JOIN waybill w ON w.id = s.waybill_id
       JOIN orders o ON o.id = w.order_id
      WHERE s.status = 'COMPLETED'
        AND s.actual_end IS NOT NULL
        AND s.planned_end IS NOT NULL
        AND ${scope.where}`,
    scope.params,
  );
  const total = Number(row?.total ?? 0);
  const onTime = Number(row?.onTime ?? 0);
  return total > 0 ? round1((onTime / total) * 100) : 100;
}

async function statusDistributionOf(scope: SqlScope) {
  const rows = await queryRows<{ status: OrderStatus; count: number }>(
    `SELECT o.status, COUNT(*) AS count FROM orders o WHERE ${scope.where} GROUP BY o.status`,
    scope.params,
  );
  const byStatus = new Map(rows.map((row) => [row.status, Number(row.count)]));
  return ORDER_STATUS_ORDER.filter((status) => byStatus.has(status)).map((status) => ({
    status,
    statusLabel: ORDER_STATUS_LABELS[status],
    count: byStatus.get(status) ?? 0,
  }));
}

async function modeDistributionOf(scope: SqlScope) {
  const rows = await queryRows<{ mode: string; count: number }>(
    `SELECT s.mode, COUNT(DISTINCT o.id) AS count
       FROM waybill_segment s
       JOIN waybill w ON w.id = s.waybill_id
       JOIN orders o ON o.id = w.order_id
      WHERE ${scope.where}
      GROUP BY s.mode`,
    scope.params,
  );
  const byMode = new Map(rows.map((row) => [row.mode, Number(row.count)]));
  return ['ROAD', 'SEA', 'RAIL'].map((mode) => ({ mode, count: byMode.get(mode) ?? 0 }));
}

async function recentOrdersOf(scope: SqlScope) {
  const rows = await queryRows<{
    id: number;
    order_no: string;
    status: OrderStatus;
    cargo_name: string;
    total_amount: number;
    created_at: string;
    customer_name: string | null;
  }>(
    `SELECT o.id, o.order_no, o.status, o.cargo_name, o.total_amount, o.created_at, c.name AS customer_name
       FROM orders o
       LEFT JOIN customer c ON c.id = o.customer_id
      WHERE ${scope.where}
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT 8`,
    scope.params,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    orderNo: row.order_no,
    status: row.status,
    statusLabel: ORDER_STATUS_LABELS[row.status],
    cargoName: row.cargo_name,
    totalAmount: Number(row.total_amount),
    customerName: row.customer_name,
    createdAt: row.created_at,
  }));
}

async function countRows(sql: string, params: unknown[] = []): Promise<number> {
  const row = await queryOne<{ total: number }>(sql, params);
  return Number(row?.total ?? 0);
}

async function integrationOf() {
  const row = await queryOne<{ total: number; success: number; failed: number }>(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(status = 'SUCCESS'), 0) AS success,
            COALESCE(SUM(status = 'FAILED'), 0) AS failed
       FROM integration_message`,
  );
  const total = Number(row?.total ?? 0);
  const success = Number(row?.success ?? 0);
  const failed = Number(row?.failed ?? 0);
  return {
    total,
    success,
    failed,
    successRate: total > 0 ? round1((success / total) * 100) : 0,
  };
}

async function todosOf(user: AuthUser, kpi: KpiRow) {
  const todos: Array<{ type: string; title: string; relatedId: number | null; count: number }> = [];
  const isManager = ['MTO', 'ADMIN', 'FORWARDER'].includes(user.role);
  const customerScope = user.role === 'SHIPPER' && user.customer_id !== null;
  const customerId = customerScope ? Number(user.customer_id) : null;

  if (isManager) {
    if (kpi.pendingDispatch > 0) {
      todos.push({ type: 'DISPATCH', title: `${kpi.pendingDispatch} 票订单待调度`, relatedId: null, count: kpi.pendingDispatch });
    }
    const draftQuotes = await countRows("SELECT COUNT(*) AS total FROM quote WHERE status = 'DRAFT'");
    if (draftQuotes > 0) {
      todos.push({ type: 'QUOTE', title: `${draftQuotes} 条询价待报价`, relatedId: null, count: draftQuotes });
    }
    const pendingContracts = await countRows("SELECT COUNT(*) AS total FROM contract WHERE status = 'PENDING_SIGN'");
    if (pendingContracts > 0) {
      todos.push({ type: 'CONTRACT', title: `${pendingContracts} 份合同待签署`, relatedId: null, count: pendingContracts });
    }
    const failedMessages = await countRows("SELECT COUNT(*) AS total FROM integration_message WHERE status = 'FAILED'");
    if (failedMessages > 0) {
      todos.push({ type: 'INTEGRATION', title: `${failedMessages} 条集成报文失败待重试`, relatedId: null, count: failedMessages });
    }
  }

  if (user.role === 'SHIPPER') {
    const sentQuotes = await countRows(
      "SELECT COUNT(*) AS total FROM quote WHERE status = 'SENT' AND customer_id = ?",
      [customerId ?? -1],
    );
    if (sentQuotes > 0) {
      todos.push({ type: 'QUOTE', title: `${sentQuotes} 条报价待确认`, relatedId: null, count: sentQuotes });
    }
    const pendingContracts = await countRows(
      "SELECT COUNT(*) AS total FROM contract WHERE status = 'PENDING_SIGN' AND customer_id = ?",
      [customerId ?? -1],
    );
    if (pendingContracts > 0) {
      todos.push({ type: 'CONTRACT', title: `${pendingContracts} 份合同待签署`, relatedId: null, count: pendingContracts });
    }
    if (kpi.signed > 0) {
      todos.push({ type: 'SETTLE', title: `${kpi.signed} 票已签收待出账`, relatedId: null, count: kpi.signed });
    }
  }

  if (user.role === 'CARRIER') {
    const tasks = await countRows(
      `SELECT COUNT(*) AS total FROM waybill_segment WHERE carrier_user_id = ? AND status IN ('PENDING', 'ACCEPTED')`,
      [user.uid],
    );
    if (tasks > 0) {
      todos.push({ type: 'TASK', title: `${tasks} 个公路段任务待处理`, relatedId: null, count: tasks });
    }
  }

  if (user.role === 'TERMINAL') {
    const tasks = await countRows(
      `SELECT COUNT(*) AS total FROM waybill_segment WHERE mode IN ('SEA', 'RAIL') AND status IN ('PENDING', 'IN_TRANSIT')`,
    );
    if (tasks > 0) {
      todos.push({ type: 'TERMINAL', title: `${tasks} 个港站作业待确认`, relatedId: null, count: tasks });
    }
  }

  if (user.role === 'SETTLEMENT') {
    const pendingSettle = await countRows("SELECT COUNT(*) AS total FROM orders WHERE status = 'SIGNED'");
    if (pendingSettle > 0) {
      todos.push({ type: 'SETTLE', title: `${pendingSettle} 票订单待出账`, relatedId: null, count: pendingSettle });
    }
    const issuedBills = await countRows("SELECT COUNT(*) AS total FROM bill WHERE status = 'ISSUED'");
    if (issuedBills > 0) {
      todos.push({ type: 'BILL', title: `${issuedBills} 张账单待收款`, relatedId: null, count: issuedBills });
    }
  }

  return todos;
}

/** GET /dashboard/summary */
export async function getSummary(user: AuthUser) {
  const scope = orderScopeForRole(user);
  const kpi = await kpiOf(scope);
  const [onTimeRate, statusDistribution, modeDistribution, recentOrders, integration, todos] = await Promise.all([
    onTimeRateOf(scope),
    statusDistributionOf(scope),
    modeDistributionOf(scope),
    recentOrdersOf(scope),
    integrationOf(),
    todosOf(user, kpi),
  ]);
  return {
    kpis: { ...kpi, onTimeRate, exceptionCount: integration.failed },
    statusDistribution,
    modeDistribution,
    recentOrders,
    todos,
    integration,
    scope: user.role,
  };
}

/** GET /dashboard/trend?days=14 */
export async function getTrend(user: AuthUser, daysRaw: unknown) {
  const daysNum = Number(daysRaw);
  const days = Number.isFinite(daysNum) && daysNum > 0 ? Math.min(Math.floor(daysNum), 90) : 14;
  const scope = orderScopeForRole(user);
  const dates: string[] = [];
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  const startDate = formatDate(start);
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start.getTime() + i * 86400000);
    dates.push(formatDate(d));
  }
  const rows = await queryRows<{ d: string; orders: number; revenue: number }>(
    `SELECT DATE_FORMAT(o.created_at, '%Y-%m-%d') AS d, COUNT(*) AS orders,
            COALESCE(SUM(o.total_amount), 0) AS revenue
       FROM orders o
      WHERE ${scope.where} AND o.created_at >= ?
      GROUP BY d`,
    [...scope.params, `${startDate} 00:00:00`],
  );
  const byDate = new Map(rows.map((row) => [row.d, row]));
  return {
    dates: dates.map((date) => date.slice(5)),
    orders: dates.map((date) => Number(byDate.get(date)?.orders ?? 0)),
    revenue: dates.map((date) => round2(Number(byDate.get(date)?.revenue ?? 0))),
  };
}
