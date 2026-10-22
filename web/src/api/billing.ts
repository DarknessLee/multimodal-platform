import { request } from './http';
import type { BillDetailResult, BillListItem, PageResult } from '../types';

export function fetchBills(params?: {
  billType?: string;
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<BillListItem>> {
  return request<PageResult<BillListItem>>({ url: '/bills', method: 'GET', params });
}

export function fetchBillDetail(id: number | string): Promise<BillDetailResult> {
  return request<BillDetailResult>({ url: `/bills/${id}`, method: 'GET' });
}
