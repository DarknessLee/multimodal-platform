import { request } from './http';
import type {
  FullChainCheckResult,
  OpsConfigItem,
  OpsDashboard,
  OpsDictItem,
  OpsHealth,
  OpsJobItem,
} from '../types';

export function fetchOpsHealth(): Promise<OpsHealth> {
  return request<OpsHealth>({ url: '/ops/health', method: 'GET' });
}

export function fetchOpsDashboard(): Promise<OpsDashboard> {
  return request<OpsDashboard>({ url: '/ops/dashboard', method: 'GET' });
}

export function fetchOpsConfigs(params?: { category?: string }): Promise<OpsConfigItem[]> {
  return request<OpsConfigItem[]>({ url: '/ops/configs', method: 'GET', params });
}

export function updateOpsConfig(
  key: string,
  configValue: string,
): Promise<OpsConfigItem> {
  return request<OpsConfigItem>({
    url: `/ops/configs/${encodeURIComponent(key)}`,
    method: 'PUT',
    data: { configValue },
  });
}

export function fetchOpsDicts(params?: { dictType?: string }): Promise<OpsDictItem[]> {
  return request<OpsDictItem[]>({ url: '/ops/dicts', method: 'GET', params });
}

export function createOpsDict(payload: {
  dictType: string;
  dictKey: string;
  dictValue: string;
  sort?: number;
  remark?: string;
}): Promise<OpsDictItem> {
  return request<OpsDictItem>({ url: '/ops/dicts', method: 'POST', data: payload });
}

export function updateOpsDict(
  id: number | string,
  payload: Partial<{
    dictValue: string;
    sort: number;
    status: string;
    remark: string;
  }>,
): Promise<OpsDictItem> {
  return request<OpsDictItem>({ url: `/ops/dicts/${id}`, method: 'PUT', data: payload });
}

export function fetchOpsJobs(): Promise<OpsJobItem[]> {
  return request<OpsJobItem[]>({ url: '/ops/jobs', method: 'GET' });
}

export function runOpsJob(code: string): Promise<OpsJobItem> {
  return request<OpsJobItem>({
    url: `/ops/jobs/${encodeURIComponent(code)}/run`,
    method: 'POST',
  });
}

export function fetchFullChainCheck(): Promise<FullChainCheckResult> {
  return request<FullChainCheckResult>({ url: '/ops/full-chain-check', method: 'GET' });
}
