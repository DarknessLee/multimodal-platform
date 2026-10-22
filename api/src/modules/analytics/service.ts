// 经营分析（stat_daily ADS Mock + 账单兜底）：KPI/趋势/客户/模式/AR 账龄/财务看板
import { BILL_ITEM_MODE_LABELS, MODE_LABELS } from '../../config/labels';
import { queryOne, queryRows } from '../../db/pool';
import type { StatDailyRow } from '../../types';
import { formatDate } from '../../utils/datetime';
import { round1, round2 } from '../../utils/json';

function dateList(days: number): string[] {
  const dates: string[] = [];
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  for (let i = 0; i < days; i += 1) {
    dates.push(formatDate(new Date(start.getTime() + i * 86400000)));
  }
  return dates;
}

function clampDays(raw: unknown, fallback = 30): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), 365);
}

/** 在 stat_daily 中优先取平台 ALL 汇总行，避免与模式/客户维度重复计数 */
function pickAggregateRows(rows: StatDailyRow[]): StatDailyRow[] {
  const platformAll = rows.filter((row) => row.mode === 'ALL' && row.customer_id === null);
  if (platformAll.length > 0) return platformAll;
  const allMode = rows.filter((row) => row.mode === 'ALL');
  if (allMode.length > 0) return allMode;
  return rows.filter((row) => row.mode !== 'ALL');
}

function sumRows(rows: StatDailyRow[]) {
  const revenue = round2(rows.reduce((sum, row) => sum + Number(row.revenue), 0));
  const cost = round2(rows.reduce((sum, row) => sum + Number(row.cost), 0));
  const profit = round2(rows.reduce((sum, row) => sum + Number(row.profit), 0));
  return {
    revenue,
    cost,
    profit,
    margin: revenue > 0 ? round1((profit / revenue) * 100) : 0,
  };
}

interface UnpaidBillRow {
  id: number;
  bill_type: string;
  total_amount: number;
  allocated: number;
  due_date: string | null;
}

async function unpaidBills(): Promise<UnpaidBillRow[]> {
  return queryRows<UnpaidBillRow>(
    `SELECT b.id, b.bill_type, b.total_amount, b.due_date,
            COALESCE((SELECT SUM(pa.amount) FROM payment_allocation pa
                       JOIN payment p ON p.id = pa.payment_id
                      WHERE pa.bill_id = b.id AND p.status = 'SUCCESS'), 0) AS allocated
       FROM bill b
      WHERE b.status <> 'PAID'`,
  );
}

function daysOverdue(dueDate: string | null): number {
  if (!dueDate) return 0;
  const due = new Date(`${String(dueDate).slice(0, 10)}T00:00:00`).getTime();
  const today = new Date(`${formatDate(new Date())}T00:00:00`).getTime();
  return Math.max(0, Math.ceil((today - due) / 86400000));
}

async function arAging() {
  const bills = (await unpaidBills()).filter((bill) => bill.bill_type === 'RECEIVABLE');
  const buckets = { '0-30': 0, '31-60': 0, '60+': 0 };
  for (const bill of bills) {
    const outstanding = Math.max(0, Number(bill.total_amount) - Number(bill.allocated));
    const overdue = daysOverdue(bill.due_date);
    if (overdue <= 30) buckets['0-30'] += outstanding;
    else if (overdue <= 60) buckets['31-60'] += outstanding;
    else buckets['60+'] += outstanding;
  }
  return Object.entries(buckets).map(([bucket, amount]) => ({ bucket, amount: round2(amount) }));
}

