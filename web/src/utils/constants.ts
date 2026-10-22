// 中文标签、演示账号、菜单/权限、枚举选项
// 依据：docs/02-接口契约.md（v0）、docs/04-Stage1-接口契约.md（v1）、api/db/seed/reference.mjs

export interface DemoAccount {
  username: string;
  password: string;
  role: string;
  roleLabel: string;
  displayName: string;
  duty: string;
}

export const DEMO_PASSWORD = 'demo123';

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    username: 'shipper01',
    password: 'demo123',
    role: 'SHIPPER',
    roleLabel: '货主',
    displayName: '上海远洋物流（货主）',
    duty: '询价、签合同、下单、签收、看账单',
  },
  {
    username: 'forwarder01',
    password: 'demo123',
    role: 'FORWARDER',
    roleLabel: '货代',
    displayName: '上海联代国际货代',
    duty: '代客询价、发送报价、合同、下单',
  },
  {
    username: 'mto01',
    password: 'demo123',
    role: 'MTO',
    roleLabel: '多式联运经营人',
    displayName: '中远海联运 MTO',
    duty: '报价、调度、履约、集成与审计',
  },
  {
    username: 'carrier01',
    password: 'demo123',
    role: 'CARRIER',
    roleLabel: '公路承运人',
    displayName: '安捷卡车队（公路承运人）',
    duty: '接单 → 已提货 → 已送达',
  },
  {
    username: 'rail01',
    password: 'demo123',
    role: 'RAIL_CARRIER',
    roleLabel: '铁路承运人',
    displayName: '中铁集装箱（铁路承运人）',
    duty: '相关订单与运单跟踪',
  },
  {
    username: 'sea01',
    password: 'demo123',
    role: 'SEA_CARRIER',
    roleLabel: '水路承运人',
    displayName: '中远海运集运（水路承运人）',
    duty: '相关订单与运单跟踪',
  },
  {
    username: 'terminal01',
    password: 'demo123',
    role: 'TERMINAL',
    roleLabel: '港站',
    displayName: '洋山港/阳逻港操作员',
    duty: '进场确认、到港/到站、箱况录入',
  },
  {
    username: 'settlement01',
    password: 'demo123',
    role: 'SETTLEMENT',
    roleLabel: '结算',
    displayName: '联运结算中心',
    duty: '账单生成、结算工作台',
  },
  {
    username: 'admin01',
    password: 'demo123',
    role: 'ADMIN',
    roleLabel: '平台运营',
    displayName: '平台运营管理员',
    duty: '主数据、集成、审计、全菜单',
  },
];

/** 角色中文标签 */
export const ROLE_LABELS: Record<string, string> = {
  SHIPPER: '货主',
  FORWARDER: '货代',
  MTO: '多式联运经营人',
  CARRIER: '公路承运人',
  RAIL_CARRIER: '铁路承运人',
  SEA_CARRIER: '水路承运人',
  TERMINAL: '港站',
  SETTLEMENT: '结算',
  ADMIN: '平台运营',
};

/** 演示环境后端尚未返回 permissions 时，按角色回退的权限矩阵（与 seed 一致） */
const MENU_CODES = [
  'menu:dashboard',
  'menu:orders',
  'menu:quotes',
  'menu:contracts',
  'menu:customers',
  'menu:partners',
  'menu:master',
  'menu:dispatch',
  'menu:tasks',
  'menu:terminal',
  'menu:track',
  'menu:settlement',
  'menu:bills',
  'menu:integration',
  'menu:audit',
  'menu:waybills',
  'menu:containers',
  'menu:documents',
  'menu:rail',
  'menu:sea',
  'menu:monitor',
  'menu:alerts',
  'menu:capacity',
];

const BUTTON_CODES = [
  'order:create',
  'order:cancel',
  'order:dispatch',
  'quote:create',
  'quote:send',
  'quote:accept',
  'contract:create',
  'contract:send',
  'contract:sign',
  'price:create',
  'customer:create',
  'partner:create',
  'integration:retry',
  'segment:status',
  'waybill:sign',
  'bill:settle',
  'waybill:notarize',
  'document:upload',
  'document:sign',
  'document:ocr',
  'container:release',
  'container:movement',
  'container:return',
  'rail:apply',
  'sea:book',
  'dispatch:generate',
  'dispatch:confirm',
  'alert:ack',
  'alert:close',
  'exception:handle',
  'iot:ingest',
];

