import { request } from './http';
import type {
  NotarizeRecord,
  NotarizeVerifyResult,
  PageResult,
  WaybillDetail,
  WaybillDocBrief,
  WaybillEvent,
  WaybillListItem,
} from '../types';

export function fetchWaybills(params?: {
  type?: string;
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<WaybillListItem>> {
  return request<PageResult<WaybillListItem>>({ url: '/waybills', method: 'GET', params });
}

export function fetchWaybillDetail(id: number | string): Promise<WaybillDetail> {
  return request<WaybillDetail>({ url: `/waybills/${id}`, method: 'GET' });
}

export function fetchWaybillEvents(
  id: number | string,
  params?: { page?: number; pageSize?: number },
): Promise<PageResult<WaybillEvent>> {
  return request<PageResult<WaybillEvent>>({ url: `/waybills/${id}/events`, method: 'GET', params });
}

export function fetchWaybillDocuments(id: number | string): Promise<WaybillDocBrief[]> {
  return request<WaybillDocBrief[]>({ url: `/waybills/${id}/documents`, method: 'GET' });
}

export function fetchNotarizeRecords(params?: {
  bizType?: string;
  bizId?: number | string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<NotarizeRecord>> {
  return request<PageResult<NotarizeRecord>>({ url: '/notarize/records', method: 'GET', params });
}

export function verifyNotarize(txId: string): Promise<NotarizeVerifyResult> {
  return request<NotarizeVerifyResult>({
    url: `/notarize/verify/${encodeURIComponent(txId)}`,
    method: 'GET',
  });
}
