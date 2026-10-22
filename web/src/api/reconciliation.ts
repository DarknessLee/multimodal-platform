import { request } from './http';
import type { PageResult, ReconciliationDetail, ReconciliationListItem } from '../types';

export function fetchReconciliations(params?: {
  status?: string;
  counterpartyType?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<ReconciliationListItem>> {
  return request<PageResult<ReconciliationListItem>>({
    url: '/reconciliations',
    method: 'GET',
    params,
  });
}

export function fetchReconciliation(id: number | string): Promise<ReconciliationDetail> {
  return request<ReconciliationDetail>({ url: `/reconciliations/${id}`, method: 'GET' });
}

export function createReconciliation(payload: {
  counterpartyType: string;
  counterpartyId: number;
  periodStart: string;
  periodEnd: string;
}): Promise<ReconciliationDetail> {
  return request<ReconciliationDetail>({ url: '/reconciliations', method: 'POST', data: payload });
}

export function sendReconciliation(id: number | string): Promise<ReconciliationDetail> {
  return request<ReconciliationDetail>({ url: `/reconciliations/${id}/send`, method: 'POST' });
}

export function confirmReconciliation(
  id: number | string,
  payload: {
    confirmedAmount: number;
    items?: Array<{ billId: number; confirmedAmount: number }>;
  },
): Promise<ReconciliationDetail> {
  return request<ReconciliationDetail>({
    url: `/reconciliations/${id}/confirm`,
    method: 'POST',
    data: payload,
  });
}

export function disputeReconciliation(
  id: number | string,
  payload: { reason: string; items?: Array<{ billId: number; differenceReason: string }> },
): Promise<ReconciliationDetail> {
  return request<ReconciliationDetail>({
    url: `/reconciliations/${id}/dispute`,
    method: 'POST',
    data: payload,
  });
}