export const ROLE_FALLBACK_PERMISSIONS: Record<string, string[]> = {
  SHIPPER: [
    'menu:dashboard',
    'menu:orders',
    'menu:quotes',
    'menu:contracts',
    'menu:track',
    'menu:bills',
    'menu:waybills',
    'menu:documents',
    'order:create',
    'order:cancel',
    'quote:create',
    'quote:accept',
    'contract:sign',
    'waybill:sign',
    'document:upload',
    'document:sign',
  ],
  FORWARDER: [
    'menu:dashboard',
    'menu:orders',
    'menu:quotes',
    'menu:contracts',
    'menu:customers',
    'menu:track',
    'menu:waybills',
    'menu:documents',
    'order:create',
    'order:cancel',
    'quote:create',
    'quote:send',
    'quote:accept',
    'contract:create',
    'contract:send',
    'contract:sign',
    'customer:create',
    'document:upload',
  ],
  MTO: [
    'menu:dashboard',
    'menu:orders',
    'menu:quotes',
    'menu:contracts',
    'menu:customers',
    'menu:partners',
    'menu:master',
    'menu:dispatch',
    'menu:track',
    'menu:settlement',
    'menu:bills',
    'menu:integration',
    'menu:audit',
    'menu:waybills',
    'menu:containers',
    'menu:documents',
    'order:create',
    'order:cancel',
    'order:dispatch',
    'quote:create',
    'quote:send',
    'quote:accept',
    'contract:create',
    'contract:send',
    'price:create',
    'customer:create',
    'partner:create',
    'integration:retry',
    'waybill:notarize',
    'document:upload',
    'document:sign',
    'document:ocr',
    'container:release',
    'container:movement',
    'container:return',
    'menu:monitor',
    'menu:alerts',
    'menu:capacity',
    'dispatch:generate',
    'dispatch:confirm',
    'alert:ack',
    'alert:close',
    'exception:handle',
    'iot:ingest',
  ],
  CARRIER: [
    'menu:dashboard',
    'menu:orders',
    'menu:tasks',
    'menu:track',
    'menu:waybills',
    'menu:containers',
    'menu:monitor',
    'menu:alerts',
    'segment:status',
    'container:movement',
  ],
  RAIL_CARRIER: [
    'menu:dashboard',
    'menu:orders',
    'menu:track',
    'menu:waybills',
    'menu:rail',
    'menu:monitor',
    'rail:apply',
  ],
  SEA_CARRIER: [
    'menu:dashboard',
    'menu:orders',
    'menu:track',
    'menu:waybills',
    'menu:sea',
    'menu:monitor',
    'sea:book',
  ],
  TERMINAL: [
    'menu:dashboard',
    'menu:terminal',
    'menu:track',
    'menu:waybills',
    'menu:containers',
    'menu:monitor',
    'menu:alerts',
    'segment:status',
    'container:movement',
    'container:return',
    'document:upload',
  ],
  SETTLEMENT: [
    'menu:dashboard',
    'menu:settlement',
    'menu:bills',
    'menu:orders',
    'menu:waybills',
    'menu:documents',
    'bill:settle',
  ],
  ADMIN: [...MENU_CODES, ...BUTTON_CODES],
};

export interface MenuDef {
  code: string;
  label: string;
  path: string;
  testid: string;
  group: string;
}

