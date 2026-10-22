import { request } from './http';
import type { InsurancePolicy, PageResult } from '../types';

export function fetchInsurancePolicies(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<InsurancePolicy>> {
  return request<PageResult<InsurancePolicy>>({
    url: '/insurance/policies',
    method: 'GET',
    params,
  });
}

export function fetchInsurancePolicy(id: number | string): Promise<InsurancePolicy> {
  return request<InsurancePolicy>({ url: `/insurance/policies/${id}`, method: 'GET' });
}

export function createInsurancePolicy(payload: {
  orderId: number;
  insuredAmount: number;
  rate: number;
}): Promise<InsurancePolicy> {
  return request<InsurancePolicy>({ url: '/insurance/policies', method: 'POST', data: payload });
}
