// 合同：创建 / 列表 / 详情 / 发送 / Mock CA 签章
import { createHash } from 'node:crypto';
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
  PAYMENT_TERMS_LABELS,
} from '../../config/labels';
import { queryOne, queryRows, txExec, txQueryOne, withTransaction } from '../../db/pool';
import { ApiError } from '../../errors';
import { writeAudit, type AuditActor } from '../../middleware/audit';
import { emitEvent } from '../../platform/eventBus';
import { nextDocNo } from '../../platform/sequence';
import type { ContractRow, CustomerRow } from '../../types';
import { formatDateTime, nowDate, thisMonthCompact } from '../../utils/datetime';
import { optionalString, pageResult, parsePage } from '../shared/pagination';

/** Mock CA 平台盐（与种子 signHash 规则一致） */
export const PLATFORM_SALT = 'MULTIMODAL_PLATFORM';

export function calculateSignHash(
  contractNo: string,
  customerId: number,
  signerName: string,
  signedAt: string,
): string {
  return createHash('sha256')
    .update(`${contractNo}|${customerId}|${signerName}|${signedAt}|${PLATFORM_SALT}`)
    .digest('hex');
}

interface ContractJoinedRow extends ContractRow {
  customer_name: string;
  customer_short_name: string;
  customer_credit_level: string;
  order_count: number;
}

const CONTRACT_JOINED_SELECT = `
  SELECT ct.*, c.name AS customer_name, c.short_name AS customer_short_name,
         c.credit_level AS customer_credit_level,
         (SELECT COUNT(*) FROM orders o WHERE o.contract_id = ct.id) AS order_count
    FROM contract ct
    JOIN customer c ON c.id = ct.customer_id`;

