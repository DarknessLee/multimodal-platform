// 状态 / 角色 / 运输方式 / 平台主数据的中文 label
import type {
  ActiveStatus,
  AlertLevel,
  AlertStatus,
  AlertType,
  BillStatus,
  CalcMethod,
  ChargeType,
  ContainerMovementType,
  ContainerStatus,
  ContractStatus,
  ContractType,
  DeviceStatus,
  DeviceType,
  DocSignStatus,
  DocType,
  FenceStatus,
  FenceType,
  IntegrationStatus,
  NodeType,
  NotificationType,
  OcrStatus,
  OrderSource,
  OrderStatus,
  OrderType,
  PartnerType,
  PlanStatus,
  PlanStrategy,
  Priority,
  QuoteStatus,
  ResourceType,
  Role,
  ScheduleStatus,
  SealOwnerType,
  SegmentMode,
  SegmentStatus,
  StorageStatus,
  TicketStatus,
  TransferWindowStatus,
  VehicleStatus,
  VehicleType,
  WaybillEventType,
  WaybillStatus,
  WaybillType,
} from '../types';

export const ROLE_LABELS: Record<Role, string> = {
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

export const MODE_LABELS: Record<SegmentMode | 'PORT', string> = {
  ROAD: '公路',
  SEA: '海运',
  RAIL: '铁路',
  PORT: '港杂',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
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

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  ROAD_RAIL: '公铁联运',
  RAIL_SEA: '铁水联运',
  ROAD_RAIL_SEA: '公铁水联运',
};

export const SOURCE_LABELS: Record<OrderSource, string> = {
  QUICK: '快速下单',
  QUOTE: '报价转单',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  NORMAL: '普通',
  URGENT: '加急',
};

export const WAYBILL_STATUS_LABELS: Record<WaybillStatus, string> = {
  PENDING: '待发运',
  IN_TRANSIT: '运输中',
  ARRIVED: '已到达',
  SIGNED: '已签收',
};

export const SEGMENT_STATUS_LABELS: Record<Exclude<SegmentStatus, 'PENDING'>, string> = {
  ACCEPTED: '已接单',
  IN_TRANSIT: '运输中',
  ARRIVED: '已到达',
  COMPLETED: '已完成',
};

export const BILL_STATUS_LABELS: Record<BillStatus, string> = {
  ISSUED: '已出账',
  PAID: '已支付',
};

export const CONTAINER_STATUS_LABELS: Record<ContainerStatus, string> = {
  EMPTY: '空箱',
  RELEASED: '已放箱',
  GATE_IN: '已进场',
  LOADED: '已装载',
  IN_TRANSIT: '运输中',
  ARRIVED: '已到达',
  DELIVERED: '已送达',
  RETURNED: '已还箱',
  IN_REPAIR: '维修中',
  AT_DEPOT: '在堆场',
};

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: '询价中',
  SENT: '已报价',
  ACCEPTED: '已接受',
  EXPIRED: '已过期',
  CANCELLED: '已取消',
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  DRAFT: '草稿',
  PENDING_SIGN: '待签署',
  SIGNED: '已签署',
  TERMINATED: '已终止',
};

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  FRAMEWORK: '框架合同',
  SPOT: '单票合同',
};

export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
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

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  PORT: '港口',
  RAIL_STATION: '铁路货场',
  DEPOT: '堆场',
  WAREHOUSE: '仓库',
};

export const ACTIVE_STATUS_LABELS: Record<ActiveStatus, string> = {
  ACTIVE: '正常',
  DISABLED: '停用',
};

export const CHARGE_TYPE_LABELS: Record<ChargeType, string> = {
  BASE: '基础费',
  SURCHARGE: '附加费',
};

export const CALC_METHOD_LABELS: Record<CalcMethod, string> = {
  PER_CONTAINER: '按箱',
  PER_KM: '按公里',
  PER_TON: '按吨',
  PER_TEU: '按TEU',
  FLAT: '一口价',
};

export const PAYMENT_TERMS_LABELS: Record<string, string> = {
  PREPAID: '预付',
  MONTHLY_30: '月结30天',
  MONTHLY_60: '月结60天',
  COD: '货到付款',
};

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  PENDING: '待处理',
  SUCCESS: '成功',
  FAILED: '失败',
  RETRYING: '重试中',
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  TODO: '待办',
  ALERT: '预警',
  INFO: '通知',
};

/** 分段 PENDING 的中文按运输方式区分：公路=待接单，海运/铁路=待进场（契约 4.4） */
export function segmentStatusLabel(mode: SegmentMode, status: SegmentStatus): string {
  if (status === 'PENDING') {
    return mode === 'ROAD' ? '待接单' : '待进场';
  }
  return SEGMENT_STATUS_LABELS[status];
}

/** 订单状态固定排序（看板 distribution 用） */
export const ORDER_STATUS_ORDER: OrderStatus[] = [
  'CREATED',
  'CONTRACTED',
  'CONFIRMED',
  'DISPATCHED',
  'IN_TRANSIT',
  'ARRIVED',
  'SIGNED',
  'BILLED',
  'CANCELLED',
];

