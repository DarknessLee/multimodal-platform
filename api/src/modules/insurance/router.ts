import express from 'express';
import { z } from 'zod';
import { okBody } from '../../errors';
import { requirePermission } from '../../middleware/rbac';
import { asyncHandler, parseId } from '../../utils/http';
import { validate } from '../../utils/validate';
import { createPolicy, getPolicyDetail, listPolicies } from './service';

const router = express.Router();

/** GET /api/insurance/policies */
router.get(
  '/policies',
  requirePermission('menu:insurance'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listPolicies(req.query as Record<string, unknown>)));
  }),
);

const createSchema = z.object({
  orderId: z.coerce.number({ invalid_type_error: '订单不能为空' }).int().positive('订单不能为空'),
  insuredAmount: z.coerce.number({ invalid_type_error: '保额必须为数字' }).positive('保额必须大于 0'),
  rate: z.coerce.number().min(0).max(100).optional(),
  insurerPartnerId: z.coerce.number().int().positive().optional().nullable(),
});

/** POST /api/insurance/policies */
router.post(
  '/policies',
  requirePermission('insurance:create'),
  asyncHandler(async (req, res) => {
    const body = validate(createSchema, req.body);
    res.json(
      okBody(
        await createPolicy(
          {
            orderId: body.orderId,
            insuredAmount: body.insuredAmount,
            rate: body.rate,
            insurerPartnerId: body.insurerPartnerId ?? null,
          },
          req.user!,
          req.ip ?? null,
        ),
      ),
    );
  }),
);

/** GET /api/insurance/policies/:id */
router.get(
  '/policies/:id',
  requirePermission('menu:insurance'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await getPolicyDetail(parseId(req.params.id))));
  }),
);

export const insuranceRouter = router;