/** 24 个平台菜单（Stage 3，按权限码渲染） */
export const MENU_DEFS: MenuDef[] = [
  { code: 'menu:dashboard', label: '平台总览', path: '/dashboard', testid: 'nav-dashboard', group: '业务受理' },
  { code: 'menu:orders', label: '订单中心', path: '/orders', testid: 'nav-orders', group: '业务受理' },
  { code: 'menu:quotes', label: '报价工作台', path: '/quotes', testid: 'nav-quotes', group: '业务受理' },
  { code: 'menu:contracts', label: '合同管理', path: '/contracts', testid: 'nav-contracts', group: '业务受理' },
  { code: 'menu:waybills', label: '运单中心', path: '/waybills', testid: 'nav-waybills', group: '业务受理' },
  { code: 'menu:documents', label: '单证中心', path: '/documents', testid: 'nav-documents', group: '业务受理' },
  { code: 'menu:customers', label: '客户管理', path: '/master/customers', testid: 'nav-customers', group: '主数据' },
  { code: 'menu:partners', label: '伙伴管理', path: '/master/partners', testid: 'nav-partners', group: '主数据' },
  { code: 'menu:master', label: '主数据', path: '/master/data', testid: 'nav-master', group: '主数据' },
  { code: 'menu:dispatch', label: '调度中心', path: '/dispatch/plans', testid: 'nav-dispatch', group: '履约执行' },
  { code: 'menu:dispatch', label: '调度看板', path: '/dispatch/board', testid: 'nav-board', group: '履约执行' },
  { code: 'menu:capacity', label: '运力池', path: '/capacity', testid: 'nav-capacity', group: '履约执行' },
  { code: 'menu:tasks', label: '运输任务', path: '/tasks', testid: 'nav-tasks', group: '履约执行' },
  { code: 'menu:terminal', label: '港站作业', path: '/terminal', testid: 'nav-terminal', group: '履约执行' },
  { code: 'menu:containers', label: '箱管中心', path: '/containers', testid: 'nav-containers', group: '履约执行' },
  { code: 'menu:rail', label: '铁路工作台', path: '/rail/tasks', testid: 'nav-rail', group: '履约执行' },
  { code: 'menu:sea', label: '水路工作台', path: '/sea/tasks', testid: 'nav-sea', group: '履约执行' },
  { code: 'menu:track', label: '运单跟踪', path: '/orders?view=track', testid: 'nav-track', group: '履约执行' },
  { code: 'menu:settlement', label: '结算工作台', path: '/settlement', testid: 'nav-settlement', group: '履约执行' },
  { code: 'menu:bills', label: '账单中心', path: '/orders?view=bills', testid: 'nav-bills', group: '履约执行' },
  { code: 'menu:monitor', label: '监控大屏', path: '/monitor', testid: 'nav-monitor', group: '监控预警' },
  { code: 'menu:alerts', label: '预警中心', path: '/alerts', testid: 'nav-alerts', group: '监控预警' },
  { code: 'menu:integration', label: '集成中心', path: '/integration/messages', testid: 'nav-integration', group: '平台治理' },
  { code: 'menu:audit', label: '审计日志', path: '/audit/logs', testid: 'nav-audit', group: '平台治理' },
];

// ───────────────────────────── 状态 / 类型中文标签 ─────────────────────────────

export const ORDER_STATUS_LABELS: Record<string, string> = {
  CREATED: '待调度',
  CONTRACTED: '已签合同',
  CONFIRMED: '已确认',
  DISPATCHED: '已调度',
  IN_TRANSIT: '运输中',
  ARRIVED: '已到达',
  SIGNED: '已签收',
  BILLED: '已出账',
  CANCELLED: '已取消',
};

export const ORDER_STATUS_OPTIONS = Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const ORDER_TYPE_LABELS: Record<string, string> = {
  ROAD_RAIL: '公铁联运',
  RAIL_SEA: '铁水联运',
  ROAD_RAIL_SEA: '公铁水联运',
};

export const ORDER_TYPE_OPTIONS = Object.entries(ORDER_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const SOURCE_LABELS: Record<string, string> = {
  QUICK: '快速下单',
  QUOTE: '报价转单',
};

export const SOURCE_OPTIONS = Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }));

export const PRIORITY_LABELS: Record<string, string> = {
  NORMAL: '普通',
  URGENT: '加急',
};

export const WAYBILL_STATUS_LABELS: Record<string, string> = {
  PENDING: '待发运',
  IN_TRANSIT: '运输中',
  ARRIVED: '已到达',
  SIGNED: '已签收',
};

export const SEGMENT_STATUS_LABELS: Record<string, string> = {
  ACCEPTED: '已接单',
  IN_TRANSIT: '运输中',
  ARRIVED: '已到达',
  COMPLETED: '已完成',
};

export const BILL_STATUS_LABELS: Record<string, string> = {
  ISSUED: '已出账',
  PAID: '已支付',
};

export const CONTAINER_STATUS_LABELS: Record<string, string> = {
  EMPTY: '空箱',
  RELEASED: '已放箱',
  GATE_IN: '已进场',
  LOADED: '已装箱',
  IN_TRANSIT: '运输中',
  ARRIVED: '已到达',
  DELIVERED: '已送达',
  RETURNED: '已还箱',
  IN_REPAIR: '维修中',
  AT_DEPOT: '在堆场',
};

