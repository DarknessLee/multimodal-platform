import express from 'express';
import { z } from 'zod';
import { okBody } from '../../errors';
import { requireRole } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { asyncHandler, parseId } from '../../utils/http';
import { validate } from '../../utils/validate';
import { acceptQuote, createQuote, getQuoteDetail, listQuotes, sendQuote } from './service';

const router = express.Router();
const quoteRoles = requireRole('SHIPPER', 'FORWARDER', 'MTO', 'ADMIN');

const createQuoteSchema = z.object({
  customerId: z.coerce.number({ invalid_type_error: '客户不能为空' }).int().positive('客户不能为空'),
  orderType: z.enum(['ROAD_RAIL', 'RAIL_SEA', 'ROAD_RAIL_SEA']).optional(),
  routeTemplateId: z.coerce.number({ invalid_type_error: '线路不能为空' }).int().positive('线路不能为空'),
  containerTypeCode: z.string({ required_error: '箱型不能为空' }).trim().min(1, '箱型不能为空'),
  containerCount: z.coerce
    .number({ invalid_type_error: '箱量必须为数字' })
    .int('箱量必须为整数')
    .min(1, '箱量至少为 1')
    .max(100, '箱量不能超过 100'),
  goodsCode: z.string().trim().max(20).optional().nullable(),
  cargoName: z.string({ required_error: '货物名称不能为空' }).trim().min(1, '货物名称不能为空').max(100),
  cargoWeight: z.coerce.number({ invalid_type_error: '重量必须为数字' }).positive('重量必须大于 0'),
  requiredDate: z
    .string({ required_error: '要求发运日期不能为空' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, '要求发运日期格式应为 YYYY-MM-DD'),
  remark: z.string().trim().max(255).optional().nullable(),
});

/** POST /api/quotes */
router.post(
  '/',
  quoteRoles,
  requirePermission('quote:create'),
  asyncHandler(async (req, res) => {
    const input = validate(createQuoteSchema, req.body);
    res.json(okBody(await createQuote(input, req.user!, req.ip ?? null)));
  }),
);

/** GET /api/quotes */
router.get(
  '/',
  quoteRoles,
  asyncHandler(async (req, res) => {
    res.json(okBody(await listQuotes(req.query as Record<string, unknown>, req.user!)));
  }),
);

/** GET /api/quotes/:id */
router.get(
  '/:id',
  quoteRoles,
  asyncHandler(async (req, res) => {
    res.json(okBody(await getQuoteDetail(parseId(req.params.id), req.user!)));
  }),
);

/** POST /api/quotes/:id/send */
router.post(
  '/:id/send',
  requirePermission('quote:send'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await sendQuote(parseId(req.params.id), req.user!, req.ip ?? null)));
  }),
);

const acceptSchema = z.object({
  contractId: z.coerce.number().int().positive().optional().nullable(),
});

/** POST /api/quotes/:id/accept */
router.post(
  '/:id/accept',
  requirePermission('quote:accept'),
  asyncHandler(async (req, res) => {
    const body = validate(acceptSchema, req.body ?? {});
    res.json(
      okBody(await acceptQuote(parseId(req.params.id), { contractId: body.contractId ?? null }, req.user!, req.ip ?? null)),
    );
  }),
);

export const quotesRouter = router;
