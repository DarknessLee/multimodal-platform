import { request } from './http';
import type {
  ContainerTypeItem,
  CreateCustomerPayload,
  CreatePartnerPayload,
  CreatePriceRulePayload,
  Customer,
  DictItem,
  GoodsItem,
  PageResult,
  Partner,
  PortStation,
  PriceRule,
  RouteTemplate,
} from '../types';

// ── 客户 ──
export function fetchCustomers(params?: {
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<Customer>> {
  return request<PageResult<Customer>>({ url: '/customers', method: 'GET', params });
}

export function fetchCustomer(id: number | string): Promise<Customer> {
  return request<Customer>({ url: `/customers/${id}`, method: 'GET' });
}

export function createCustomer(payload: CreateCustomerPayload): Promise<Customer> {
  return request<Customer>({ url: '/customers', method: 'POST', data: payload });
}

// ── 伙伴 ──
export function fetchPartners(params?: {
  type?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<Partner>> {
  return request<PageResult<Partner>>({ url: '/partners', method: 'GET', params });
}

export function createPartner(payload: CreatePartnerPayload): Promise<Partner> {
  return request<Partner>({ url: '/partners', method: 'POST', data: payload });
}

// ── 港站 / 线路 / 货物 / 箱型 ──
export function fetchPorts(params?: { type?: string }): Promise<PortStation[]> {
  return request<PortStation[]>({ url: '/ports', method: 'GET', params });
}

export function fetchRoutes(): Promise<RouteTemplate[]> {
  return request<RouteTemplate[]>({ url: '/routes', method: 'GET' });
}

export function fetchGoods(): Promise<GoodsItem[]> {
  return request<GoodsItem[]>({ url: '/goods', method: 'GET' });
}

export function fetchContainerTypes(): Promise<ContainerTypeItem[]> {
  return request<ContainerTypeItem[]>({ url: '/container-types', method: 'GET' });
}

// ── 字典 ──
export function fetchDicts(type: string): Promise<DictItem[]> {
  return request<DictItem[]>({ url: `/dicts/${type}`, method: 'GET' });
}

// ── 价格规则 ──
export function fetchPriceRules(params?: {
  mode?: string;
  routeTemplateId?: number | string;
  customerId?: number | string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<PriceRule>> {
  return request<PageResult<PriceRule>>({ url: '/price-rules', method: 'GET', params });
}

export function createPriceRule(payload: CreatePriceRulePayload): Promise<PriceRule> {
  return request<PriceRule>({ url: '/price-rules', method: 'POST', data: payload });
}
