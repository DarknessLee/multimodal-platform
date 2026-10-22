// 价格引擎：按线路模板 + 箱型 + 箱量 + 价格规则逐模式计算报价明细
// 匹配优先级：合同价 > 客户协议价 > 线路公开价；同层 priority 小者优先，再取最新规则。
// 计费方式：PER_CONTAINER / PER_KM / PER_TON / PER_TEU / FLAT，min_charge 兜底；港杂按箱次×2。
import type { PoolConnection } from 'mysql2/promise';
import { CALC_METHOD_LABELS, MODE_LABELS } from '../config/labels';
import { txQueryRows } from '../db/pool';
import { ApiError } from '../errors';
import type {
  CalcMethod,
  ChargeType,
  ContainerTypeRow,
  PriceRuleRow,
  RouteTemplateRow,
  SegmentMode,
} from '../types';
import { todayDateString } from '../utils/datetime';
import { parseJson, round2 } from '../utils/json';

export interface CalculatePriceInput {
  route: RouteTemplateRow;
  containerType: ContainerTypeRow;
  containerCount: number;
  cargoWeight: number;
  customerId: number;
  contractId?: number | null;
}

export interface PriceItemResult {
  seq: number;
  mode: SegmentMode | 'PORT';
  chargeType: ChargeType;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  costAmount: number;
  calculation: Record<string, unknown>;
}

export interface PriceResult {
  items: PriceItemResult[];
  totalAmount: number;
  costAmount: number;
  marginRate: number;
}

interface QuantityResult {
  quantity: number;
  unit: string;
  amount: number;
}

function ruleRank(rule: PriceRuleRow, contractId: number | null | undefined): number {
  if (contractId && Number(rule.contract_id) === Number(contractId)) {
    return 0;
  }
  if (rule.customer_id !== null && rule.customer_id !== undefined) {
    return 1;
  }
  return 2;
}

