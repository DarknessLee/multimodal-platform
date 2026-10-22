import { request } from './http';
import type {
  AnalyticsByCustomer,
  AnalyticsByMode,
  AnalyticsOverview,
  AnalyticsTrend,
  FinanceDashboard,
} from '../types';

export function fetchAnalyticsOverview(days = 30): Promise<AnalyticsOverview> {
  return request<AnalyticsOverview>({ url: '/analytics/overview', method: 'GET', params: { days } });
}

export function fetchAnalyticsTrend(days = 14): Promise<AnalyticsTrend> {
  return request<AnalyticsTrend>({ url: '/analytics/trend', method: 'GET', params: { days } });
}

export function fetchAnalyticsByCustomer(): Promise<AnalyticsByCustomer[]> {
  return request<AnalyticsByCustomer[]>({ url: '/analytics/by-customer', method: 'GET' });
}

export function fetchAnalyticsByMode(): Promise<AnalyticsByMode[]> {
  return request<AnalyticsByMode[]>({ url: '/analytics/by-mode', method: 'GET' });
}

export function fetchFinanceDashboard(): Promise<FinanceDashboard> {
  return request<FinanceDashboard>({ url: '/finance/dashboard', method: 'GET' });
}
