// 集成报文（Mock 适配器）：95306 / 港口 EDI / CA / 银行 / 税务 报文落库
import type { PoolConnection } from 'mysql2/promise';
import { txExec } from '../db/pool';
import type { IntegrationDirection, IntegrationStatus } from '../types';
import { formatDateTime, nowDate, todayCompact } from '../utils/datetime';
import { nextDocNo } from './sequence';

export interface IntegrationMessageInput {
  systemCode: string;
  systemName: string;
  direction: IntegrationDirection;
  msgType: string;
  standard: string;
  relatedType?: string | null;
  relatedId?: number | string | null;
  payload: Record<string, unknown>;
  status?: IntegrationStatus;
  errorMessage?: string | null;
  responsePayload?: unknown;
  processedAt?: string | null;
  createdAt?: string;
}

export interface IntegrationMessageRef {
  id: number;
  msgNo: string;
  status: IntegrationStatus;
}

/** 写入一条集成报文（事务内调用；Mock 适配器同步返回） */
export async function insertIntegrationMessage(
  conn: PoolConnection,
  input: IntegrationMessageInput,
): Promise<IntegrationMessageRef> {
  const msgNo = await nextDocNo(conn, {
    table: 'integration_message',
    column: 'msg_no',
    prefix: `MSG${todayCompact()}`,
    width: 5,
  });
  const status = input.status ?? 'SUCCESS';
  const createdAt = input.createdAt ?? formatDateTime(nowDate());
  const processedAt =
    input.processedAt === undefined ? (status === 'PENDING' ? null : createdAt) : input.processedAt;
  const result = await txExec(
    conn,
    `INSERT INTO integration_message (msg_no, system_code, system_name, direction, msg_type, standard,
       related_type, related_id, payload, status, retry_count, response_payload, error_message, created_at, processed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    [
      msgNo,
      input.systemCode,
      input.systemName,
      input.direction,
      input.msgType,
      input.standard,
      input.relatedType ?? null,
      input.relatedId === null || input.relatedId === undefined ? null : String(input.relatedId),
      JSON.stringify(input.payload ?? {}),
      status,
      input.responsePayload === undefined || input.responsePayload === null
        ? null
        : JSON.stringify(input.responsePayload),
      input.errorMessage ?? null,
      createdAt,
      processedAt,
    ],
  );
  return { id: Number(result.insertId), msgNo, status };
}

/** 港口 EDI：CODECO（进场/出场） */
export function portCodecoMessage(params: {
  waybillId: number;
  waybillNo: string;
  portCode: string;
  moveType: string;
  containerNos: string[];
  eventTime: string;
  direction?: IntegrationDirection;
  status?: IntegrationStatus;
}): IntegrationMessageInput {
  return {
    systemCode: 'PORT_EDI',
    systemName: '港口 EDI',
    direction: params.direction ?? 'OUT',
    msgType: 'PORT_CODECO',
    standard: 'UN/EDIFACT',
    relatedType: 'WAYBILL',
    relatedId: params.waybillId,
    status: params.status,
    payload: {
      messageNo: `CODECO-${params.waybillId}-${Date.now()}`,
      portCode: params.portCode,
      moveType: params.moveType,
      containerNos: params.containerNos,
      eventTime: params.eventTime,
      waybillNo: params.waybillNo,
    },
  };
}

/** 港口 EDI：COARRI（装船/卸船/到港） */
export function portCoarriMessage(params: {
  waybillId: number;
  waybillNo: string;
  portCode: string;
  moveType: string;
  containerNos: string[];
  eventTime: string;
  vessel?: string;
  voyage?: string;
  direction?: IntegrationDirection;
  status?: IntegrationStatus;
}): IntegrationMessageInput {
  return {
    systemCode: 'PORT_EDI',
    systemName: '港口 EDI',
    direction: params.direction ?? 'OUT',
    msgType: 'PORT_COARRI',
    standard: 'UN/EDIFACT',
    relatedType: 'WAYBILL',
    relatedId: params.waybillId,
    status: params.status,
    payload: {
      messageNo: `COARRI-${params.waybillId}-${Date.now()}`,
      portCode: params.portCode,
      moveType: params.moveType,
      containerNos: params.containerNos,
      vessel: params.vessel ?? 'COSCO SHIPPING',
      voyage: params.voyage ?? '2026E',
      eventTime: params.eventTime,
      waybillNo: params.waybillNo,
    },
  };
}

/** CA 电子签章报文 */
export function caSignMessage(params: {
  docId: number;
  docNo: string;
  docType: string;
  signerName: string;
  signHash: string;
  sealNo?: string | null;
  signedAt: string;
}): IntegrationMessageInput {
  return {
    systemCode: 'CA',
    systemName: 'CA 电子认证',
    direction: 'OUT',
    msgType: 'CA_SIGN',
    standard: 'JSON 签章记录',
    relatedType: 'DOCUMENT',
    relatedId: params.docId,
    payload: {
      docNo: params.docNo,
      docType: params.docType,
      signerName: params.signerName,
      signHash: params.signHash,
      caSerial: `CA-2026-${String(params.docId).padStart(4, '0')}`,
      sealNo: params.sealNo ?? null,
      algorithm: 'SHA-256',
      platform: 'MULTIMODAL_PLATFORM',
      signedAt: params.signedAt,
    },
  };
}
