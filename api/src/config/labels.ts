// 状态 / 角色 / 运输方式的中文 label（契约 2、4 节冻结）
import type {
  BillStatus,
  ContainerStatus,
  OrderStatus,
  Role,
  SegmentMode,
  SegmentStatus,
  WaybillStatus,
} from '../types';

export const ROLE_LABELS: Record<Role, string> = {
  SHIPPER: '货主',
  MTO: '调度',
  CARRIER: '公路承运人',
  TERMINAL: '港站',
  SETTLEMENT: '结算',
};

export const MODE_LABELS: Record<SegmentMode, string> = {
  ROAD: '公路',
  SEA: '海运',
  RAIL: '铁路',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  CREATED: '待调度',
  DISPATCHED: '已调度',
  IN_TRANSIT: '运输中',
  ARRIVED: '已到达',
  SIGNED: '已签收',
  BILLED: '已出账',
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
  GATE_IN: '已进场',
  LOADED: '已装载',
  IN_TRANSIT: '运输中',
  ARRIVED: '已到达',
  DELIVERED: '已送达',
};

/** 分段 PENDING 的中文按运输方式区分：公路=待接单，海运/铁路=待进场（契约 4.4） */
export function segmentStatusLabel(mode: SegmentMode, status: SegmentStatus): string {
  if (status === 'PENDING') {
    return mode === 'ROAD' ? '待接单' : '待进场';
  }
  return SEGMENT_STATUS_LABELS[status];
}