export const MODE_LABELS: Record<string, string> = {
  ROAD: '公路',
  SEA: '海运',
  RAIL: '铁路',
  PORT: '港杂',
};

export const TRACK_SOURCE_LABELS: Record<string, string> = {
  MOCK_GPS: 'GPS 在途',
  MOCK_EDI: 'EDI 节点',
  CARRIER_REPORT: '承运人上报',
  TERMINAL_REPORT: '港站上报',
  MTO: '平台节点',
};

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  DRAFT: '询价中',
  SENT: '已报价',
  ACCEPTED: '已接受',
  EXPIRED: '已过期',
  CANCELLED: '已取消',
};

export const QUOTE_STATUS_OPTIONS = Object.entries(QUOTE_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PENDING_SIGN: '待签署',
  SIGNED: '已签署',
  TERMINATED: '已终止',
};

export const CONTRACT_STATUS_OPTIONS = Object.entries(CONTRACT_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  FRAMEWORK: '框架合同',
  SPOT: '单票合同',
};

export const PARTNER_TYPE_LABELS: Record<string, string> = {
  ROAD_CARRIER: '公路承运人',
  RAIL_OPERATOR: '铁路运营方',
  SEA_CARRIER: '水路承运人',
  PORT: '港口',
  RAIL_STATION: '铁路货场',
  DEPOT: '堆场',
  WAREHOUSE: '仓库',
  FORWARDER: '货代',
  FINANCE: '金融机构',
  INSURANCE: '保险机构',
  REGULATOR: '监管机构',
};

export const PARTNER_TYPE_OPTIONS = Object.entries(PARTNER_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const NODE_TYPE_LABELS: Record<string, string> = {
  PORT: '港口',
  RAIL_STATION: '铁路货场',
  DEPOT: '堆场',
  WAREHOUSE: '仓库',
};

export const CALC_METHOD_LABELS: Record<string, string> = {
  PER_CONTAINER: '按箱',
  PER_KM: '按公里',
  PER_TON: '按吨',
  PER_TEU: '按 TEU',
  FLAT: '一口价',
};

export const CALC_METHOD_OPTIONS = Object.entries(CALC_METHOD_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const CHARGE_TYPE_LABELS: Record<string, string> = {
  BASE: '基础费',
  SURCHARGE: '附加费',
};

export const PAYMENT_TERMS_OPTIONS = [
  { value: 'PREPAID', label: '预付' },
  { value: 'MONTHLY_30', label: '月结30天' },
  { value: 'MONTHLY_60', label: '月结60天' },
  { value: 'COD', label: '货到付款' },
];

export const INTEGRATION_STATUS_LABELS: Record<string, string> = {
  PENDING: '待处理',
  SUCCESS: '成功',
  FAILED: '失败',
  RETRYING: '重试中',
};

export const INTEGRATION_DIRECTION_LABELS: Record<string, string> = {
  IN: '接收',
  OUT: '发送',
};

export const SYSTEM_STATUS_LABELS: Record<string, string> = {
  UP: '正常',
  DOWN: '异常',
  DEGRADED: '降级',
};

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  TODO: '待办',
  ALERT: '预警',
  INFO: '通知',
};

export const CONTAINER_TYPES = ['20GP', '40GP', '40HQ', '45HQ', '40RF'];

/** 港站进场箱况可选项 */
export const CONDITION_OPTIONS = [
  '箱况良好，无破损',
  '铅封完好，箱体正常',
  '箱体轻微划痕，不影响运输',
  '箱门变形，需更换',
];

/** 分段配色（轨迹图 / 饼图统一） */
export const MODE_COLORS: Record<string, string> = {
  ROAD: '#409eff',
  SEA: '#13c2c2',
  RAIL: '#fa8c16',
  PORT: '#909399',
};

export const ORDER_FLOW_STEPS = ['CREATED', 'DISPATCHED', 'IN_TRANSIT', 'ARRIVED', 'SIGNED', 'BILLED'];

export const QUOTE_ORDER_TYPE_OPTIONS = ORDER_TYPE_OPTIONS;

export const CUSTOMER_CREDIT_LEVELS = ['AAA', 'AA', 'A', 'B', 'C'];

// ───────────────────────────── 标签函数 ─────────────────────────────

export function orderStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function orderTypeLabel(type?: string | null): string {
  if (!type) return '—';
  return ORDER_TYPE_LABELS[type] ?? type;
}

export function sourceLabel(source?: string | null): string {
  if (!source) return '—';
  return SOURCE_LABELS[source] ?? source;
}

export function priorityLabel(priority?: string | null): string {
  if (!priority) return '普通';
  return PRIORITY_LABELS[priority] ?? priority;
}

export function waybillStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return WAYBILL_STATUS_LABELS[status] ?? status;
}

