import express from 'express';
import { z } from 'zod';
import { okBody } from '../../errors';
import { requirePermission } from '../../middleware/rbac';
import { asyncHandler, parseId } from '../../utils/http';
import { validate } from '../../utils/validate';
import {
  approveFactoringApplication,
  createFactoringApplication,
  listFactoringApplications,
  settleFactoringApplication,
} from './service';

const router = express.Router();

/** GET /api/factoring/applications */
router.get(
  '/applications',
  requirePermission('menu:factoring'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listFactoringApplications(req.query as Record<string, unknown>)));
  }),
);

const createSchema = z.object({
  billId: z.coerce.number({ invalid_type_error: '账单不能为空' }).int().positive('账单不能为空'),
  financePartnerId: z.coerce.number({ invalid_type_error: '保理机构不能为空' }).int().positive('保理机构不能为空'),
  amount: z.coerce.number().positive('保理金额必须大于 0').optional(),
  discountRate: z.coerce.number().min(0).max(100).optional(),
});

/** POST /api/factoring/applications */
router.post(
  '/applications',
  requirePermission('factoring:apply'),
  asyncHandler(async (req, res) => {
    const input = validate(createSchema, req.body);
    res.json(okBody(await createFactoringApplication(input, req.user!, req.ip ?? null)));
  }),
);

const approveSchema = z.object({
  approved: z.boolean({ required_error: '审批结果不能为空' }),
});

/** POST /api/factoring/applications/:id/approve */
router.post(
  '/applications/:id/approve',
  requirePermission('factoring:approve'),
  asyncHandler(async (req, res) => {
    const body = validate(approveSchema, req.body);
    res.json(
      okBody(await approveFactoringApplication(parseId(req.params.id), body.approved, req.user!, req.ip ?? null)),
    );
  }),
);

/** POST /api/factoring/applications/:id/settle */
router.post(
  '/applications/:id/settle',
  requirePermission('factoring:approve'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await settleFactoringApplication(parseId(req.params.id), req.user!, req.ip ?? null)));
  }),
);

export const factoringRouter = router;