function contractDto(row: ContractJoinedRow) {
  return {
    id: Number(row.id),
    contractNo: row.contract_no,
    customer: {
      id: Number(row.customer_id),
      name: row.customer_name,
      shortName: row.customer_short_name,
      creditLevel: row.customer_credit_level,
    },
    contractType: row.contract_type,
    contractTypeLabel: CONTRACT_TYPE_LABELS[row.contract_type],
    title: row.title,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    paymentTerms: row.payment_terms,
    paymentTermsLabel: PAYMENT_TERMS_LABELS[row.payment_terms] ?? row.payment_terms,
    creditLimit: Number(row.credit_limit),
    discountRate: Number(row.discount_rate),
    settleCurrency: row.settle_currency,
    status: row.status,
    statusLabel: CONTRACT_STATUS_LABELS[row.status],
    signerName: row.signer_name,
    signedAt: row.signed_at,
    signHash: row.sign_hash,
    fileUrl: row.file_url,
    createdBy: row.created_by === null ? null : Number(row.created_by),
    orderCount: Number(row.order_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getContractDetail(id: number, user?: { role: string; customer_id?: number | null }) {
  const row = await queryOne<ContractJoinedRow>(`${CONTRACT_JOINED_SELECT} WHERE ct.id = ?`, [id]);
  if (!row) {
    throw new ApiError(40401, '合同不存在');
  }
  if (user?.role === 'SHIPPER' && user.customer_id && Number(row.customer_id) !== Number(user.customer_id)) {
    throw new ApiError(40301, '无权查看该合同');
  }
  return contractDto(row);
}

export async function listContracts(query: Record<string, unknown>, user: { role: string; customer_id?: number | null }) {
  const pager = parsePage(query, 10);
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (user.role === 'SHIPPER') {
    conditions.push('ct.customer_id = ?');
    params.push(user.customer_id ?? -1);
  }
  const status = optionalString(query.status);
  const customerId = optionalString(query.customerId);
  if (status) {
    conditions.push('ct.status = ?');
    params.push(status);
  }
  if (customerId) {
    conditions.push('ct.customer_id = ?');
    params.push(Number(customerId));
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM contract ct ${where}`,
    params,
  );
  const rows = await queryRows<ContractJoinedRow>(
    `${CONTRACT_JOINED_SELECT} ${where} ORDER BY ct.created_at DESC, ct.id DESC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  return pageResult(rows.map(contractDto), Number(totalRow?.total ?? 0), pager);
}

export interface CreateContractInput {
  customerId: number;
  contractType?: 'FRAMEWORK' | 'SPOT';
  title: string;
  effectiveFrom: string;
  effectiveTo: string;
  paymentTerms: string;
  creditLimit?: number;
  discountRate?: number;
  settleCurrency?: string;
}

export async function createContract(input: CreateContractInput, user: AuditActor, ip: string | null) {
  const customer = await queryOne<CustomerRow>('SELECT * FROM customer WHERE id = ?', [input.customerId]);
  if (!customer || customer.status !== 'ACTIVE') {
    throw new ApiError(40401, '客户不存在或已停用');
  }
  if (input.effectiveFrom > input.effectiveTo) {
    throw new ApiError(42201, '合同生效日期不能晚于失效日期');
  }
  const contractId = await withTransaction(async (conn) => {
    const contractNo = await nextDocNo(conn, {
      table: 'contract',
      column: 'contract_no',
      prefix: `HT${thisMonthCompact()}`,
      width: 4,
    });
    const at = formatDateTime(nowDate());
    const result = await txExec(
      conn,
      `INSERT INTO contract (contract_no, customer_id, contract_type, title, effective_from, effective_to,
         payment_terms, credit_limit, discount_rate, settle_currency, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)`,
      [
        contractNo,
        Number(input.customerId),
        input.contractType ?? 'FRAMEWORK',
        input.title,
        input.effectiveFrom,
        input.effectiveTo,
        input.paymentTerms,
        input.creditLimit ?? 0,
        input.discountRate ?? 0,
        input.settleCurrency ?? 'CNY',
        user.uid,
        at,
        at,
      ],
    );
    const id = Number(result.insertId);
    await writeAudit(conn, {
      user,
      action: 'CONTRACT_CREATE',
      actionLabel: '创建合同',
      module: 'contract',
      targetType: 'CONTRACT',
      targetId: id,
      detail: { contractNo, customerId: input.customerId, title: input.title },
      ip,
    });
    return id;
  });
  return getContractDetail(contractId, { role: user.role, customer_id: null });
}

/** POST /contracts/:id/send：DRAFT → PENDING_SIGN */
export async function sendContract(id: number, user: AuditActor, ip: string | null) {
  await withTransaction(async (conn) => {
    const contract = await txQueryOne<ContractRow>(conn, 'SELECT * FROM contract WHERE id = ? FOR UPDATE', [id]);
    if (!contract) {
      throw new ApiError(40401, '合同不存在');
    }
    if (contract.status === 'PENDING_SIGN') {
      throw new ApiError(40902, '合同已发送，请勿重复操作');
    }
    if (contract.status !== 'DRAFT') {
      throw new ApiError(40901, `当前合同状态（${CONTRACT_STATUS_LABELS[contract.status]}）不允许发送`);
    }
    const at = formatDateTime(nowDate());
    await txExec(conn, 'UPDATE contract SET status = ?, updated_at = ? WHERE id = ?', ['PENDING_SIGN', at, id]);
    await emitEvent(conn, {
      eventType: 'contract.sent',
      aggregateType: 'CONTRACT',
      aggregateId: Number(contract.id),
      payload: {
        contractId: Number(contract.id),
        contractNo: contract.contract_no,
        customerId: Number(contract.customer_id),
        title: contract.title,
        sentAt: at,
      },
    });
    await writeAudit(conn, {
      user,
      action: 'CONTRACT_SEND',
      actionLabel: '发送合同',
      module: 'contract',
      targetType: 'CONTRACT',
      targetId: Number(contract.id),
      detail: { contractNo: contract.contract_no },
      ip,
    });
  });
  // 事务提交后再读取详情，避免读到旧快照
  return getContractDetail(id, { role: user.role, customer_id: null });
}

export interface SignContractInput {
  signerName: string;
}

/** POST /contracts/:id/sign：PENDING_SIGN → SIGNED（Mock CA 签章） */
export async function signContract(
  id: number,
  input: SignContractInput,
  user: AuditActor & { customer_id?: number | null },
  ip: string | null,
) {
  await withTransaction(async (conn) => {
    const contract = await txQueryOne<ContractRow>(conn, 'SELECT * FROM contract WHERE id = ? FOR UPDATE', [id]);
    if (!contract) {
      throw new ApiError(40401, '合同不存在');
    }
    if (user.role === 'SHIPPER' && user.customer_id && Number(contract.customer_id) !== Number(user.customer_id)) {
      throw new ApiError(40301, '只能签署本人所属客户的合同');
    }
    if (contract.status === 'SIGNED') {
      throw new ApiError(40902, '合同已签署，请勿重复操作');
    }
    if (contract.status !== 'PENDING_SIGN') {
      throw new ApiError(40901, `当前合同状态（${CONTRACT_STATUS_LABELS[contract.status]}）不允许签署`);
    }
    const at = formatDateTime(nowDate());
    const signHash = calculateSignHash(contract.contract_no, Number(contract.customer_id), input.signerName, at);
    await txExec(
      conn,
      `UPDATE contract SET status = 'SIGNED', signer_name = ?, signed_at = ?, sign_hash = ?, updated_at = ? WHERE id = ?`,
      [input.signerName, at, signHash, at, id],
    );
    await emitEvent(conn, {
      eventType: 'contract.signed',
      aggregateType: 'CONTRACT',
      aggregateId: Number(contract.id),
      payload: {
        contractId: Number(contract.id),
        contractNo: contract.contract_no,
        customerId: Number(contract.customer_id),
        signerName: input.signerName,
        signedAt: at,
        signHash,
      },
    });
    await writeAudit(conn, {
      user,
      action: 'CONTRACT_SIGN',
      actionLabel: '签署合同',
      module: 'contract',
      targetType: 'CONTRACT',
      targetId: Number(contract.id),
      detail: { contractNo: contract.contract_no, signerName: input.signerName, signHash },
      ip,
    });
  });
  // 事务提交后再读取详情（signHash 等落库值）
  return getContractDetail(id, { role: user.role, customer_id: user.customer_id ?? null });
}

/** 供订单模块：校验合同可关联 */
export async function findSignedContract(
  contractId: number,
  customerId: number,
): Promise<ContractRow> {
  const contract = await queryOne<ContractRow>('SELECT * FROM contract WHERE id = ?', [contractId]);
  if (!contract) {
    throw new ApiError(40401, '合同不存在');
  }
  if (Number(contract.customer_id) !== Number(customerId)) {
    throw new ApiError(42201, '合同客户不一致');
  }
  if (contract.status !== 'SIGNED') {
    throw new ApiError(42201, '合同未签署，不能关联订单');
  }
  return contract;
}
