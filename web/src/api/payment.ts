import { request } from './http';
import type {
  CreatePaymentPayload,
  PageResult,
  PaymentConfirmResult,
  PaymentListItem,
} from '../types';

export function fetchPayments(params?: {
  direction?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<PaymentListItem>> {
  return request<PageResult<PaymentListItem>>({ url: '/payments', method: 'GET', params });
}

export function createPayment(payload: CreatePaymentPayload): Promise<PaymentListItem> {
  return request<PaymentListItem>({ url: '/payments', method: 'POST', data: payload });
}

export function confirmPayment(id: number | string): Promise<PaymentConfirmResult> {
  return request<PaymentConfirmResult>({ url: `/payments/${id}/confirm`, method: 'POST' });
}