/** GET /api/analytics/overview?days=30 */
export async function getAnalyticsOverview(daysRaw: unknown) {
  const days = clampDays(daysRaw, 30);
  const dates = dateList(days);
  const statRows = await queryRows<StatDailyRow>(
    'SELECT * FROM stat_daily WHERE stat_date >= ? ORDER BY stat_date ASC',
    [dates[0]],
  );
  let totals: { revenue: number; cost: number; profit: number; margin: number };
  if (statRows.length > 0) {
    totals = sumRows(pickAggregateRows(statRows));
  } else {
    // 兜底：按账单（应收/应付）汇总
    const helper = await queryOne<{ revenue: number | null; cost: number | null }>(
      `SELECT
         COALESCE(SUM(CASE WHEN bill_type = 'RECEIVABLE' THEN total_amount ELSE 0 END), 0) AS revenue,
         COALESCE(SUM(CASE WHEN bill_type = 'PAYABLE' THEN total_amount ELSE 0 END), 0) AS cost
       FROM bill WHERE DATE(issued_at) >= ?`,
      [dates[0]],
    );
    const revenue = round2(Number(helper?.revenue ?? 0));
    const cost = round2(Number(helper?.cost ?? 0));
    totals = {
      revenue,
      cost,
      profit: round2(revenue - cost),
      margin: revenue > 0 ? round1(((revenue - cost) / revenue) * 100) : 0,
    };
  }

  const bills = await unpaidBills();
  const arBills = bills.filter((bill) => bill.bill_type === 'RECEIVABLE');
  const apBills = bills.filter((bill) => bill.bill_type === 'PAYABLE');
  const outstanding = (bill: UnpaidBillRow) => Math.max(0, Number(bill.total_amount) - Number(bill.allocated));
  const arTotal = round2(arBills.reduce((sum, bill) => sum + outstanding(bill), 0));
  const arOverdue = round2(
    arBills
      .filter((bill) => daysOverdue(bill.due_date) > 0)
      .reduce((sum, bill) => sum + outstanding(bill), 0),
  );
  const apTotal = round2(apBills.reduce((sum, bill) => sum + outstanding(bill), 0));

  const invoiceCount = await queryOne<{ total: number }>(
    "SELECT COUNT(*) AS total FROM invoice WHERE status = 'ISSUED'",
  );
  const paymentCount = await queryOne<{ total: number }>(
    "SELECT COUNT(*) AS total FROM payment WHERE status = 'SUCCESS'",
  );

  return {
    kpis: {
      ...totals,
      arTotal,
      arOverdue,
      apTotal,
      invoicesIssued: Number(invoiceCount?.total ?? 0),
      paymentsSuccess: Number(paymentCount?.total ?? 0),
    },
    arAging: await arAging(),
  };
}

/** GET /api/analytics/trend?days=14 */
export async function getAnalyticsTrend(daysRaw: unknown) {
  const days = clampDays(daysRaw, 14);
  const dates = dateList(days);
  const statRows = await queryRows<StatDailyRow>(
    'SELECT * FROM stat_daily WHERE stat_date >= ? ORDER BY stat_date ASC',
    [dates[0]],
  );
  const byDate = new Map<string, StatDailyRow[]>();
  for (const row of statRows) {
    const key = String(row.stat_date).slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)?.push(row);
  }
  let billFallback = new Map<string, { revenue: number; cost: number }>();
  if (statRows.length === 0) {
    const rows = await queryRows<{ d: string; revenue: number | null; cost: number | null }>(
      `SELECT DATE_FORMAT(issued_at, '%Y-%m-%d') AS d,
              SUM(CASE WHEN bill_type = 'RECEIVABLE' THEN total_amount ELSE 0 END) AS revenue,
              SUM(CASE WHEN bill_type = 'PAYABLE' THEN total_amount ELSE 0 END) AS cost
         FROM bill WHERE DATE(issued_at) >= ? GROUP BY d`,
      [dates[0]],
    );
    billFallback = new Map(
      rows.map((row) => [row.d, { revenue: Number(row.revenue ?? 0), cost: Number(row.cost ?? 0) }]),
    );
  }
  const revenue: number[] = [];
  const cost: number[] = [];
  const profit: number[] = [];
  for (const date of dates) {
    const rows = byDate.get(date);
    if (rows && rows.length > 0) {
      const totals = sumRows(pickAggregateRows(rows));
      revenue.push(totals.revenue);
      cost.push(totals.cost);
      profit.push(totals.profit);
    } else if (billFallback.size > 0) {
      const entry = billFallback.get(date) ?? { revenue: 0, cost: 0 };
      revenue.push(round2(entry.revenue));
      cost.push(round2(entry.cost));
      profit.push(round2(entry.revenue - entry.cost));
    } else {
      revenue.push(0);
      cost.push(0);
      profit.push(0);
    }
  }
  return { dates: dates.map((date) => date.slice(5)), revenue, cost, profit };
}

