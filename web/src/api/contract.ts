import { request } from './http';
import type {
  ContractDetail,
  ContractListItem,
  CreateContractPayload,
  PageResult,
} from '../types';

export function fetchContracts(params?: {
  status?: string;
  customerId?: number | string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<ContractListItem>> {
  return request<PageResult<ContractListItem>>({ url: '/contracts', method: 'GET', params });
}

export function fetchContract(id: number | string): Promise<ContractDetail> {
  return request<ContractDetail>({ url: `/contracts/${id}`, method: 'GET' });
}

export function createContract(payload: CreateContractPayload): Promise<ContractDetail> {
  return request<ContractDetail>({ url: '/contracts', method: 'POST', data: payload });
}

export function sendContract(id: number | string): Promise<ContractDetail> {
  return request<ContractDetail>({ url: `/contracts/${id}/send`, method: 'POST' });
}

export function signContract(id: number | string, signerName: string): Promise<ContractDetail> {
  return request<ContractDetail>({
    url: `/contracts/${id}/sign`,
    method: 'POST',
    data: { signerName },
  });
}
