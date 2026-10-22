// 主数据服务：客户 / 伙伴 / 港站 / 线路 / 货物 / 箱型 / 价格规则 / 字典
import {
  ACTIVE_STATUS_LABELS,
  CALC_METHOD_LABELS,
  CHARGE_TYPE_LABELS,
  MODE_LABELS,
  NODE_TYPE_LABELS,
  PARTNER_TYPE_LABELS,
  PAYMENT_TERMS_LABELS,
} from '../../config/labels';
import { queryOne, queryRows, txExec, txQueryOne, txQueryRows, withTransaction } from '../../db/pool';
import { ApiError } from '../../errors';
import { writeAudit } from '../../middleware/audit';
import { nextDocNo } from '../../platform/sequence';
import type {
  ActiveStatus,
  CalcMethod,
  ChargeType,
  ContainerTypeRow,
  CustomerRow,
  DictDataRow,
  GoodsCatalogRow,
  NodeType,
  PartnerRow,
  PartnerType,
  PortStationRow,
  PriceRuleMode,
  PriceRuleRow,
  RouteTemplateRow,
} from '../../types';
import { todayDateString } from '../../utils/datetime';
import { parseJson, parseNumberArray, round2, toBool } from '../../utils/json';
import { optionalString, pageResult, parsePage } from '../shared/pagination';

function statusLabel(status: ActiveStatus): string {
  return ACTIVE_STATUS_LABELS[status] ?? status;
}

