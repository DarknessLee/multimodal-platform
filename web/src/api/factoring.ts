import { request } from './http';
import type { FactoringApplication, PageResult } from '../types';

export function fetchFactoringApplications(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<FactoringApplication>> {
  return request<PageResult<FactoringApplication>>({
    url: '/factoring/applications',
    method: 'GET',
    params,
  });
}

export function applyFactoring(payload: {
  billId: number;
  financePartnerId: number;
  amount: number;
  discountRate: number;
}): Promise<FactoringApplication> {
  return request<FactoringApplication>({
    url: '/factoring/applications',
    method: 'POST',
    data: payload,
  });
}

export function approveFactoring(
  id: number | string,
  approved: boolean,
): Promise<FactoringApplication> {
  return request<FactoringApplication>({
    url: `/factoring/applications/${id}/approve`,
    method: 'POST',
    data: { approved },
  });
}

export function settleFactoring(id: number | string): Promise<FactoringApplication> {
  return request<FactoringApplication>({
    url: `/factoring/applications/${id}/settle`,
    method: 'POST',
  });
}
