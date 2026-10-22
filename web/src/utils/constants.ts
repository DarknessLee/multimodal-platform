// 中文标签、演示账号、枚举选项（与 docs/02-接口契约.md 第 1/2/5 节一致）

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
    duty: '下单、查看全程轨迹、签收、查看账单',
  },
  {
    username: 'mto01',
    password: 'demo123',
    role: 'MTO',
    roleLabel: '调度',
    displayName: '中远海联运 MTO',
    duty: '查看新订单、分配公路段承运商',
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
    username: 'terminal01',
    password: 'demo123',
    role: 'TERMINAL',
    roleLabel: '港站',
    displayName: '洋山港/阳逻港操作员',
    duty: '确认进场、录入箱况、到港/到站',
  },
  {
    username: 'settlement01',
    password: 'demo123',
    role: 'SETTLEMENT',
    roleLabel: '结算',
    displayName: '联运结算中心',
    duty: '对已签收订单生成分段账单',
  },
];

export const ROLE_LABELS: Record<string, string> = {
  SHIPPER: '货主',
  MTO: '调度',
  CARRIER: '公路承运人',
  TERMINAL: '港站',
  SETTLEMENT: '结算',
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  CREATED: '待调度',
  DISPATCHED: '已调度',
  IN_TRANSIT: '运输中',
  ARRIVED: '已到达',
  SIGNED: '已签收',
  BILLED: '已出账',
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
  GATE_IN: '已进场',
  LOADED: '已装箱',
  IN_TRANSIT: '运输中',
  ARRIVED: '已到达',
  DELIVERED: '已送达',
};

export const MODE_LABELS: Record<string, string> = {
  ROAD: '公路',
  SEA: '海运',
  RAIL: '铁路',
};

export const TRACK_SOURCE_LABELS: Record<string, string> = {
  MOCK_GPS: 'GPS 在途',
  MOCK_EDI: 'EDI 节点',
  CARRIER_REPORT: '承运人上报',
  TERMINAL_REPORT: '港站上报',
  MTO: '平台节点',
};

export const CONTAINER_TYPES = ['20GP', '40GP', '40HQ', '45HQ'];

export const ORDER_STATUS_OPTIONS = [
  { value: 'CREATED', label: '待调度' },
  { value: 'DISPATCHED', label: '已调度' },
  { value: 'IN_TRANSIT', label: '运输中' },
  { value: 'ARRIVED', label: '已到达' },
  { value: 'SIGNED', label: '已签收' },
  { value: 'BILLED', label: '已出账' },
];

/** 港站进场箱况可选项 */
export const CONDITION_OPTIONS = [
  '箱况良好，无破损',
  '铅封完好，箱体正常',
  '箱体轻微划痕，不影响运输',
  '箱门变形，需更换',
];

export function orderStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return ORDER_STATUS_LABELS[status] ?? status;
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

/** 分段配色（轨迹图 / 饼图统一） */
export const MODE_COLORS: Record<string, string> = {
  ROAD: '#409eff',
  SEA: '#13c2c2',
  RAIL: '#fa8c16',
};

export const ORDER_FLOW_STEPS = ['CREATED', 'DISPATCHED', 'IN_TRANSIT', 'ARRIVED', 'SIGNED', 'BILLED'];
