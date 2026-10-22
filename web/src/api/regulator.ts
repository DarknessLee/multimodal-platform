import { request } from './http';
import type {
  ComplianceCheckItem,
  ComplianceRunResult,
  PageResult,
  RegulatorDashboard,
  RegulatorReport,
  RegulatorReportDetail,
} from '../types';

export function fetchRegulatorDashboard(): Promise<RegulatorDashboard> {
  return request<RegulatorDashboard>({ url: '/regulator/dashboard', method: 'GET' });
}

export function fetchRegulatorReports(params?: {
  status?: string;
  reportType?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<RegulatorReport>> {
  return request<PageResult<RegulatorReport>>({
    url: '/regulator/reports',
    method: 'GET',
    params,
  });
}

export function fetchRegulatorReport(id: number | string): Promise<RegulatorReportDetail> {
  return request<RegulatorReportDetail>({ url: `/regulator/reports/${id}`, method: 'GET' });
}

export function createRegulatorReport(payload: {
  reportType: string;
  period: string;
  regulatorName: string;
}): Promise<RegulatorReportDetail> {
  return request<RegulatorReportDetail>({
    url: '/regulator/reports',
    method: 'POST',
    data: payload,
  });
}

export function submitRegulatorReport(id: number | string): Promise<RegulatorReport> {
  return request<RegulatorReport>({
    url: `/regulator/reports/${id}/submit`,
    method: 'POST',
  });
}

export function acceptRegulatorReport(
  id: number | string,
  payload: { accepted: boolean; comment?: string },
): Promise<RegulatorReport> {
  return request<RegulatorReport>({
    url: `/regulator/reports/${id}/accept`,
    method: 'POST',
    data: payload,
  });
}

export function fetchComplianceChecks(params?: {
  result?: string;
  checkType?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<ComplianceCheckItem>> {
  return request<PageResult<ComplianceCheckItem>>({
    url: '/regulator/compliance-checks',
    method: 'GET',
    params,
  });
}

export function runComplianceChecks(): Promise<ComplianceRunResult> {
  return request<ComplianceRunResult>({
    url: '/regulator/compliance-checks/run',
    method: 'POST',
  });
}