/** GET /api/analytics/by-customer */
export async function getAnalyticsByCustomer() {
  const statRows = await queryRows<StatDailyRow & { customer_name: string | null }>(
    `SELECT s.*, c.name AS customer_name
       FROM stat_daily s LEFT JOIN customer c ON c.id = s.customer_id
      WHERE s.customer_id IS NOT NULL ORDER BY s.customer_id ASC`,
  );
  if (statRows.length > 0) {
    const byCustomer = new Map<number, { name: string; rows: StatDailyRow[] }>();
    for (const row of statRows) {
      const id = Number(row.customer_id);
      if (!byCustomer.has(id)) byCustomer.set(id, { name: row.customer_name ?? `客户#${id}`, rows: [] });
      byCustomer.get(id)?.rows.push(row);
    }
    return [...byCustomer.values()].map((entry) => {
      const allRows = entry.rows.filter((row) => row.mode === 'ALL');
      const totals = sumRows(allRows.length > 0 ? allRows : entry.rows);
      return { customerName: entry.name, ...totals };
    });
  }
  const rows = await queryRows<{ customer_name: string | null; revenue: number | null; cost: number | null }>(
    `SELECT c.name AS customer_name,
            COALESCE(SUM(CASE WHEN b.bill_type = 'RECEIVABLE' THEN b.total_amount ELSE 0 END), 0) AS revenue,
            COALESCE(SUM(CASE WHEN b.bill_type = 'PAYABLE' THEN b.total_amount ELSE 0 END), 0) AS cost
       FROM bill b
       LEFT JOIN customer c ON c.id = b.counterparty_id AND b.counterparty_type = 'CUSTOMER'
      GROUP BY b.counterparty_id, c.name
      ORDER BY revenue DESC`,
  );
  return rows.map((row) => {
    const revenue = round2(Number(row.revenue ?? 0));
    const cost = round2(Number(row.cost ?? 0));
    const profit = round2(revenue - cost);
    return {
      customerName: row.customer_name ?? '未分配客户',
      revenue,
      cost,
      profit,
      margin: revenue > 0 ? round1((profit / revenue) * 100) : 0,
    };
  });
}

/** GET /api/analytics/by-mode */
export async function getAnalyticsByMode() {
  const statRows = await queryRows<StatDailyRow>(
    "SELECT * FROM stat_daily WHERE mode <> 'ALL' ORDER BY mode ASC",
  );
  if (statRows.length > 0) {
    const byMode = new Map<string, StatDailyRow[]>();
    for (const row of statRows) {
      if (!byMode.has(row.mode)) byMode.set(row.mode, []);
      byMode.get(row.mode)?.push(row);
    }
    return [...byMode.entries()].map(([mode, rows]) => {
      const revenue = round2(rows.reduce((sum, row) => sum + Number(row.revenue), 0));
      const cost = round2(rows.reduce((sum, row) => sum + Number(row.cost), 0));
      const profit = round2(revenue - cost);
      return {
        mode,
        modeLabel: MODE_LABELS[mode as 'ROAD' | 'SEA' | 'RAIL'] ?? BILL_ITEM_MODE_LABELS[mode as 'OTHER'] ?? mode,
        revenue,
        cost,
        profit,
        margin: revenue > 0 ? round1((profit / revenue) * 100) : 0,
      };
    });
  }
  const rows = await queryRows<{ mode: string; revenue: number | null; cost: number | null }>(
    `SELECT i.mode,
            COALESCE(SUM(CASE WHEN b.bill_type = 'RECEIVABLE' THEN i.amount ELSE 0 END), 0) AS revenue,
            COALESCE(SUM(CASE WHEN b.bill_type = 'PAYABLE' THEN i.amount ELSE 0 END), 0) AS cost
       FROM bill_item i JOIN bill b ON b.id = i.bill_id
      GROUP BY i.mode ORDER BY i.mode ASC`,
  );
  return rows.map((row) => {
    const revenue = round2(Number(row.revenue ?? 0));
    const cost = round2(Number(row.cost ?? 0));
    const profit = round2(revenue - cost);
    return {
      mode: row.mode,
      modeLabel: BILL_ITEM_MODE_LABELS[row.mode as 'ROAD'] ?? row.mode,
      revenue,
      cost,
      profit,
      margin: revenue > 0 ? round1((profit / revenue) * 100) : 0,
    };
  });
}

