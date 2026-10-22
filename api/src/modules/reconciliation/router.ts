import express from 'express';
import { z } from 'zod';
import { okBody } from '../../errors';
import { requirePermission, requirePermissionOrRole } from '../../middleware/rbac';
import { asyncHandler, parseId } from '../../utils/http';
import { validate } from '../../utils/validate';
import {
  confirmReconciliation,
  createReconciliation,
  disputeReconciliation,
  getReconciliationDetail,
  listReconciliations,
  sendReconciliation,
} from './service';

const router = express.Router();
const reconRead = requirePermissionOrRole(['menu:reconciliation'], ['CARRIER']);
const reconConfirm = requirePermissionOrRole(['recon:confirm'], ['CARRIER']);

/** GET /api/reconciliations */
router.get(
  '/',
  reconRead,
  asyncHandler(async (req, res) => {
    res.json(okBody(await listReconciliations(req.query as Record<string, unknown>)));
  }),
);

const createSchema = z.object({
  counterpartyType: z.enum(['CUSTOMER', 'CARRIER', 'FINANCE'], {
    errorMap: () => ({ message: '对手方类型不合法' }),
  }),
  counterpartyId: z.coerce.number({ invalid_type_error: '对手方不能为空' }).int().positive('对手方不能为空'),
  periodStart: z.string({ required_error: '周期开始日期不能为空' }).regex(/^\d{4}-\d{2}-\d{2}$/, '周期开始日期格式应为 YYYY-MM-DD'),
  periodEnd: z.string({ required_error: '周期结束日期不能为空' }).regex(/^\d{4}-\d{2}-\d{2}$/, '周期结束日期格式应为 YYYY-MM-DD'),
});

/** POST /api/reconciliations */
router.post(
  '/',
  requirePermission('recon:create'),
  asyncHandler(async (req, res) => {
    const input = validate(createSchema, req.body);
    res.json(okBody(await createReconciliation(input, req.user!, req.ip ?? null)));
  }),
);

/** GET /api/reconciliations/:id */
router.get(
  '/:id',
  reconRead,
  asyncHandler(async (req, res) => {
    res.json(okBody(await getReconciliationDetail(parseId(req.params.id))));
  }),
);

/** POST /api/reconciliations/:id/send */
router.post(
  '/:id/send',
  requirePermission('recon:send'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await sendReconciliation(parseId(req.params.id), req.user!, req.ip ?? null)));
  }),
);

const confirmSchema = z.object({
  confirmedAmount: z.coerce.number().min(0).optional(),
  items: z
    .array(
      z.object({
        billId: z.coerce.number().int().positive(),
        confirmedAmount: z.coerce.number().min(0),
      }),
    )
    .optional(),
});

/** POST /api/reconciliations/:id/confirm */
router.post(
  '/:id/confirm',
  reconConfirm,
  asyncHandler(async (req, res) => {
    const body = validate(confirmSchema, req.body ?? {});
    res.json(
      okBody(
        await confirmReconciliation(
          parseId(req.params.id),
          { confirmedAmount: body.confirmedAmount, items: body.items },
          req.user!,
          req.ip ?? null,
        ),
      ),
    );
  }),
);

const disputeSchema = z.object({
  reason: z.string({ required_error: '差异原因不能为空' }).trim().min(1, '差异原因不能为空').max(500),
  items: z
    .array(
      z.object({
        billId: z.coerce.number().int().positive(),
        differenceReason: z.string().trim().min(1).max(255),
      }),
    )
    .optional(),
});

/** POST /api/reconciliations/:id/dispute */
router.post(
  '/:id/dispute',
  requirePermission('recon:dispute'),
  asyncHandler(async (req, res) => {
    const body = validate(disputeSchema, req.body);
    res.json(
      okBody(
        await disputeReconciliation(
          parseId(req.params.id),
          { reason: body.reason, items: body.items },
          req.user!,
          req.ip ?? null,
        ),
      ),
    );
  }),
);

export const reconciliationsRouter = router;
