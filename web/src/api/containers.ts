import { request } from './http';
import type {
  ContainerDetail,
  ContainerListItem,
  ContainerMovement,
  ContainerMovementPayload,
  ContainerReleasePayload,
  DepotStorageItem,
  PageResult,
} from '../types';

export function fetchContainers(params?: {
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<ContainerListItem>> {
  return request<PageResult<ContainerListItem>>({ url: '/containers', method: 'GET', params });
}

export function fetchContainer(id: number | string): Promise<ContainerDetail> {
  return request<ContainerDetail>({ url: `/containers/${id}`, method: 'GET' });
}

export function releaseContainer(
  id: number | string,
  payload: ContainerReleasePayload,
): Promise<ContainerDetail> {
  return request<ContainerDetail>({ url: `/containers/${id}/release`, method: 'POST', data: payload });
}

export function addContainerMovement(
  id: number | string,
  payload: ContainerMovementPayload,
): Promise<{ movement: ContainerMovement; container?: ContainerDetail['container'] }> {
  return request<{ movement: ContainerMovement; container?: ContainerDetail['container'] }>({
    url: `/containers/${id}/movements`,
    method: 'POST',
    data: payload,
  });
}

export function returnContainer(
  id: number | string,
  payload: { nodeId?: number | null; conditionText?: string },
): Promise<ContainerDetail> {
  return request<ContainerDetail>({ url: `/containers/${id}/return`, method: 'POST', data: payload });
}

export function repairContainer(
  id: number | string,
  payload: { nodeId?: number | null; fee: number; remark?: string },
): Promise<ContainerDetail> {
  return request<ContainerDetail>({ url: `/containers/${id}/repair`, method: 'POST', data: payload });
}

export function fetchDepotStorage(params?: {
  nodeId?: number | string;
  status?: string;
}): Promise<DepotStorageItem[]> {
  return request<DepotStorageItem[]>({ url: '/depots/storage', method: 'GET', params });
}
