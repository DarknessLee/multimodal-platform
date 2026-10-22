import express from 'express';
import { z } from 'zod';
import { okBody } from '../../errors';
import { requirePermission } from '../../middleware/rbac';
import { asyncHandler, parseId } from '../../utils/http';
import { validate } from '../../utils/validate';
import { confirmPayment, createPayment, listPayments } from './service';

const router = express.Router();

/** GET /api/payments */
router.get(
  '/',
  requirePermission('menu:payment'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listPayments(req.query as Record<string, unknown>)));
  }),
);

const createSchema = z.object({
  direction: z.enum(['IN', 'OUT'], { errorMap: () => ({ message: '收付方向不合法' }) }),
  billId: z.coerce.number({ invalid_type_error: '账单不能为空' }).int().positive('账单不能为空'),
  amount: z.coerce.number({ invalid_type_error: '金额必须为数字' }).positive('金额必须大于 0'),
  method: z.enum(['BANK_TRANSFER', 'ONLINE', 'FACTORING']).optional(),
  payerName: z.string().trim().max(100).optional(),
  remark: z.string().trim().max(255).optional(),
});

/** POST /api/payments */
router.post(
  '/',
  requirePermission('payment:record'),
  asyncHandler(async (req, res) => {
    const body = validate(createSchema, req.body);
    res.json(
      okBody(
        await createPayment(
          {
            direction: body.direction,
            billId: body.billId,
            amount: body.amount,
            method: body.method,
            payerName: body.payerName,
            remark: body.remark,
          },
          req.user!,
          req.ip ?? null,
        ),
      ),
    );
  }),
);

/** POST /api/payments/:id/confirm */
router.post(
  '/:id/confirm',
  requirePermission('payment:confirm'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await confirmPayment(parseId(req.params.id), req.user!, req.ip ?? null)));
  }),
);

export const paymentsRouter = router;
