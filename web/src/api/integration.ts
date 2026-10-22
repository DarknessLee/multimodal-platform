import { request } from './http';
import type {
  AdapterHealthResult,
  AdapterTestResult,
  IntegrationAdapter,
  IntegrationMessage,
  IntegrationMessageDetail,
  IntegrationStats,
  IntegrationSystem,
  PageResult,
  RetryBatchResult,
} from '../types';

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

// ── Stage 5：集成中心 v2 ──

export function fetchIntegrationAdapters(): Promise<IntegrationAdapter[]> {
  return request<IntegrationAdapter[]>({ url: '/integration/adapters', method: 'GET' });
}

export function fetchAdapterHealth(id: number | string): Promise<AdapterHealthResult> {
  return request<AdapterHealthResult>({ url: `/integration/adapters/${id}/health`, method: 'GET' });
}

export function testIntegrationAdapter(id: number | string): Promise<AdapterTestResult> {
  return request<AdapterTestResult>({ url: `/integration/adapters/${id}/test`, method: 'POST' });
}

export function fetchIntegrationMessageDetail(id: number | string): Promise<IntegrationMessageDetail> {
  return request<IntegrationMessageDetail>({ url: `/integration/messages/${id}`, method: 'GET' });
}

export function retryIntegrationMessagesBatch(ids: number[]): Promise<RetryBatchResult> {
  return request<RetryBatchResult>({
    url: '/integration/messages/retry-batch',
    method: 'POST',
    data: { ids },
  });
}

export function fetchIntegrationStats(days = 7): Promise<IntegrationStats> {
  return request<IntegrationStats>({ url: '/integration/stats', method: 'GET', params: { days } });
}