function sortRules(rules: PriceRuleRow[], contractId: number | null | undefined): PriceRuleRow[] {
  return [...rules].sort((a, b) => {
    const rankDiff = ruleRank(a, contractId) - ruleRank(b, contractId);
    if (rankDiff !== 0) return rankDiff;
    const priorityDiff = Number(a.priority) - Number(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return Number(b.id) - Number(a.id);
  });
}

async function selectRules(
  conn: PoolConnection,
  input: CalculatePriceInput,
  mode: SegmentMode | 'PORT',
  chargeType: ChargeType,
): Promise<PriceRuleRow[]> {
  const today = todayDateString();
  return txQueryRows<PriceRuleRow>(
    conn,
    `SELECT * FROM price_rule
      WHERE status = 'ACTIVE'
        AND mode = ?
        AND charge_type = ?
        AND (route_template_id IS NULL OR route_template_id = ?)
        AND (container_type_id IS NULL OR container_type_id = ?)
        AND (customer_id IS NULL OR customer_id = ?)
        AND (contract_id IS NULL OR contract_id = ?)
        AND effective_from <= ?
        AND effective_to >= ?
      ORDER BY priority ASC, id DESC`,
    [
      mode,
      chargeType,
      Number(input.route.id),
      Number(input.containerType.id),
      Number(input.customerId),
      input.contractId ?? null,
      today,
      today,
    ],
  );
}

function quantityOf(rule: PriceRuleRow, input: CalculatePriceInput): QuantityResult {
  const count = Number(input.containerCount);
  const unitPrice = Number(rule.unit_price);
  const minCharge = Number(rule.min_charge ?? 0);
  const calcMethod = rule.calc_method as CalcMethod;
  let quantity: number;
  let unit: string;
  switch (calcMethod) {
    case 'PER_KM':
      quantity = Number(input.route.distance_km);
      unit = '公里';
      break;
    case 'PER_TON':
      quantity = Number(input.cargoWeight);
      unit = '吨';
      break;
    case 'PER_TEU':
      quantity = Number(input.containerType.teu) * count;
      unit = 'TEU';
      break;
    case 'FLAT':
      quantity = 1;
      unit = '票';
      break;
    case 'PER_CONTAINER':
    default:
      quantity = count;
      unit = '箱';
      break;
  }
  const raw = calcMethod === 'FLAT' ? unitPrice : unitPrice * quantity;
  return { quantity: round2(quantity), unit, amount: round2(Math.max(raw, minCharge)) };
}

function buildItem(
  seq: number,
  mode: SegmentMode | 'PORT',
  chargeType: ChargeType,
  description: string,
  rule: PriceRuleRow,
  quantity: number,
  unit: string,
  amount: number,
  extraCalculation: Record<string, unknown> = {},
): PriceItemResult {
  return {
    seq,
    mode,
    chargeType,
    description,
    quantity,
    unit,
    unitPrice: Number(rule.unit_price),
    amount,
    costAmount: round2(amount * 0.86),
    calculation: {
      method: rule.calc_method,
      methodLabel: CALC_METHOD_LABELS[rule.calc_method as CalcMethod],
      ruleNo: rule.rule_no,
      quantity,
      unit,
      unitPrice: Number(rule.unit_price),
      minCharge: Number(rule.min_charge ?? 0),
      ...extraCalculation,
    },
  };
}

function modesOf(route: RouteTemplateRow): SegmentMode[] {
  const raw = parseJson<unknown>(route.modes, []);
  const list = Array.isArray(raw) ? raw.map((item) => String(item)) : [];
  return list.filter((item): item is SegmentMode => item === 'ROAD' || item === 'SEA' || item === 'RAIL');
}

/** 逐模式计算报价明细；缺少基础价格规则时抛 40903 */
export async function calculatePrice(
  conn: PoolConnection,
  input: CalculatePriceInput,
): Promise<PriceResult> {
  const route = input.route;
  const containerType = input.containerType;
  const count = Number(input.containerCount);
  const routeName = String(route.route_name ?? '');
  const modes = modesOf(route);
  if (modes.length === 0) {
    throw new ApiError(40903, `线路 ${routeName} 未配置运输方式，无法报价`);
  }

  const items: PriceItemResult[] = [];
  let seq = 0;

  for (const mode of modes) {
    const rules = await selectRules(conn, input, mode, 'BASE');
    const selected = sortRules(rules, input.contractId)[0];
    if (!selected) {
      throw new ApiError(
        40903,
        `缺少可用的${MODE_LABELS[mode]}段价格规则（线路：${routeName}，箱型：${containerType.code}）`,
      );
    }
    seq += 1;
    const qty = quantityOf(selected, input);
    items.push(
      buildItem(
        seq,
        mode,
        'BASE',
        `${MODE_LABELS[mode]}段 · ${routeName}`,
        selected,
        qty.quantity,
        qty.unit,
        qty.amount,
        { containerCount: count, distanceKm: Number(route.distance_km) },
      ),
    );
  }

  // 港杂费（可选）：按箱次 ×2 计费
  const portRules = await selectRules(conn, input, 'PORT', 'BASE');
  const portRule = sortRules(portRules, input.contractId)[0];
  if (portRule) {
    seq += 1;
    const quantity = count * 2;
    const unitPrice = Number(portRule.unit_price);
    const amount = round2(Math.max(unitPrice * quantity, Number(portRule.min_charge ?? 0)));
    items.push(buildItem(seq, 'PORT', 'BASE', '港口装卸/堆存/理货', portRule, quantity, '箱次', amount));
  }

  // 附加费（可选）：按模式取最优规则逐条叠加
  const allModes: SegmentMode[] = ['ROAD', 'SEA', 'RAIL'];
  for (const mode of allModes) {
    const rules = await selectRules(conn, input, mode, 'SURCHARGE');
    const selected = sortRules(rules, input.contractId)[0];
    if (!selected) continue;
    seq += 1;
    const qty = quantityOf(selected, input);
    items.push(
      buildItem(
        seq,
        mode,
        'SURCHARGE',
        `${MODE_LABELS[mode]}附加费 · ${routeName}`,
        selected,
        qty.quantity,
        qty.unit,
        qty.amount,
      ),
    );
  }

  const totalAmount = round2(items.reduce((sum, item) => sum + item.amount, 0));
  const costAmount = round2(items.reduce((sum, item) => sum + item.costAmount, 0));
  const marginRate = totalAmount > 0 ? round2(((totalAmount - costAmount) / totalAmount) * 100) : 0;

  return { items, totalAmount, costAmount, marginRate };
}
