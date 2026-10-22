import { request } from './http';
import type { AuditLog, PageResult } from '../types';

export function fetchAuditLogs(params?: {
  module?: string;
  action?: string;
  userId?: number | string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<AuditLog>> {
  return request<PageResult<AuditLog>>({ url: '/audit/logs', method: 'GET', params });
}
