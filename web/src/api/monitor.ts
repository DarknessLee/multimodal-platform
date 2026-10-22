import { request } from './http';
import type { MonitorLive, MonitorOverview, MonitorTrend } from '../types';

export function fetchMonitorOverview(): Promise<MonitorOverview> {
  return request<MonitorOverview>({ url: '/monitor/overview', method: 'GET' });
}

export function fetchMonitorLive(waybillId: number | string): Promise<MonitorLive> {
  return request<MonitorLive>({ url: `/monitor/waybills/${waybillId}/live`, method: 'GET' });
}

export function fetchMonitorTrend(days = 14): Promise<MonitorTrend> {
  return request<MonitorTrend>({ url: '/monitor/trend', method: 'GET', params: { days } });
}
