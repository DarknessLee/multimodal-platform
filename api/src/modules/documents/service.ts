// 单证中心：上传（base64）/列表/详情/下载/OCR/签章；落盘 api/storage/documents
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { PoolConnection } from 'mysql2/promise';
import {
  DOC_SIGN_STATUS_LABELS,
  DOC_TYPE_LABELS,
  OCR_STATUS_LABELS,
} from '../../config/labels';
import { queryOne, queryRows, txExec, txQueryOne, txQueryRows, withTransaction } from '../../db/pool';
import { ApiError } from '../../errors';
import { writeAudit } from '../../middleware/audit';
import { insertIntegrationMessage, caSignMessage } from '../../platform/edi';
import { appendNotarize, sha256, notarizeDto } from '../../platform/notary';
import { documentRelativePath, documentsDir, resolveStoragePath, sanitizeFileName } from '../../platform/paths';
import { nextDocNo } from '../../platform/sequence';
import type {
  AuthUser,
  DocBizType,
  DocSignStatus,
  DocType,
  DocumentRow,
  ESealRow,
  OcrStatus,
} from '../../types';
import { formatDate, formatDateTime, nowDate, todayCompact, todayDateString } from '../../utils/datetime';
import { parseJson, round2 } from '../../utils/json';
import { appendWaybillEvent } from '../waybill/events';
import { optionalString, pageResult, parsePage } from '../shared/pagination';

/** Mock CA 平台盐（与合同/种子签章规则一致） */
export const PLATFORM_SALT = 'MULTIMODAL_PLATFORM';

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'text/plain'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export function sealDto(row: ESealRow | null) {
  if (!row) return null;
  return {
    id: Number(row.id),
    sealNo: row.seal_no,
    sealName: row.seal_name,
    ownerType: row.owner_type,
    caSerial: row.ca_serial,
    status: row.status,
    issuedAt: row.issued_at,
  };
}

