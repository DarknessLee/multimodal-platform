import { request } from './http';
import type {
  BillData,
  CreateOrderPayload,
  DispatchResult,
  LoginResult,
  OrderDetail,
  OrderListItem,
  SegmentActionPayload,
  SegmentActionData,
  SignResult,
  TrackData,
  UserInfo,
} from '../types';

export interface OrderListParams {
  status?: string;
  keyword?: string;
  orderType?: string;
  source?: string;
  customerId?: number | string;
  page?: number;
  pageSize?: number;
}

/** 1. 登录（v1 额外返回 permissions/menus，v0 兼容） */
export function login(username: string, password: string): Promise<LoginResult> {
  return request<LoginResult>({ url: '/auth/login', method: 'POST', data: { username, password } });
}

/** v1：当前登录用户与权限集 */
export function fetchMe(): Promise<UserInfo & { permissions: string[] }> {
  return request<UserInfo & { permissions: string[] }>({ url: '/auth/me', method: 'GET' });
}

/** 2. 货主下单（v0 快速单 / v1 报价转单 + 多货物行） */
export function createOrder(payload: CreateOrderPayload): Promise<OrderDetail> {
  return request<OrderDetail>({ url: '/orders', method: 'POST', data: payload });
}

/** 3. 订单列表（按角色过滤；v1 支持 orderType/source/customerId） */
export function fetchOrders(params?: OrderListParams): Promise<OrderListItem[]> {
  return request<OrderListItem[]>({ url: '/orders', method: 'GET', params });
}

/** 4. 订单聚合详情 */
export function fetchOrderDetail(orderId: number | string): Promise<OrderDetail> {
  return request<OrderDetail>({ url: `/orders/${orderId}`, method: 'GET' });
}

/** 5. MTO 调度（v1 兼容 CREATED/CONTRACTED/CONFIRMED） */
export function dispatchOrder(orderId: number | string, roadCarrierCode: string): Promise<DispatchResult> {
  return request<DispatchResult>({
    url: `/orders/${orderId}/dispatch`,
    method: 'POST',
    data: { roadCarrierCode },
  });
}

/** 5.1 取消订单（未调度） */
export function cancelOrder(orderId: number | string, reason?: string): Promise<{ id: number; status: string; statusLabel: string }> {
  return request<{ id: number; status: string; statusLabel: string }>({
    url: `/orders/${orderId}/cancel`,
    method: 'POST',
    data: reason ? { reason } : {},
  });
}

/** 6. 节点上报/推进 */
export function updateSegmentStatus(segmentId: number | string, payload: SegmentActionPayload): Promise<SegmentActionData> {
  return request<SegmentActionData>({
    url: `/segments/${segmentId}/status`,
    method: 'POST',
    data: payload,
  });
}

/** 7. 运单轨迹 */
export function fetchTrack(waybillId: number | string): Promise<TrackData> {
  return request<TrackData>({ url: `/waybills/${waybillId}/track`, method: 'GET' });
}

/** 8. 货主签收 */
export function signWaybill(waybillId: number | string, signerName: string): Promise<SignResult> {
  return request<SignResult>({
    url: `/waybills/${waybillId}/sign`,
    method: 'POST',
    data: { signerName },
  });
}

/** 9. 结算出账 */
export function settleOrder(orderId: number | string): Promise<BillData> {
  return request<BillData>({ url: `/orders/${orderId}/settle`, method: 'POST' });
}

/** 10. 分段账单 */
export function fetchBill(billId: number | string): Promise<BillData> {
  return request<BillData>({ url: `/bills/${billId}`, method: 'GET' });
}
