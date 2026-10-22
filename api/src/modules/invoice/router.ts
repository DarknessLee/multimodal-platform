import express from 'express';
import { z } from 'zod';
import { okBody } from '../../errors';
import { requirePermission } from '../../middleware/rbac';
import { asyncHandler, parseId } from '../../utils/http';
import { validate } from '../../utils/validate';
import { createInvoice, getInvoiceDetail, listInvoices, voidInvoice } from './service';

const router = express.Router();

/** GET /api/invoices */
router.get(
  '/',
  requirePermission('menu:invoice'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listInvoices(req.query as Record<string, unknown>)));
  }),
);

const createSchema = z.object({
  billId: z.coerce.number({ invalid_type_error: '账单不能为空' }).int().positive('账单不能为空'),
  invoiceType: z.enum(['VAT_SPECIAL', 'VAT_NORMAL']).optional(),
  title: z.string().trim().max(100).optional(),
  taxNo: z.string().trim().max(18).optional().nullable(),
});

/** POST /api/invoices */
router.post(
  '/',
  requirePermission('invoice:issue'),
  asyncHandler(async (req, res) => {
    const input = validate(createSchema, req.body);
    res.json(
      okBody(
        await createInvoice(
          { billId: input.billId, invoiceType: input.invoiceType, title: input.title, taxNo: input.taxNo ?? undefined },
          req.user!,
          req.ip ?? null,
        ),
      ),
    );
  }),
);

/** GET /api/invoices/:id */
router.get(
  '/:id',
  requirePermission('menu:invoice'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await getInvoiceDetail(parseId(req.params.id))));
  }),
);

/** POST /api/invoices/:id/void */
router.post(
  '/:id/void',
  requirePermission('invoice:void'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await voidInvoice(parseId(req.params.id), req.user!, req.ip ?? null)));
  }),
);

export const invoicesRouter = router;
