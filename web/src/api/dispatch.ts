import { request } from './http';
import type {
  DispatchBoard,
  DispatchPlan,
  DispatchPlanListItem,
  PageResult,
  PlanConfirmResult,
  PlanGenerateResult,
} from '../types';

export function generatePlans(orderId: number | string): Promise<PlanGenerateResult> {
  return request<PlanGenerateResult>({
    url: '/dispatch/plans/generate',
    method: 'POST',
    data: { orderId: Number(orderId) },
  });
}

export function fetchPlans(params?: {
  orderId?: number | string;
  strategy?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<DispatchPlanListItem>> {
  return request<PageResult<DispatchPlanListItem>>({ url: '/dispatch/plans', method: 'GET', params });
}

export function fetchPlan(id: number | string): Promise<DispatchPlan> {
  return request<DispatchPlan>({ url: `/dispatch/plans/${id}`, method: 'GET' });
}

export function confirmPlan(id: number | string): Promise<PlanConfirmResult> {
  return request<PlanConfirmResult>({ url: `/dispatch/plans/${id}/confirm`, method: 'POST' });
}

export function fetchDispatchBoard(): Promise<DispatchBoard> {
  return request<DispatchBoard>({ url: '/dispatch/board', method: 'GET' });
}
