import { http, request } from './http';
import type {
  CreateDocumentPayload,
  DocumentDetail,
  DocumentListItem,
  OcrResultData,
  PageResult,
} from '../types';

export function fetchDocuments(params?: {
  docType?: string;
  bizType?: string;
  bizId?: number | string;
  ocrStatus?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<DocumentListItem>> {
  return request<PageResult<DocumentListItem>>({ url: '/documents', method: 'GET', params });
}

export function uploadDocument(payload: CreateDocumentPayload): Promise<DocumentDetail> {
  return request<DocumentDetail>({ url: '/documents', method: 'POST', data: payload });
}

export function fetchDocument(id: number | string): Promise<DocumentDetail> {
  return request<DocumentDetail>({ url: `/documents/${id}`, method: 'GET' });
}

export function runDocumentOcr(id: number | string): Promise<{ ocrStatus: string; ocrResult: OcrResultData | null }> {
  return request<{ ocrStatus: string; ocrResult: OcrResultData | null }>({
    url: `/documents/${id}/ocr`,
    method: 'POST',
  });
}

export function signDocument(
  id: number | string,
  signerName: string,
  sealId?: number | null,
): Promise<DocumentDetail> {
  return request<DocumentDetail>({
    url: `/documents/${id}/sign`,
    method: 'POST',
    data: { signerName, ...(sealId ? { sealId } : {}) },
  });
}

/** 下载单证文件流（带 Bearer，返回 Blob 供前端保存） */
export async function downloadDocument(
  id: number | string,
): Promise<{ blob: Blob; fileName: string | null }> {
  const response = await http.get<Blob>(`/documents/${id}/download`, { responseType: 'blob' });
  const disposition = String(response.headers?.['content-disposition'] ?? '');
  let fileName: string | null = null;
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8Match) {
    fileName = decodeURIComponent(utf8Match[1]);
  } else {
    const plainMatch = /filename="?([^";]+)"?/i.exec(disposition);
    if (plainMatch) fileName = plainMatch[1];
  }
  return { blob: response.data, fileName };
}
