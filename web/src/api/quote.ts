import { request } from './http';
import type { CreateQuotePayload, PageResult, QuoteDetail, QuoteListItem } from '../types';

export function fetchQuotes(params?: {
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<QuoteListItem>> {
  return request<PageResult<QuoteListItem>>({ url: '/quotes', method: 'GET', params });
}

export function fetchQuote(id: number | string): Promise<QuoteDetail> {
  return request<QuoteDetail>({ url: `/quotes/${id}`, method: 'GET' });
}

export function createQuote(payload: CreateQuotePayload): Promise<QuoteDetail> {
  return request<QuoteDetail>({ url: '/quotes', method: 'POST', data: payload });
}

export function sendQuote(id: number | string): Promise<QuoteDetail> {
  return request<QuoteDetail>({ url: `/quotes/${id}/send`, method: 'POST' });
}

export function acceptQuote(
  id: number | string,
  contractId?: number | null,
): Promise<{ orderId: number; orderNo: string }> {
  return request<{ orderId: number; orderNo: string }>({
    url: `/quotes/${id}/accept`,
    method: 'POST',
    data: contractId ? { contractId } : {},
  });
}