export function documentDto(row: DocumentRow, seal: ESealRow | null = null) {
  return {
    id: Number(row.id),
    docNo: row.doc_no,
    docType: row.doc_type,
    docTypeLabel: DOC_TYPE_LABELS[row.doc_type as DocType],
    bizType: row.biz_type,
    bizId: Number(row.biz_id),
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    contentHash: row.content_hash,
    ocrStatus: row.ocr_status,
    ocrStatusLabel: OCR_STATUS_LABELS[row.ocr_status as OcrStatus],
    ocrResult: parseJson<unknown>(row.ocr_result, null),
    signStatus: row.sign_status,
    signStatusLabel: DOC_SIGN_STATUS_LABELS[row.sign_status as DocSignStatus],
    signedAt: row.signed_at,
    signHash: row.sign_hash,
    sealId: row.seal_id === null ? null : Number(row.seal_id),
    seal: sealDto(seal),
    signerName: row.signer_name,
    notarizeTxId: row.notarize_tx_id,
    hasFile: Boolean(row.file_path),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadSeal(conn: PoolConnection | null, sealId: number | null): Promise<ESealRow | null> {
  if (!sealId) return null;
  const sql = 'SELECT * FROM e_seal WHERE id = ?';
  const row = conn ? await txQueryOne<ESealRow>(conn, sql, [sealId]) : await queryOne<ESealRow>(sql, [sealId]);
  return row ?? null;
}

export async function getDocumentDetail(id: number) {
  const row = await queryOne<DocumentRow>('SELECT * FROM document WHERE id = ?', [id]);
  if (!row) {
    throw new ApiError(40401, '单证不存在');
  }
  const seal = row.seal_id ? await queryOne<ESealRow>('SELECT * FROM e_seal WHERE id = ?', [row.seal_id]) : null;
  return documentDto(row, seal);
}

/** 文件落盘；返回文件名/相对路径/大小/内容哈希 */
export async function writeDocumentFile(fileName: string, content: string | Buffer) {
  await mkdir(documentsDir, { recursive: true });
  const safeName = sanitizeFileName(fileName);
  const uniqueName = `${Date.now()}-${safeName}`;
  const physical = resolve(documentsDir, uniqueName);
  const buffer = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  await writeFile(physical, buffer);
  return {
    fileName: safeName,
    storedFileName: uniqueName,
    filePath: documentRelativePath(uniqueName),
    fileSize: buffer.length,
    contentHash: sha256(buffer.toString('base64')),
  };
}

/** 读取单证文件内容（下载用） */
export async function readDocumentFile(row: DocumentRow): Promise<Buffer> {
  if (!row.file_path) {
    throw new ApiError(40401, '单证尚未上传文件');
  }
  try {
    return await readFile(resolveStoragePath(row.file_path));
  } catch {
    throw new ApiError(40401, '单证文件不存在或已丢失');
  }
}

/** 下载单证：返回文件流与元信息 */
export async function downloadDocumentFile(id: number) {
  const row = await queryOne<DocumentRow>('SELECT * FROM document WHERE id = ?', [id]);
  if (!row) {
    throw new ApiError(40401, '单证不存在');
  }
  const buffer = await readDocumentFile(row);
  return { buffer, fileName: row.file_name, mimeType: row.mime_type || 'application/octet-stream' };
}

/** Mock OCR：优先从运单/箱档案推导，保证识别结果含箱号/签收人/日期/数量 */
export async function runMockOcr(
  conn: PoolConnection,
  doc: DocumentRow,
  waybillId?: number | null,
): Promise<{ ocrStatus: OcrStatus; ocrResult: Record<string, unknown> }> {
  let containerNo = '';
  let signer = '';
  let orderId: number | null = null;
  let containerCount = 1;
  let masterId = waybillId ?? (doc.biz_type === 'WAYBILL' ? Number(doc.biz_id) : null);

  if (doc.biz_type === 'WAYBILL' && masterId) {
    const waybill = await txQueryOne<{
      id: number;
      order_id: number;
      waybill_type: string;
      parent_waybill_id: number | null;
      signer_name: string | null;
    }>(conn, 'SELECT id, order_id, waybill_type, parent_waybill_id, signer_name FROM waybill WHERE id = ?', [
      masterId,
    ]);
    if (waybill) {
      const master =
        waybill.waybill_type === 'SEGMENT' && waybill.parent_waybill_id
          ? await txQueryOne<{ id: number; order_id: number; signer_name: string | null }>(
              conn,
              'SELECT id, order_id, signer_name FROM waybill WHERE id = ?',
              [waybill.parent_waybill_id],
            )
          : waybill;
      const effective = master ?? waybill;
      masterId = Number(effective.id);
      orderId = Number(effective.order_id);
      const container = await txQueryOne<{ container_no: string }>(
        conn,
        `SELECT c.container_no FROM waybill_container wc JOIN container c ON c.id = wc.container_id
          WHERE wc.waybill_id = ? ORDER BY c.id ASC LIMIT 1`,
        [masterId],
      );
      containerNo = container?.container_no ?? '';
      const order = await txQueryOne<{ container_count: number; customer_id: number | null }>(
        conn,
        'SELECT container_count, customer_id FROM orders WHERE id = ?',
        [orderId],
      );
      containerCount = Number(order?.container_count ?? 1);
      signer = effective.signer_name ?? '';
      if (!signer && order?.customer_id) {
        const customer = await txQueryOne<{ contact_name: string }>(
          conn,
          'SELECT contact_name FROM customer WHERE id = ?',
          [order.customer_id],
        );
        signer = customer?.contact_name ?? '';
      }
      if (!containerNo) {
        const first = await txQueryOne<{ container_no: string }>(
          conn,
          'SELECT container_no FROM container WHERE order_id = ? ORDER BY id ASC LIMIT 1',
          [orderId],
        );
        containerNo = first?.container_no ?? '';
      }
    }
  }

  if (!containerNo) {
    containerNo = `MSCU${String(7000000 + Number(doc.id)).padStart(7, '0')}`;
  }
  if (!signer) signer = '李经理';
  const date = String(doc.created_at ?? todayDateString()).slice(0, 10);
  return {
    ocrStatus: 'SUCCESS',
    ocrResult: {
      containerNo,
      signer,
      signerName: signer,
      date,
      quantity: containerCount,
      confidence: 0.97,
      source: 'MOCK_OCR',
      docNo: doc.doc_no,
      waybillId: masterId,
    },
  };
}

export interface CreateDocumentParams {
  docType: DocType;
  bizType: DocBizType;
  bizId: number;
  fileName: string;
  mimeType?: string;
  content: string | Buffer;
  createdBy?: number | null;
  signSealId?: number | null;
  signerName?: string | null;
  runOcr?: boolean;
  waybillId?: number | null;
  createdAt?: string;
}

/** 生成单证（落盘 + 哈希 + 存证 + 可选 Mock 签章/OCR），供 dispatch 自动签发/上传复用 */
export async function createDocumentRecord(
  conn: PoolConnection,
  params: CreateDocumentParams,
): Promise<DocumentRow> {
  const file = await writeDocumentFile(params.fileName, params.content);
  const docNo = await nextDocNo(conn, {
    table: 'document',
    column: 'doc_no',
    prefix: `DOC${todayCompact()}`,
    width: 5,
  });
  const at = params.createdAt ?? formatDateTime(nowDate());
  const mimeType = params.mimeType ?? 'text/plain';
  const inserted = await txExec(
    conn,
    `INSERT INTO document (doc_no, doc_type, biz_type, biz_id, file_name, mime_type, file_path, file_size,
       content_hash, ocr_status, sign_status, notarize_tx_id, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'NONE', 'UNSIGNED', NULL, ?, ?, ?)`,
    [
      docNo,
      params.docType,
      params.bizType,
      params.bizId,
      file.fileName,
      mimeType,
      file.filePath,
      file.fileSize,
      file.contentHash,
      params.createdBy ?? null,
      at,
      at,
    ],
  );
  const docId = Number(inserted.insertId);

  // 以 docId 写入 DOCUMENT 存证
  const notarized = await appendNotarize(conn, {
    bizType: 'DOCUMENT',
    bizId: docId,
    eventType: `${params.docType}_ISSUE`,
    payload: { docId, docNo, docType: params.docType, fileName: file.fileName, contentHash: file.contentHash },
  });
  await txExec(conn, 'UPDATE document SET notarize_tx_id = ? WHERE id = ?', [notarized.txId, docId]);

  if (params.signSealId) {
    const seal = await txQueryOne<ESealRow>(conn, 'SELECT * FROM e_seal WHERE id = ?', [params.signSealId]);
    const signedAt = formatDateTime(nowDate());
    const signerName = params.signerName ?? '中远海联运 MTO';
    const signHash = sha256(
      `${docNo}|${file.contentHash}|${signerName}|${signedAt}|${PLATFORM_SALT}`,
    );
    await txExec(
      conn,
      `UPDATE document SET sign_status = 'SIGNED', signed_at = ?, sign_hash = ?, seal_id = ?, signer_name = ?, updated_at = ?
        WHERE id = ?`,
      [signedAt, signHash, seal ? Number(seal.id) : null, signerName, signedAt, docId],
    );
    const signNotarized = await appendNotarize(conn, {
      bizType: 'DOCUMENT',
      bizId: docId,
      eventType: `${params.docType}_SIGN`,
      payload: { id: docId, docNo, contentHash: file.contentHash, signerName },
    });
    await txExec(conn, 'UPDATE document SET notarize_tx_id = ? WHERE id = ?', [signNotarized.txId, docId]);
  }

  if (params.runOcr) {
    const row = await txQueryOne<DocumentRow>(conn, 'SELECT * FROM document WHERE id = ?', [docId]);
    if (row) {
      const ocr = await runMockOcr(conn, row, params.waybillId ?? null);
      await txExec(
        conn,
        "UPDATE document SET ocr_status = ?, ocr_result = ? WHERE id = ?",
        [ocr.ocrStatus, JSON.stringify(ocr.ocrResult), docId],
      );
    }
  }

  const row = await txQueryOne<DocumentRow>(conn, 'SELECT * FROM document WHERE id = ?', [docId]);
  if (!row) {
    throw new ApiError(50000, '单证创建后读取失败');
  }
  return row;
}

function resolveSealOwnerType(user: AuthUser): 'PLATFORM' | 'CUSTOMER' | 'CARRIER' | 'TERMINAL' {
  switch (user.role) {
    case 'SHIPPER':
    case 'FORWARDER':
      return 'CUSTOMER';
    case 'CARRIER':
    case 'RAIL_CARRIER':
    case 'SEA_CARRIER':
      return 'CARRIER';
    case 'TERMINAL':
      return 'TERMINAL';
    default:
      return 'PLATFORM';
  }
}

async function pickSeal(conn: PoolConnection, user: AuthUser, sealId?: number | null): Promise<ESealRow | null> {
  if (sealId) {
    const seal = await txQueryOne<ESealRow>(conn, 'SELECT * FROM e_seal WHERE id = ? AND status = ?', [
      sealId,
      'ACTIVE',
    ]);
    if (!seal) {
      throw new ApiError(40401, '电子印章不存在或已吊销');
    }
    return seal;
  }
  const ownerType = resolveSealOwnerType(user);
  const ownerScoped = await txQueryOne<ESealRow>(
    conn,
    "SELECT * FROM e_seal WHERE status = 'ACTIVE' AND owner_type = ? ORDER BY id ASC LIMIT 1",
    [ownerType],
  );
  if (ownerScoped) return ownerScoped;
  return txQueryOne<ESealRow>(conn, "SELECT * FROM e_seal WHERE status = 'ACTIVE' ORDER BY id ASC LIMIT 1");
}

export interface UploadDocumentInput {
  docType: DocType;
  bizType: DocBizType;
  bizId: number;
  fileName: string;
  mimeType?: string;
  contentBase64: string;
  waybillId?: number | null;
}

/** POST /api/documents：base64 上传（POD 自动 OCR） */
export async function uploadDocument(input: UploadDocumentInput, user: AuthUser, ip: string | null) {
  const mimeType = (input.mimeType ?? 'application/octet-stream').toLowerCase();
  if (!ALLOWED_MIME.includes(mimeType)) {
    throw new ApiError(40001, '仅支持 pdf/jpg/png/txt 文件');
  }
  const base64 = input.contentBase64.includes(',')
    ? input.contentBase64.slice(input.contentBase64.indexOf(',') + 1)
    : input.contentBase64;
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0) {
    throw new ApiError(40001, '文件内容为空');
  }
  if (buffer.length > MAX_FILE_SIZE) {
    throw new ApiError(40001, '单文件不能超过 5MB');
  }
  if (input.bizType === 'WAYBILL') {
    const waybill = await queryOne<{ id: number }>('SELECT id FROM waybill WHERE id = ?', [input.bizId]);
    if (!waybill) {
      throw new ApiError(40401, '关联运单不存在');
    }
  }

  return withTransaction(async (conn) => {
    const file = await writeDocumentFile(input.fileName, buffer);
    const at = formatDateTime(nowDate());
    let docId: number;
    const placeholder = await txQueryOne<DocumentRow>(
      conn,
      `SELECT * FROM document WHERE doc_type = ? AND biz_type = ? AND biz_id = ?
         AND file_path IS NULL ORDER BY id ASC LIMIT 1 FOR UPDATE`,
      [input.docType, input.bizType, input.bizId],
    );
    if (placeholder) {
      docId = Number(placeholder.id);
      await txExec(
        conn,
        `UPDATE document SET file_name = ?, mime_type = ?, file_path = ?, file_size = ?, content_hash = ?,
           updated_at = ? WHERE id = ?`,
        [file.fileName, mimeType, file.filePath, file.fileSize, file.contentHash, at, docId],
      );
      const notarized = await appendNotarize(conn, {
        bizType: 'DOCUMENT',
        bizId: docId,
        eventType: `${input.docType}_UPLOAD`,
        payload: { docType: input.docType, fileName: file.fileName, contentHash: file.contentHash },
      });
      await txExec(conn, 'UPDATE document SET notarize_tx_id = ? WHERE id = ?', [notarized.txId, docId]);
    } else {
      const row = await createDocumentRecord(conn, {
        docType: input.docType,
        bizType: input.bizType,
        bizId: input.bizId,
        fileName: input.fileName,
        mimeType,
        content: buffer,
        createdBy: user.uid,
      });
      docId = Number(row.id);
      await txExec(
        conn,
        'UPDATE document SET file_path = ?, file_size = ?, content_hash = ? WHERE id = ?',
        [file.filePath, file.fileSize, file.contentHash, docId],
      );
    }

    // POD 自动 OCR
    if (input.docType === 'POD') {
      const row = await txQueryOne<DocumentRow>(conn, 'SELECT * FROM document WHERE id = ?', [docId]);
      if (row) {
        const ocr = await runMockOcr(conn, row, input.waybillId ?? (input.bizType === 'WAYBILL' ? input.bizId : null));
        await txExec(conn, 'UPDATE document SET ocr_status = ?, ocr_result = ? WHERE id = ?', [
          ocr.ocrStatus,
          JSON.stringify(ocr.ocrResult),
          docId,
        ]);
      }
    }

    // 回单事件 + 存证
    if (input.bizType === 'WAYBILL') {
      const waybillId = Number(input.waybillId ?? input.bizId);
      await appendWaybillEvent(conn, {
        waybillId,
        eventType: 'POD',
        operatorUserId: user.uid,
        description: `回单上传：${file.fileName}`,
        payload: { docId, docNo: placeholder?.doc_no ?? null, docType: input.docType, fileName: file.fileName },
      });
    }

    await writeAudit(conn, {
      user,
      action: 'DOCUMENT_UPLOAD',
      actionLabel: '上传单证',
      module: 'document',
      targetType: 'DOCUMENT',
      targetId: docId,
      detail: { docType: input.docType, bizType: input.bizType, bizId: input.bizId, fileName: file.fileName },
      ip,
    });

    const row = await txQueryOne<DocumentRow>(conn, 'SELECT * FROM document WHERE id = ?', [docId]);
    if (!row) {
      throw new ApiError(50000, '单证上传后读取失败');
    }
    const seal = row.seal_id ? await loadSeal(conn, Number(row.seal_id)) : null;
    return documentDto(row, seal);
  });
}

/** GET /api/documents */
export async function listDocuments(query: Record<string, unknown>) {
  const pager = parsePage(query, 10);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const docType = optionalString(query.docType);
  const bizType = optionalString(query.bizType);
  const bizId = optionalString(query.bizId);
  const ocrStatus = optionalString(query.ocrStatus);
  if (docType) {
    conditions.push('d.doc_type = ?');
    params.push(docType);
  }
  if (bizType) {
    conditions.push('d.biz_type = ?');
    params.push(bizType);
  }
  if (bizId) {
    conditions.push('d.biz_id = ?');
    params.push(Number(bizId));
  }
  if (ocrStatus) {
    conditions.push('d.ocr_status = ?');
    params.push(ocrStatus);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM document d ${where}`,
    params,
  );
  const rows = await queryRows<DocumentRow>(
    `SELECT d.* FROM document d ${where} ORDER BY d.created_at DESC, d.id DESC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  return pageResult(rows.map((row) => documentDto(row)), Number(totalRow?.total ?? 0), pager);
}

/** POST /api/documents/:id/ocr */
export async function rerunOcr(id: number, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const doc = await txQueryOne<DocumentRow>(conn, 'SELECT * FROM document WHERE id = ? FOR UPDATE', [id]);
    if (!doc) {
      throw new ApiError(40401, '单证不存在');
    }
    const ocr = await runMockOcr(conn, doc);
    await txExec(conn, 'UPDATE document SET ocr_status = ?, ocr_result = ? WHERE id = ?', [
      ocr.ocrStatus,
      JSON.stringify(ocr.ocrResult),
      id,
    ]);
    await writeAudit(conn, {
      user,
      action: 'DOCUMENT_OCR',
      actionLabel: '单证 OCR',
      module: 'document',
      targetType: 'DOCUMENT',
      targetId: id,
      detail: { docNo: doc.doc_no, ocrStatus: ocr.ocrStatus },
      ip,
    });
    return { ocrStatus: ocr.ocrStatus, ocrStatusLabel: OCR_STATUS_LABELS[ocr.ocrStatus], ocrResult: ocr.ocrResult };
  });
}

