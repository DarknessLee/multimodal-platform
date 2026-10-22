import { request } from './http';
import type { RailApplyResult, RailConfirmResult, RailTask } from '../types';

export function fetchRailTasks(): Promise<RailTask[]> {
  return request<RailTask[]>({ url: '/rail/tasks', method: 'GET' });
}

export function applyRailDemand(waybillId: number | string): Promise<RailApplyResult> {
  return request<RailApplyResult>({
    url: `/rail/tasks/${waybillId}/apply`,
    method: 'POST',
  });
}

export function confirmRailDemand(messageId: number | string): Promise<RailConfirmResult> {
  return request<RailConfirmResult>({
    url: `/rail/demands/${messageId}/confirm`,
    method: 'POST',
  });
}
