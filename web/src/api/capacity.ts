import { request } from './http';
import type {
  CapacitySummary,
  PageResult,
  TrainScheduleItem,
  Vehicle,
  VesselScheduleItem,
} from '../types';

export function fetchCapacitySummary(): Promise<CapacitySummary> {
  return request<CapacitySummary>({ url: '/capacity/summary', method: 'GET' });
}

export function fetchVehicles(params?: {
  status?: string;
  carrierId?: number | string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<Vehicle>> {
  return request<PageResult<Vehicle>>({ url: '/capacity/vehicles', method: 'GET', params });
}

export function fetchTrains(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<TrainScheduleItem>> {
  return request<PageResult<TrainScheduleItem>>({ url: '/capacity/trains', method: 'GET', params });
}

export function fetchVessels(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<VesselScheduleItem>> {
  return request<PageResult<VesselScheduleItem>>({ url: '/capacity/vessels', method: 'GET', params });
}