export interface SignDocumentInput {
  signerName: string;
  sealId?: number | null;
}

/** POST /api/documents/:id/sign：Mock CA 签章 + CA_SIGN 报文 + SIGN 事件 + 存证 */
export async function signDocument(id: number, input: SignDocumentInput, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const doc = await txQueryOne<DocumentRow>(conn, 'SELECT * FROM document WHERE id = ? FOR UPDATE', [id]);
    if (!doc) {
      throw new ApiError(40401, '单证不存在');
    }
    if (doc.sign_status === 'SIGNED') {
      throw new ApiError(40902, '单证已签章，请勿重复操作');
    }
    const seal = await pickSeal(conn, user, input.sealId ?? null);
    const signedAt = formatDateTime(nowDate());
    const signHash = sha256(
      `${doc.doc_no}|${doc.content_hash ?? ''}|${input.signerName}|${signedAt}|${PLATFORM_SALT}`,
    );
    await txExec(
      conn,
      `UPDATE document SET sign_status = 'SIGNED', signed_at = ?, sign_hash = ?, seal_id = ?, signer_name = ?,
         updated_at = ? WHERE id = ?`,
      [signedAt, signHash, seal ? Number(seal.id) : null, input.signerName, signedAt, id],
    );
    const notarized = await appendNotarize(conn, {
      bizType: 'DOCUMENT',
      bizId: id,
      eventType: 'DOCUMENT_SIGN',
      payload: { docNo: doc.doc_no, contentHash: doc.content_hash, signerName: input.signerName, sealNo: seal?.seal_no ?? null },
    });
    await txExec(conn, 'UPDATE document SET notarize_tx_id = ? WHERE id = ?', [notarized.txId, id]);

    await insertIntegrationMessage(
      conn,
      caSignMessage({
        docId: id,
        docNo: doc.doc_no,
        docType: doc.doc_type,
        signerName: input.signerName,
        signHash,
        sealNo: seal?.seal_no ?? null,
        signedAt,
      }),
    );

    if (doc.biz_type === 'WAYBILL') {
      await appendWaybillEvent(conn, {
        waybillId: Number(doc.biz_id),
        eventType: 'SIGN',
        operatorUserId: user.uid,
        description: `单证签章：${doc.doc_no}`,
        payload: { docId: id, docNo: doc.doc_no, signerName: input.signerName, signHash },
      });
    }

    await writeAudit(conn, {
      user,
      action: 'DOCUMENT_SIGN',
      actionLabel: '单证签章',
      module: 'document',
      targetType: 'DOCUMENT',
      targetId: id,
      detail: { docNo: doc.doc_no, signerName: input.signerName, signHash, sealNo: seal?.seal_no ?? null },
      ip,
    });

    const row = await txQueryOne<DocumentRow>(conn, 'SELECT * FROM document WHERE id = ?', [id]);
    if (!row) {
      throw new ApiError(50000, '单证签章后读取失败');
    }
    const sealRow = seal ?? (row.seal_id ? await loadSeal(conn, Number(row.seal_id)) : null);
    return documentDto(row, sealRow);
  });
}

/** 按主运单 id 集合取单证（含分段单） */
export async function documentsForWaybills(ids: number[]): Promise<DocumentRow[]> {
  if (ids.length === 0) return [];
  return queryRows<DocumentRow>(
    `SELECT * FROM document WHERE biz_type = 'WAYBILL' AND biz_id IN (?) ORDER BY created_at ASC, id ASC`,
    [ids],
  );
}

/** 单证存证记录（供详情展示最近一条） */
export async function latestNotarizeForDocument(docId: number) {
  const row = await queryOne<{ tx_id: string | null }>(
    'SELECT tx_id FROM notarize_record WHERE biz_type = ? AND biz_id = ? ORDER BY block_height DESC LIMIT 1',
    ['DOCUMENT', docId],
  );
  return row?.tx_id ?? null;
}

export { formatDate, round2, notarizeDto, todayDateString };