// ── 客户 ────────────────────────────────────────────────────────────────────
export function customerDto(row: CustomerRow) {
  return {
    id: Number(row.id),
    customerNo: row.customer_no,
    name: row.name,
    shortName: row.short_name,
    creditCode: row.credit_code,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    email: row.email,
    regionCode: row.region_code,
    address: row.address,
    industry: row.industry,
    creditLevel: row.credit_level,
    status: row.status,
    statusLabel: statusLabel(row.status),
    remark: row.remark,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCustomers(query: Record<string, unknown>) {
  const pager = parsePage(query, 10);
  const keyword = optionalString(query.keyword);
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (keyword) {
    conditions.push('(customer_no LIKE ? OR name LIKE ? OR short_name LIKE ? OR contact_name LIKE ?)');
    const like = `%${keyword}%`;
    params.push(like, like, like, like);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM customer ${where}`, params);
  const rows = await queryRows<CustomerRow>(
    `SELECT * FROM customer ${where} ORDER BY id ASC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  return pageResult(rows.map(customerDto), Number(totalRow?.total ?? 0), pager);
}

export async function getCustomer(id: number) {
  const row = await queryOne<CustomerRow>('SELECT * FROM customer WHERE id = ?', [id]);
  if (!row) {
    throw new ApiError(40401, '客户不存在');
  }
  return customerDto(row);
}

export interface CreateCustomerInput {
  name: string;
  shortName?: string;
  creditCode: string;
  contactName: string;
  contactPhone: string;
  email?: string | null;
  regionCode: string;
  address: string;
  industry?: string;
  creditLevel?: 'AAA' | 'AA' | 'A' | 'B' | 'C';
  remark?: string | null;
}

export async function createCustomer(input: CreateCustomerInput, user: { uid: number; username: string; role: string }, ip: string | null) {
  const existing = await queryOne<{ id: number }>('SELECT id FROM customer WHERE credit_code = ?', [input.creditCode]);
  if (existing) {
    throw new ApiError(40902, '统一社会信用代码已存在');
  }
  const newCustomerId = await withTransaction(async (conn) => {
    const last = await txQueryOne<{ customer_no: string }>(
      conn,
      "SELECT customer_no FROM customer WHERE customer_no LIKE 'CUS%' ORDER BY customer_no DESC LIMIT 1",
    );
    const nextNo = last
      ? `CUS${String(Number(last.customer_no.slice(3)) + 1).padStart(6, '0')}`
      : 'CUS000001';
    const at = todayDateString();
    const result = await txExec(
      conn,
      `INSERT INTO customer (customer_no, name, short_name, credit_code, contact_name, contact_phone, email,
         region_code, address, industry, credit_level, remark, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nextNo,
        input.name,
        input.shortName ?? input.name.slice(0, 20),
        input.creditCode,
        input.contactName,
        input.contactPhone,
        input.email ?? null,
        input.regionCode,
        input.address,
        input.industry ?? '其他',
        input.creditLevel ?? 'A',
        input.remark ?? null,
        `${at} 00:00:00`,
      ],
    );
    await writeAudit(conn, {
      user,
      action: 'CUSTOMER_CREATE',
      actionLabel: '新增客户',
      module: 'master',
      targetType: 'CUSTOMER',
      targetId: Number(result.insertId),
      detail: { customerNo: nextNo, name: input.name },
      ip,
    });
    return Number(result.insertId);
  });
  return getCustomer(newCustomerId);
}

// ── 伙伴 ────────────────────────────────────────────────────────────────────
export function partnerDto(row: PartnerRow) {
  return {
    id: Number(row.id),
    partnerNo: row.partner_no,
    name: row.name,
    shortName: row.short_name,
    type: row.type,
    typeLabel: PARTNER_TYPE_LABELS[row.type],
    creditCode: row.credit_code,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    email: row.email,
    regionCode: row.region_code,
    address: row.address,
    qualifications: parseJson<unknown>(row.qualifications, []),
    rating: Number(row.rating),
    settlementAccount: row.settlement_account,
    status: row.status,
    statusLabel: statusLabel(row.status),
    remark: row.remark,
    createdAt: row.created_at,
  };
}

export async function listPartners(query: Record<string, unknown>) {
  const pager = parsePage(query, 10);
  const keyword = optionalString(query.keyword);
  const type = optionalString(query.type);
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }
  if (keyword) {
    conditions.push('(partner_no LIKE ? OR name LIKE ? OR short_name LIKE ?)');
    const like = `%${keyword}%`;
    params.push(like, like, like);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM partner ${where}`, params);
  const rows = await queryRows<PartnerRow>(
    `SELECT * FROM partner ${where} ORDER BY id ASC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  return pageResult(rows.map(partnerDto), Number(totalRow?.total ?? 0), pager);
}

export interface CreatePartnerInput {
  name: string;
  shortName?: string;
  type: PartnerType;
  creditCode: string;
  contactName: string;
  contactPhone: string;
  email?: string | null;
  regionCode: string;
  address: string;
  qualifications?: unknown;
  rating?: number;
  settlementAccount?: string | null;
  remark?: string | null;
}

export async function createPartner(input: CreatePartnerInput, user: { uid: number; username: string; role: string }, ip: string | null) {
  const existing = await queryOne<{ id: number }>('SELECT id FROM partner WHERE credit_code = ?', [input.creditCode]);
  if (existing) {
    throw new ApiError(40902, '统一社会信用代码已存在');
  }
  return withTransaction(async (conn) => {
    const last = await txQueryOne<{ partner_no: string }>(
      conn,
      "SELECT partner_no FROM partner WHERE partner_no LIKE 'P%' ORDER BY partner_no DESC LIMIT 1",
    );
    const nextNo = last ? `P${String(Number(last.partner_no.slice(1)) + 1).padStart(6, '0')}` : 'P000001';
    const at = todayDateString();
    const result = await txExec(
      conn,
      `INSERT INTO partner (partner_no, name, short_name, type, credit_code, contact_name, contact_phone, email,
         region_code, address, qualifications, rating, settlement_account, remark, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nextNo,
        input.name,
        input.shortName ?? input.name.slice(0, 20),
        input.type,
        input.creditCode,
        input.contactName,
        input.contactPhone,
        input.email ?? null,
        input.regionCode,
        input.address,
        input.qualifications === undefined ? null : JSON.stringify(input.qualifications),
        input.rating ?? 4.5,
        input.settlementAccount ?? null,
        input.remark ?? null,
        `${at} 00:00:00`,
      ],
    );
    await writeAudit(conn, {
      user,
      action: 'PARTNER_CREATE',
      actionLabel: '新增伙伴',
      module: 'master',
      targetType: 'PARTNER',
      targetId: Number(result.insertId),
      detail: { partnerNo: nextNo, name: input.name, type: input.type },
      ip,
    });
    const row = await txQueryOne<PartnerRow>(conn, 'SELECT * FROM partner WHERE id = ?', [
      Number(result.insertId),
    ]);
    if (!row) {
      throw new ApiError(50000, '伙伴创建后读取失败');
    }
    return partnerDto(row);
  });
}

// ── 港站 ────────────────────────────────────────────────────────────────────
async function nodeNameMap(ids: number[]): Promise<Map<number, PortStationRow>> {
  if (ids.length === 0) return new Map();
  const rows = await queryRows<PortStationRow>(`SELECT * FROM port_station WHERE id IN (?)`, [ids]);
  return new Map(rows.map((row) => [Number(row.id), row]));
}

export async function listPorts(type?: string | null) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (type) {
    conditions.push('node_type = ?');
    params.push(type);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await queryRows<PortStationRow & { operator_name: string | null }>(
    `SELECT n.*, p.name AS operator_name
       FROM port_station n
       LEFT JOIN partner p ON p.id = n.operator_partner_id
       ${where}
      ORDER BY n.id ASC`,
    params,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    nodeCode: row.node_code,
    nodeName: row.node_name,
    nodeType: row.node_type,
    nodeTypeLabel: NODE_TYPE_LABELS[row.node_type as NodeType],
    regionCode: row.region_code,
    address: row.address,
    lng: Number(row.lng),
    lat: Number(row.lat),
    operatorPartnerId: row.operator_partner_id === null ? null : Number(row.operator_partner_id),
    operatorName: row.operator_name,
    capacityTeu: row.capacity_teu === null ? null : Number(row.capacity_teu),
    operatingHours: row.operating_hours,
    status: row.status,
    statusLabel: statusLabel(row.status),
  }));
}

// ── 线路模板 ────────────────────────────────────────────────────────────────
export async function listRoutes() {
  const routes = await queryRows<RouteTemplateRow>('SELECT * FROM route_template ORDER BY id ASC');
  const ids = new Set<number>();
  for (const route of routes) {
    ids.add(Number(route.origin_node_id));
    ids.add(Number(route.destination_node_id));
    for (const id of parseNumberArray(route.transit_node_ids)) ids.add(id);
  }
  const nodes = await nodeNameMap([...ids]);
  const toNode = (id: number) => {
    const node = nodes.get(Number(id));
    return node ? { id: Number(node.id), nodeCode: node.node_code, nodeName: node.node_name } : null;
  };
  return routes.map((route) => ({
    id: Number(route.id),
    routeCode: route.route_code,
    routeName: route.route_name,
    originNode: toNode(Number(route.origin_node_id)),
    destinationNode: toNode(Number(route.destination_node_id)),
    transitNodes: parseNumberArray(route.transit_node_ids).map((id) => toNode(id)),
    modes: parseJson<string[]>(route.modes, []),
    distanceKm: Number(route.distance_km),
    transitDays: Number(route.transit_days),
    baseCost: Number(route.base_cost),
    reliability: Number(route.reliability),
    status: route.status,
    statusLabel: statusLabel(route.status),
  }));
}

// ── 货物 / 箱型 / 字典 ──────────────────────────────────────────────────────
export async function listGoods() {
  const rows = await queryRows<GoodsCatalogRow>('SELECT * FROM goods_catalog ORDER BY id ASC');
  return rows.map((row) => ({
    id: Number(row.id),
    goodsCode: row.goods_code,
    goodsName: row.goods_name,
    category: row.category,
    hsCode: row.hs_code,
    dangerousFlag: toBool(row.dangerous_flag),
    packaging: row.packaging,
    unit: row.unit,
    defaultWeight: row.default_weight === null ? null : Number(row.default_weight),
    status: row.status,
    statusLabel: statusLabel(row.status),
  }));
}

export async function listContainerTypes() {
  const rows = await queryRows<ContainerTypeRow>('SELECT * FROM container_type ORDER BY id ASC');
  return rows.map((row) => ({
    id: Number(row.id),
    code: row.code,
    name: row.name,
    innerVolumeCbm: Number(row.inner_volume_cbm),
    maxPayloadT: Number(row.max_payload_t),
    tareWeightT: Number(row.tare_weight_t),
    teu: Number(row.teu),
    status: row.status,
    statusLabel: statusLabel(row.status),
  }));
}

export async function listDict(type: string) {
  const rows = await queryRows<DictDataRow>(
    "SELECT * FROM dict_data WHERE dict_type = ? AND status = 'ACTIVE' ORDER BY sort_no ASC, id ASC",
    [type],
  );
  return rows.map((row) => ({
    key: row.dict_key,
    value: row.dict_key,
    label: row.dict_label,
    sortNo: Number(row.sort_no),
  }));
}

// ── 价格规则 ────────────────────────────────────────────────────────────────
export function priceRuleDto(
  row: PriceRuleRow & { route_name?: string | null; container_type_code?: string | null; customer_name?: string | null },
) {
  const mode = row.mode as PriceRuleMode;
  return {
    id: Number(row.id),
    ruleNo: row.rule_no,
    ruleName: row.rule_name,
    mode,
    modeLabel: MODE_LABELS[mode as keyof typeof MODE_LABELS] ?? mode,
    chargeType: row.charge_type,
    chargeTypeLabel: CHARGE_TYPE_LABELS[row.charge_type as ChargeType],
    carrierPartnerId: row.carrier_partner_id === null ? null : Number(row.carrier_partner_id),
    routeTemplateId: row.route_template_id === null ? null : Number(row.route_template_id),
    routeName: row.route_name ?? null,
    containerTypeId: row.container_type_id === null ? null : Number(row.container_type_id),
    containerTypeCode: row.container_type_code ?? null,
    customerId: row.customer_id === null ? null : Number(row.customer_id),
    customerName: row.customer_name ?? null,
    contractId: row.contract_id === null ? null : Number(row.contract_id),
    calcMethod: row.calc_method,
    calcMethodLabel: CALC_METHOD_LABELS[row.calc_method as CalcMethod],
    unitPrice: Number(row.unit_price),
    unit: row.unit,
    minCharge: Number(row.min_charge),
    ladder: parseJson<unknown>(row.ladder, null),
    currency: row.currency,
    priority: Number(row.priority),
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    status: row.status,
    statusLabel: statusLabel(row.status),
    remark: row.remark,
    createdAt: row.created_at,
  };
}

const PRICE_RULE_SELECT = `
  SELECT pr.*, rt.route_name, ct.code AS container_type_code, c.name AS customer_name
    FROM price_rule pr
    LEFT JOIN route_template rt ON rt.id = pr.route_template_id
    LEFT JOIN container_type ct ON ct.id = pr.container_type_id
    LEFT JOIN customer c ON c.id = pr.customer_id`;

export async function listPriceRules(query: Record<string, unknown>) {
  const pager = parsePage(query, 10);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const mode = optionalString(query.mode);
  const routeTemplateId = optionalString(query.routeTemplateId);
  const customerId = optionalString(query.customerId);
  if (mode) {
    conditions.push('pr.mode = ?');
    params.push(mode);
  }
  if (routeTemplateId) {
    conditions.push('pr.route_template_id = ?');
    params.push(Number(routeTemplateId));
  }
  if (customerId) {
    conditions.push('pr.customer_id = ?');
    params.push(Number(customerId));
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM price_rule pr ${where}`,
    params,
  );
  const rows = await queryRows<PriceRuleRow & { route_name: string | null; container_type_code: string | null; customer_name: string | null }>(
    `${PRICE_RULE_SELECT} ${where} ORDER BY pr.id DESC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  return pageResult(rows.map(priceRuleDto), Number(totalRow?.total ?? 0), pager);
}

export interface CreatePriceRuleInput {
  ruleName: string;
  mode: PriceRuleMode;
  chargeType?: ChargeType;
  routeTemplateId?: number | null;
  containerTypeCode?: string | null;
  containerTypeId?: number | null;
  customerId?: number | null;
  contractId?: number | null;
  calcMethod: CalcMethod;
  unitPrice: number;
  unit?: string;
  minCharge?: number;
  priority?: number;
  effectiveFrom: string;
  effectiveTo: string;
  currency?: string;
  remark?: string | null;
}

export async function createPriceRule(
  input: CreatePriceRuleInput,
  user: { uid: number; username: string; role: string },
  ip: string | null,
) {
  let containerTypeId = input.containerTypeId ?? null;
  if (!containerTypeId && input.containerTypeCode) {
    const ct = await queryOne<ContainerTypeRow>('SELECT * FROM container_type WHERE code = ?', [
      input.containerTypeCode,
    ]);
    if (!ct) {
      throw new ApiError(40401, '箱型不存在');
    }
    containerTypeId = Number(ct.id);
  }
  if (!containerTypeId) {
    throw new ApiError(40001, '请选择箱型');
  }
  if (input.routeTemplateId) {
    const route = await queryOne<RouteTemplateRow>('SELECT * FROM route_template WHERE id = ?', [
      input.routeTemplateId,
    ]);
    if (!route) {
      throw new ApiError(40401, '线路模板不存在');
    }
  }
  if (input.customerId) {
    const customer = await queryOne<CustomerRow>('SELECT * FROM customer WHERE id = ?', [input.customerId]);
    if (!customer) {
      throw new ApiError(40401, '客户不存在');
    }
  }
  if (input.effectiveFrom > input.effectiveTo) {
    throw new ApiError(42201, '生效日期不能晚于失效日期');
  }
  return withTransaction(async (conn) => {
    const ruleNo = await nextDocNo(conn, { table: 'price_rule', column: 'rule_no', prefix: 'PR', width: 6 });
    const at = todayDateString();
    const result = await txExec(
      conn,
      `INSERT INTO price_rule (rule_no, rule_name, mode, charge_type, route_template_id, container_type_id,
         customer_id, contract_id, calc_method, unit_price, unit, min_charge, currency, priority,
         effective_from, effective_to, status, remark, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
      [
        ruleNo,
        input.ruleName,
        input.mode,
        input.chargeType ?? 'BASE',
        input.routeTemplateId ?? null,
        containerTypeId,
        input.customerId ?? null,
        input.contractId ?? null,
        input.calcMethod,
        round2(input.unitPrice),
        input.unit ?? '箱',
        round2(input.minCharge ?? 0),
        input.currency ?? 'CNY',
        input.priority ?? 100,
        input.effectiveFrom,
        input.effectiveTo,
        input.remark ?? null,
        `${at} 00:00:00`,
      ],
    );
    const ruleId = Number(result.insertId);
    await writeAudit(conn, {
      user,
      action: 'PRICE_RULE_CREATE',
      actionLabel: '维护价格规则',
      module: 'master',
      targetType: 'PRICE_RULE',
      targetId: ruleId,
      detail: { ruleNo, ruleName: input.ruleName, mode: input.mode, unitPrice: input.unitPrice },
      ip,
    });
    const row = await txQueryRows<
      PriceRuleRow & { route_name: string | null; container_type_code: string | null; customer_name: string | null }
    >(conn, `${PRICE_RULE_SELECT} WHERE pr.id = ?`, [ruleId]);
    if (row.length === 0) {
      throw new ApiError(50000, '价格规则创建后读取失败');
    }
    return priceRuleDto(row[0]);
  });
}

/** 供其他模块使用：读取线路（含节点信息） */
export async function findRouteById(id: number): Promise<RouteTemplateRow | null> {
  return queryOne<RouteTemplateRow>('SELECT * FROM route_template WHERE id = ?', [id]);
}

export { PAYMENT_TERMS_LABELS, NODE_TYPE_LABELS };
