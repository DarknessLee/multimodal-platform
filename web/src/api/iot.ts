import { request } from './http';
import type { GeoFence, IotDevice, IotIngestResult, IotReading, PageResult } from '../types';

export function fetchIotDevices(params?: {
  containerId?: number | string;
  deviceType?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<IotDevice>> {
  return request<PageResult<IotDevice>>({ url: '/iot/devices', method: 'GET', params });
}

export function fetchIotReadings(params?: {
  deviceId?: number | string;
  containerId?: number | string;
  limit?: number;
}): Promise<IotReading[]> {
  return request<IotReading[]>({ url: '/iot/readings', method: 'GET', params });
}

export function reportIotReading(payload: {
  deviceNo: string;
  temperature?: number;
  humidity?: number;
  doorOpen?: boolean;
  impactG?: number;
  lng?: number;
  lat?: number;
}): Promise<IotIngestResult> {
  return request<IotIngestResult>({ url: '/iot/readings', method: 'POST', data: payload });
}

export function fetchGeoFences(params?: { fenceType?: string }): Promise<GeoFence[]> {
  return request<GeoFence[]>({ url: '/geo-fences', method: 'GET', params });
}
