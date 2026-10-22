import { request } from './http';
import type {
  CreateInvoicePayload,
  InvoiceDetail,
  InvoiceListItem,
  PageResult,
} from '../types';

export function fetchInvoices(params?: {
  status?: string;
  billId?: number | string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<InvoiceListItem>> {
  return request<PageResult<InvoiceListItem>>({ url: '/invoices', method: 'GET', params });
}

export function fetchInvoice(id: number | string): Promise<InvoiceDetail> {
  return request<InvoiceDetail>({ url: `/invoices/${id}`, method: 'GET' });
}

export function issueInvoice(payload: CreateInvoicePayload): Promise<InvoiceDetail> {
  return request<InvoiceDetail>({ url: '/invoices', method: 'POST', data: payload });
}

export function voidInvoice(id: number | string): Promise<InvoiceDetail> {
  return request<InvoiceDetail>({ url: `/invoices/${id}/void`, method: 'POST' });
}
