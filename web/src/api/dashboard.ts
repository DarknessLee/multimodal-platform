import { request } from './http';
import type { DashboardSummary, DashboardTrend } from '../types';

export function fetchDashboardSummary(): Promise<DashboardSummary> {
  return request<DashboardSummary>({ url: '/dashboard/summary', method: 'GET' });
}

export function fetchDashboardTrend(days = 14): Promise<DashboardTrend> {
  return request<DashboardTrend>({ url: '/dashboard/trend', method: 'GET', params: { days } });
}
