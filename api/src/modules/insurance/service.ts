// 货运险保单（Mock）：投保（BX 号 / 保费 = 保额 × 费率）与查询
import { INSURANCE_STATUS_LABELS, PARTNER_TYPE_LABELS } from '../../config/labels';
import { queryOne, queryRows, txExec, txQueryOne, withTransaction } from '../../db/pool';
import { ApiError } from '../../errors';
import { writeAudit } from '../../middleware/audit';
import { emitEvent } from '../../platform/eventBus';
import { nextDocNo } from '../../platform/sequence';
import type { AuthUser, InsurancePolicyRow, InsuranceStatus, OrderRow, PartnerRow, WaybillRow } from '../../types';
import { formatDateTime, nowDate, todayCompact } from '../../utils/datetime';
import { round2 } from '../../utils/json';
import { optionalString, pageResult, parsePage } from '../shared/pagination';

interface PolicyJoinedRow extends InsurancePolicyRow {
  order_no: string;
  waybill_no: string | null;
  insurer_name: string | null;
}

const POLICY_JOINED_SELECT = `
  SELECT i.*, o.order_no, w.waybill_no, p.name AS insurer_name
    FROM insurance_policy i
    JOIN orders o ON o.id = i.order_id
    LEFT JOIN waybill w ON w.id = i.waybill_id
    LEFT JOIN partner p ON p.id = i.insurer_partner_id`;

export function policyDto(row: PolicyJoinedRow) {
  return {
    id: Number(row.id),
    policyNo: row.policy_no,
    orderId: Number(row.order_id),
    orderNo: row.order_no,
    waybillId: row.waybill_id === null ? null : Number(row.waybill_id),
    waybillNo: row.waybill_no,
    insurerName: row.insurer_name,
    insuredAmount: Number(row.insured_amount),
    rate: Number(row.rate),
    premium: Number(row.premium),
    status: row.status,
    statusLabel: INSURANCE_STATUS_LABELS[row.status as InsuranceStatus],
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    createdAt: row.created_at,
  };
}

async function loadPolicyJoined(id: number): Promise<PolicyJoinedRow> {
  const row = await queryOne<PolicyJoinedRow>(`${POLICY_JOINED_SELECT} WHERE i.id = ?`, [id]);
  if (!row) {
    throw new ApiError(40401, '保单不存在');
  }
  return row;
}

/** GET /api/insurance/policies */
export async function listPolicies(query: Record<string, unknown>) {
  const pager = parsePage(query, 10, 100);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const status = optionalString(query.status);
  const orderId = optionalString(query.orderId);
  if (status) {
    conditions.push('i.status = ?');
    params.push(status);
  }
  if (orderId) {
    conditions.push('i.order_id = ?');
    params.push(Number(orderId));
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM insurance_policy i ${where}`,
    params,
  );
  const rows = await queryRows<PolicyJoinedRow>(
    `${POLICY_JOINED_SELECT} ${where} ORDER BY i.created_at DESC, i.id DESC LIMIT ? OFFSET ?`,
    [...params, pager.pageSize, pager.offset],
  );
  return pageResult(rows.map(policyDto), Number(totalRow?.total ?? 0), pager);
}

/** GET /api/insurance/policies/:id */
export async function getPolicyDetail(id: number) {
  const row = await loadPolicyJoined(id);
  const dto = policyDto(row);
  return { ...dto, policy: dto };
}

export interface CreatePolicyInput {
  orderId: number;
  insuredAmount: number;
  rate?: number;
  insurerPartnerId?: number | null;
}

/** POST /api/insurance/policies */
export async function createPolicy(input: CreatePolicyInput, user: AuthUser, ip: string | null) {
  return withTransaction(async (conn) => {
    const order = await txQueryOne<OrderRow>(conn, 'SELECT * FROM orders WHERE id = ?', [input.orderId]);
    if (!order) {
      throw new ApiError(40401, '订单不存在');
    }
    let insurer: PartnerRow | null = null;
    if (input.insurerPartnerId) {
      insurer = await txQueryOne<PartnerRow>(conn, 'SELECT * FROM partner WHERE id = ?', [input.insurerPartnerId]);
      if (!insurer) {
        throw new ApiError(40401, '保险机构不存在');
      }
    } else {
      insurer = await txQueryOne<PartnerRow>(
        conn,
        "SELECT * FROM partner WHERE type = 'INSURANCE' ORDER BY id ASC LIMIT 1",
      );
    }
    if (!insurer) {
      throw new ApiError(42201, '缺少保险合作机构，无法投保');
    }
    const waybill = await txQueryOne<WaybillRow>(
      conn,
      "SELECT * FROM waybill WHERE order_id = ? AND waybill_type = 'MASTER' ORDER BY id ASC LIMIT 1",
      [input.orderId],
    );
    const insuredAmount = round2(Number(input.insuredAmount));
    if (!Number.isFinite(insuredAmount) || insuredAmount <= 0) {
      throw new ApiError(40001, '保额必须大于 0');
    }
    const rate = Number(input.rate ?? 0.1);
    if (!Number.isFinite(rate) || rate < 0) {
      throw new ApiError(40001, '费率不合法');
    }
    const premium = round2((insuredAmount * rate) / 100);
    const policyNo = await nextDocNo(conn, {
      table: 'insurance_policy',
      column: 'policy_no',
      prefix: `BX${todayCompact()}`,
      width: 4,
    });
    const at = formatDateTime(nowDate());
    const effectiveTo = formatDateTime(new Date(Date.now() + 30 * 86400000));
    const inserted = await txExec(
      conn,
      `INSERT INTO insurance_policy (policy_no, order_id, waybill_id, insurer_partner_id, insured_amount, rate,
         premium, status, effective_from, effective_to, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ISSUED', ?, ?, ?)`,
      [
        policyNo,
        input.orderId,
        waybill ? Number(waybill.id) : null,
        Number(insurer.id),
        insuredAmount,
        rate,
        premium,
        at,
        effectiveTo,
        user.uid,
      ],
    );
    const policyId = Number(inserted.insertId);
    await emitEvent(conn, {
      eventType: 'insurance.issued',
      aggregateType: 'INSURANCE_POLICY',
      aggregateId: policyId,
      payload: { policyId, policyNo, orderId: input.orderId, insuredAmount, premium, issuedAt: at },
    });
    await writeAudit(conn, {
      user,
      action: 'INSURANCE_CREATE',
      actionLabel: '投保',
      module: 'insurance',
      targetType: 'INSURANCE_POLICY',
      targetId: policyId,
      detail: { policyNo, orderId: input.orderId, insuredAmount, rate, premium },
      ip,
    });
    const row = await txQueryOne<PolicyJoinedRow>(conn, `${POLICY_JOINED_SELECT} WHERE i.id = ?`, [policyId]);
    if (!row) {
      throw new ApiError(50000, '保单创建后读取失败');
    }
    const dto = policyDto(row);
  return { ...dto, policy: dto };
  });
}

export { PARTNER_TYPE_LABELS, loadPolicyJoined };