export function segmentStatusLabel(status?: string | null, mode?: string | null): string {
  if (!status) return '—';
  if (status === 'PENDING') {
    return mode === 'ROAD' ? '待接单' : '待进场';
  }
  return SEGMENT_STATUS_LABELS[status] ?? status;
}

export function billStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return BILL_STATUS_LABELS[status] ?? status;
}

export function containerStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return CONTAINER_STATUS_LABELS[status] ?? status;
}

export function modeLabel(mode?: string | null): string {
  if (!mode) return '—';
  return MODE_LABELS[mode] ?? mode;
}

export function trackSourceLabel(source?: string | null): string {
  if (!source) return '—';
  return TRACK_SOURCE_LABELS[source] ?? source;
}

export function quoteStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return QUOTE_STATUS_LABELS[status] ?? status;
}

export function contractStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return CONTRACT_STATUS_LABELS[status] ?? status;
}

export function contractTypeLabel(type?: string | null): string {
  if (!type) return '—';
  return CONTRACT_TYPE_LABELS[type] ?? type;
}

export function partnerTypeLabel(type?: string | null): string {
  if (!type) return '—';
  return PARTNER_TYPE_LABELS[type] ?? type;
}

export function nodeTypeLabel(type?: string | null): string {
  if (!type) return '—';
  return NODE_TYPE_LABELS[type] ?? type;
}

export function calcMethodLabel(method?: string | null): string {
  if (!method) return '—';
  return CALC_METHOD_LABELS[method] ?? method;
}

export function chargeTypeLabel(type?: string | null): string {
  if (!type) return '—';
  return CHARGE_TYPE_LABELS[type] ?? type;
}

export function integrationStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return INTEGRATION_STATUS_LABELS[status] ?? status;
}

export function notificationTypeLabel(type?: string | null): string {
  if (!type) return '—';
  return NOTIFICATION_TYPE_LABELS[type] ?? type;
}

// ───────────────────────────── Stage 2：一单制 / 单证 / 箱管 / 铁路水路 ─────────────────────────────

export const WAYBILL_TYPE_LABELS: Record<string, string> = {
  MASTER: '主运单',
  SEGMENT: '分段运单',
};

