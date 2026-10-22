import { request } from './http';
import type { AlertItem, ExceptionTicket, PageResult } from '../types';

export function fetchAlerts(params?: {
  status?: string;
  level?: string;
  alertType?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<AlertItem>> {
  return request<PageResult<AlertItem>>({ url: '/alerts', method: 'GET', params });
}

export function ackAlert(id: number | string): Promise<AlertItem> {
  return request<AlertItem>({ url: `/alerts/${id}/ack`, method: 'POST' });
}

export function closeAlert(id: number | string): Promise<AlertItem> {
  return request<AlertItem>({ url: `/alerts/${id}/close`, method: 'POST' });
}

export function fetchExceptions(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<ExceptionTicket>> {
  return request<PageResult<ExceptionTicket>>({ url: '/exceptions', method: 'GET', params });
}

export function handleException(
  id: number | string,
  payload: { resolution: string; status?: string },
): Promise<ExceptionTicket> {
  return request<ExceptionTicket>({
    url: `/exceptions/${id}/handle`,
    method: 'POST',
    data: { resolution: payload.resolution, status: payload.status ?? 'RESOLVED' },
  });
}