// ── Stage 2：一单制 / 单证 / 存证 / 箱管 ────────────────────────────────────

export const WAYBILL_TYPE_LABELS: Record<WaybillType, string> = {
  MASTER: '主运单',
  SEGMENT: '分段运单',
};

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  ORDER_CONFIRM: '订单确认书',
  WAYBILL_MASTER: '主运单',
  WAYBILL_SEGMENT: '分段运单',
  PACKING_LIST: '装箱单',
  POD: '签收回单',
  OTHER: '其他单证',
};

export const OCR_STATUS_LABELS: Record<OcrStatus, string> = {
  NONE: '未识别',
  PENDING: '识别中',
  SUCCESS: '识别成功',
  FAILED: '识别失败',
};

export const DOC_SIGN_STATUS_LABELS: Record<DocSignStatus, string> = {
  UNSIGNED: '未签章',
  SIGNED: '已签章',
};

export const WAYBILL_EVENT_LABELS: Record<WaybillEventType, string> = {
  ISSUE: '运单签发',
  RELEASE: '放箱',
  PICKUP: '提箱',
  GATE_IN: '进场',
  LOAD: '装车/装船',
  DEPART: '发运',
  ARRIVE: '到达',
  DISCHARGE: '卸箱/卸船',
  HANDOVER: '交接',
  POD: '回单',
  SIGN: '签章/签收',
  NOTARIZE: '存证',
};

export const CONTAINER_MOVEMENT_LABELS: Record<ContainerMovementType, string> = {
  RELEASE: '放箱',
  PICKUP: '提箱',
  GATE_IN: '进场',
  LOAD: '装箱/装船',
  DEPART: '发运',
  ARRIVE: '到达',
  DISCHARGE: '卸箱/卸船',
  GATE_OUT: '出场',
  RETURN: '还箱',
  REPAIR: '维修',
};

export const STORAGE_STATUS_LABELS: Record<StorageStatus, string> = {
  STACKED: '堆存中',
  RELEASED: '已提离',
};

export const SEAL_OWNER_LABELS: Record<SealOwnerType, string> = {
  PLATFORM: '平台',
  CUSTOMER: '客户',
  CARRIER: '承运人',
  TERMINAL: '港站',
};

/** 运输方式（既有 MODE_LABELS 不含空值兜底） */
export function modeLabel(mode: SegmentMode | null | undefined): string {
  return mode ? MODE_LABELS[mode] : '';
}

// ── Stage 3：运力池 / 智能调度 / 预警 / IoT ─────────────────────────────────

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  TRACTOR: '牵引车',
  TRAILER: '挂车',
  VAN: '厢式货车',
};

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  IDLE: '空闲',
  IN_TASK: '任务中',
  MAINTENANCE: '维护中',
};

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  PLANNED: '计划中',
  OPEN: '可订舱',
  DEPARTED: '已发车/已开航',
  ARRIVED: '已到达',
  CANCELLED: '已取消',
};

export const PLAN_STRATEGY_LABELS: Record<PlanStrategy, string> = {
  COST: '成本优先',
  TIME: '时效优先',
  BALANCED: '综合平衡',
};

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  DRAFT: '草稿',
  CONFIRMED: '已确认',
  REJECTED: '已作废',
};

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  VEHICLE: '车辆',
  TRAIN: '班列',
  VESSEL: '班轮',
};

export const TRANSFER_WINDOW_STATUS_LABELS: Record<TransferWindowStatus, string> = {
  OK: '衔接充裕',
  TIGHT: '衔接紧张',
  MISSED: '衔接错过',
};

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  DELAY: '延误',
  DEVIATION: '偏航',
  TEMP_HUMIDITY: '温湿度异常',
  STAY: '异常停留',
  DOOR_OPEN: '箱门开启',
  EXCEPTION: '异常事件',
};

export const ALERT_LEVEL_LABELS: Record<AlertLevel, string> = {
  INFO: '提示',
  WARN: '警告',
  CRITICAL: '严重',
};

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  OPEN: '待处理',
  ACK: '已确认',
  CLOSED: '已关闭',
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: '待处理',
  PROCESSING: '处理中',
  RESOLVED: '已解决',
  CLOSED: '已关闭',
};

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  GPS: 'GPS 定位',
  TEMP_HUMIDITY: '温湿度',
  DOOR: '门磁',
  IMPACT: '振动',
};

export const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = {
  ONLINE: '在线',
  OFFLINE: '离线',
};

export const FENCE_TYPE_LABELS: Record<FenceType, string> = {
  PORT: '港口',
  STATION: '铁路货场',
  WAREHOUSE: '仓库',
  DEPOT: '堆场',
};

export const FENCE_STATUS_LABELS: Record<FenceStatus, string> = {
  ACTIVE: '启用',
  DISABLED: '停用',
};