export const WAYBILL_TYPE_OPTIONS = Object.entries(WAYBILL_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const WAYBILL_STATUS_OPTIONS = Object.entries(WAYBILL_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const EVENT_TYPE_LABELS: Record<string, string> = {
  ISSUE: '运单签发',
  RELEASE: '放箱',
  PICKUP: '提箱',
  GATE_IN: '进场',
  LOAD: '装箱',
  DEPART: '发运',
  ARRIVE: '到达',
  DISCHARGE: '卸箱',
  HANDOVER: '交接',
  POD: '回单',
  SIGN: '签章',
  NOTARIZE: '存证',
};

export const DOC_TYPE_LABELS: Record<string, string> = {
  ORDER_CONFIRM: '订单确认单',
  WAYBILL_MASTER: '主运单',
  WAYBILL_SEGMENT: '分段运单',
  PACKING_LIST: '装箱单',
  POD: '回单',
  OTHER: '其他单证',
};

export const DOC_TYPE_OPTIONS = Object.entries(DOC_TYPE_LABELS).map(([value, label]) => ({ value, label }));

export const DOC_BIZ_TYPE_LABELS: Record<string, string> = {
  ORDER: '订单',
  WAYBILL: '运单',
  BILL: '账单',
  CONTRACT: '合同',
};

export const DOC_BIZ_TYPE_OPTIONS = Object.entries(DOC_BIZ_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const OCR_STATUS_LABELS: Record<string, string> = {
  NONE: '未识别',
  PENDING: '识别中',
  SUCCESS: '识别成功',
  FAILED: '识别失败',
};

export const OCR_STATUS_OPTIONS = Object.entries(OCR_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const SIGN_STATUS_LABELS: Record<string, string> = {
  UNSIGNED: '未签章',
  SIGNED: '已签章',
};

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  RELEASE: '放箱',
  PICKUP: '提箱',
  GATE_IN: '进场',
  LOAD: '装箱',
  DEPART: '发运',
  ARRIVE: '到达',
  DISCHARGE: '卸箱',
  GATE_OUT: '出场',
  RETURN: '还箱',
  REPAIR: '维修',
};

export const MOVEMENT_TYPE_OPTIONS = Object.entries(MOVEMENT_TYPE_LABELS)
  .filter(([value]) => ['PICKUP', 'GATE_IN', 'LOAD', 'DEPART', 'ARRIVE', 'DISCHARGE', 'GATE_OUT'].includes(value))
  .map(([value, label]) => ({ value, label }));

export const STORAGE_STATUS_LABELS: Record<string, string> = {
  STACKED: '堆存中',
  RELEASED: '已提离',
};

export const RAIL_DEMAND_STATUS_LABELS: Record<string, string> = {
  NONE: '未提报',
  PENDING: '待受理',
  APPLIED: '已提报',
  ACCEPTED: '已受理',
  CONFIRMED: '已受理',
  REJECTED: '已驳回',
  FAILED: '提报失败',
};

export const SEA_BOOKING_STATUS_LABELS: Record<string, string> = {
  NOT_BOOKED: '未订舱',
  NONE: '未订舱',
  PENDING: '待确认',
  BOOKED: '已订舱',
  CONFIRMED: '已确认舱位',
  FAILED: '订舱失败',
};

export function waybillTypeLabel(type?: string | null): string {
  if (!type) return '—';
  return WAYBILL_TYPE_LABELS[type] ?? type;
}

export function eventTypeLabel(type?: string | null): string {
  if (!type) return '—';
  return EVENT_TYPE_LABELS[type] ?? type;
}

export function docTypeLabel(type?: string | null): string {
  if (!type) return '—';
  return DOC_TYPE_LABELS[type] ?? type;
}

export function docBizTypeLabel(type?: string | null): string {
  if (!type) return '—';
  return DOC_BIZ_TYPE_LABELS[type] ?? type;
}

export function ocrStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return OCR_STATUS_LABELS[status] ?? status;
}

export function signStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return SIGN_STATUS_LABELS[status] ?? status;
}

export function movementTypeLabel(type?: string | null): string {
  if (!type) return '—';
  return MOVEMENT_TYPE_LABELS[type] ?? type;
}

export function storageStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return STORAGE_STATUS_LABELS[status] ?? status;
}

export function railDemandStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return RAIL_DEMAND_STATUS_LABELS[status] ?? status;
}

export function seaBookingStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return SEA_BOOKING_STATUS_LABELS[status] ?? status;
}

// ───────────────────────────── Stage 3：智能调度 / 运力 / 监控 / 预警 / IoT ─────────────────────────────

export const PLAN_STRATEGY_LABELS: Record<string, string> = {
  COST: '成本优先',
  TIME: '时效优先',
  BALANCED: '综合平衡',
};

export const PLAN_STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  CONFIRMED: '已确认',
  REJECTED: '已作废',
};

export const RESOURCE_TYPE_LABELS: Record<string, string> = {
  VEHICLE: '车辆',
  TRAIN: '班列',
  VESSEL: '班轮',
};

export const TRANSFER_STATUS_LABELS: Record<string, string> = {
  OK: '衔接正常',
  TIGHT: '衔接紧张',
  MISSED: '错过衔接',
};

export const VEHICLE_STATUS_LABELS: Record<string, string> = {
  IDLE: '空闲',
  IN_TASK: '任务中',
  MAINTENANCE: '维修中',
};

export const VEHICLE_TYPE_LABELS: Record<string, string> = {
  TRACTOR: '牵引车',
  TRAILER: '挂车',
  VAN: '厢式车',
};

