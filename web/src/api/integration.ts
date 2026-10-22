import { request } from './http';
import type { IntegrationMessage, IntegrationSystem, PageResult } from '../types';

export function fetchIntegrationSystems(): Promise<IntegrationSystem[]> {
  return request<IntegrationSystem[]>({ url: '/integration/systems', method: 'GET' });
}

export function fetchIntegrationMessages(params?: {
  systemCode?: string;
  status?: string;
  relatedType?: string;
  relatedId?: number | string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<IntegrationMessage>> {
  return request<PageResult<IntegrationMessage>>({
    url: '/integration/messages',
    method: 'GET',
    params,
  });
}

export function retryIntegrationMessage(id: number | string): Promise<IntegrationMessage> {
  return request<IntegrationMessage>({
    url: `/integration/messages/${id}/retry`,
    method: 'POST',
  });
}