/** GET /api/finance/dashboard：AR/AP 与财务待办聚合 */
export async function getFinanceDashboard() {
  const bills = await unpaidBills();
  const outstanding = (bill: UnpaidBillRow) => Math.max(0, Number(bill.total_amount) - Number(bill.allocated));
  const arBills = bills.filter((bill) => bill.bill_type === 'RECEIVABLE');
  const apBills = bills.filter((bill) => bill.bill_type === 'PAYABLE');
  const arTotal = round2(arBills.reduce((sum, bill) => sum + outstanding(bill), 0));
  const arOverdue = round2(
    arBills
      .filter((bill) => daysOverdue(bill.due_date) > 0)
      .reduce((sum, bill) => sum + outstanding(bill), 0),
  );
  const apTotal = round2(apBills.reduce((sum, bill) => sum + outstanding(bill), 0));
  const pendingInvoices = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM bill b
      WHERE b.bill_type = 'RECEIVABLE' AND b.status <> 'PAID'
        AND NOT EXISTS (SELECT 1 FROM invoice i WHERE i.bill_id = b.id AND i.status <> 'VOID')`,
  );
  const pendingPayments = await queryOne<{ total: number }>(
    "SELECT COUNT(*) AS total FROM payment WHERE status = 'PENDING'",
  );
  const reconInProgress = await queryOne<{ total: number }>(
    "SELECT COUNT(*) AS total FROM reconciliation WHERE status IN ('SENT', 'DISPUTED')",
  );
  const reconDisputed = await queryOne<{ total: number; amount: number | null }>(
    "SELECT COUNT(*) AS total, COALESCE(SUM(difference_amount), 0) AS amount FROM reconciliation WHERE status = 'DISPUTED'",
  );
  const factoringInProgress = await queryOne<{ total: number }>(
    "SELECT COUNT(*) AS total FROM factoring_application WHERE status IN ('SUBMITTED', 'APPROVED')",
  );
  const insurancePolicies = await queryOne<{ total: number }>(
    "SELECT COUNT(*) AS total FROM insurance_policy WHERE status = 'ISSUED'",
  );
  const paidInvoices = await queryOne<{ total: number }>(
    "SELECT COUNT(*) AS total FROM invoice WHERE status = 'ISSUED'",
  );
  return {
    arTotal,
    arOverdue,
    apTotal,
    pendingInvoices: Number(pendingInvoices?.total ?? 0),
    pendingPayments: Number(pendingPayments?.total ?? 0),
    reconciliation: {
      inProgress: Number(reconInProgress?.total ?? 0),
      disputed: Number(reconDisputed?.total ?? 0),
      differenceAmount: round2(Number(reconDisputed?.amount ?? 0)),
    },
    factoringInProgress: Number(factoringInProgress?.total ?? 0),
    insurancePolicies: Number(insurancePolicies?.total ?? 0),
    invoicesIssued: Number(paidInvoices?.total ?? 0),
  };
}