export const SCHEDULE_STATUS_LABELS: Record<string, string> = {
  PLANNED: '计划中',
  OPEN: '可订舱',
  DEPARTED: '已发运',
  ARRIVED: '已到达',
  CANCELLED: '已取消',
};

export const ALERT_TYPE_LABELS: Record<string, string> = {
  DELAY: '延误',
  DEVIATION: '偏航',
  TEMP_HUMIDITY: '温湿度',
  STAY: '异常停留',
  DOOR_OPEN: '开门',
  EXCEPTION: '异常',
};

export const ALERT_LEVEL_LABELS: Record<string, string> = {
  INFO: '提示',
  WARN: '警告',
  CRITICAL: '严重',
};

export const ALERT_STATUS_LABELS: Record<string, string> = {
  OPEN: '待处理',
  ACK: '已确认',
  CLOSED: '已关闭',
};

export const EXCEPTION_STATUS_LABELS: Record<string, string> = {
  OPEN: '待处置',
  PROCESSING: '处置中',
  RESOLVED: '已解决',
  CLOSED: '已关闭',
};

export const EXCEPTION_TYPE_LABELS: Record<string, string> = {
  DELAY: '延误',
  DEVIATION: '偏航',
  TEMP_HUMIDITY: '温湿度异常',
  STAY: '异常停留',
  DOOR_OPEN: '异常开门',
  DAMAGE: '货损',
  OTHER: '其他',
};

export const IOT_DEVICE_TYPE_LABELS: Record<string, string> = {
  GPS: 'GPS 定位',
  TEMP_HUMIDITY: '温湿度',
  DOOR: '门磁',
  IMPACT: '震动',
};

export const IOT_DEVICE_STATUS_LABELS: Record<string, string> = {
  ONLINE: '在线',
  OFFLINE: '离线',
};

export const FENCE_TYPE_LABELS: Record<string, string> = {
  PORT: '港口',
  STATION: '车站',
  WAREHOUSE: '仓库',
  DEPOT: '堆场',
};

export function planStrategyLabel(strategy?: string | null): string {
  if (!strategy) return '—';
  return PLAN_STRATEGY_LABELS[strategy] ?? strategy;
}

export function planStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return PLAN_STATUS_LABELS[status] ?? status;
}

export function resourceTypeLabel(type?: string | null): string {
  if (!type) return '—';
  return RESOURCE_TYPE_LABELS[type] ?? type;
}

export function transferStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return TRANSFER_STATUS_LABELS[status] ?? status;
}

export function vehicleStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return VEHICLE_STATUS_LABELS[status] ?? status;
}

export function vehicleTypeLabel(type?: string | null): string {
  if (!type) return '—';
  return VEHICLE_TYPE_LABELS[type] ?? type;
}

export function scheduleStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return SCHEDULE_STATUS_LABELS[status] ?? status;
}

export function alertTypeLabel(type?: string | null): string {
  if (!type) return '—';
  return ALERT_TYPE_LABELS[type] ?? type;
}

export function alertLevelLabel(level?: string | null): string {
  if (!level) return '—';
  return ALERT_LEVEL_LABELS[level] ?? level;
}

export function alertStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return ALERT_STATUS_LABELS[status] ?? status;
}

export function exceptionStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return EXCEPTION_STATUS_LABELS[status] ?? status;
}

export function exceptionTypeLabel(type?: string | null): string {
  if (!type) return '—';
  return EXCEPTION_TYPE_LABELS[type] ?? type;
}

export function iotDeviceTypeLabel(type?: string | null): string {
  if (!type) return '—';
  return IOT_DEVICE_TYPE_LABELS[type] ?? type;
}

export function iotDeviceStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return IOT_DEVICE_STATUS_LABELS[status] ?? status;
}

export function fenceTypeLabel(type?: string | null): string {
  if (!type) return '—';
  return FENCE_TYPE_LABELS[type] ?? type;
}

/** 告警/状态标签配色（el-tag type） */
export function alertLevelTagType(level?: string | null): 'info' | 'warning' | 'danger' {
  if (level === 'CRITICAL') return 'danger';
  if (level === 'WARN') return 'warning';
  return 'info';
}

export function planStrategyTagType(strategy?: string | null): 'primary' | 'success' | 'warning' {
  if (strategy === 'COST') return 'success';
  if (strategy === 'TIME') return 'warning';
  return 'primary';
}
