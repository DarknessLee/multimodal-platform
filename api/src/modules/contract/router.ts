import express from 'express';
import { z } from 'zod';
import { okBody } from '../../errors';
import { requireRole } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { asyncHandler, parseId } from '../../utils/http';
import { validate } from '../../utils/validate';
import { createContract, getContractDetail, listContracts, sendContract, signContract } from './service';

const router = express.Router();
const contractRoles = requireRole('SHIPPER', 'FORWARDER', 'MTO', 'ADMIN');

const createContractSchema = z
  .object({
    customerId: z.coerce.number({ invalid_type_error: '客户不能为空' }).int().positive('客户不能为空'),
    contractType: z.enum(['FRAMEWORK', 'SPOT']).optional(),
    title: z.string({ required_error: '合同标题不能为空' }).trim().min(1, '合同标题不能为空').max(120),
    effectiveFrom: z
      .string({ required_error: '生效日期不能为空' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, '生效日期格式应为 YYYY-MM-DD'),
    effectiveTo: z
      .string({ required_error: '失效日期不能为空' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, '失效日期格式应为 YYYY-MM-DD'),
    paymentTerms: z.string({ required_error: '账期不能为空' }).trim().min(1, '账期不能为空').max(50),
    creditLimit: z.coerce.number().min(0, '信用额度不能为负数').optional(),
    discountRate: z.coerce.number().min(0, '折扣率不能为负数').max(100, '折扣率不能超过 100').optional(),
    settleCurrency: z.string().trim().length(3).optional(),
  })
  .refine((value) => value.effectiveFrom <= value.effectiveTo, {
    message: '生效日期不能晚于失效日期',
    path: ['effectiveTo'],
  });

const signContractSchema = z.object({
  signerName: z.string({ required_error: '签署人不能为空' }).trim().min(1, '签署人不能为空').max(50),
});

/** GET /api/contracts */
router.get(
  '/',
  contractRoles,
  asyncHandler(async (req, res) => {
    res.json(okBody(await listContracts(req.query as Record<string, unknown>, req.user!)));
  }),
);

/** GET /api/contracts/:id */
router.get(
  '/:id',
  contractRoles,
  asyncHandler(async (req, res) => {
    res.json(okBody(await getContractDetail(parseId(req.params.id), req.user!)));
  }),
);

/** POST /api/contracts */
router.post(
  '/',
  requireRole('FORWARDER', 'MTO', 'ADMIN'),
  requirePermission('contract:create'),
  asyncHandler(async (req, res) => {
    const input = validate(createContractSchema, req.body);
    res.json(okBody(await createContract(input, req.user!, req.ip ?? null)));
  }),
);

/** POST /api/contracts/:id/send */
router.post(
  '/:id/send',
  requirePermission('contract:send'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await sendContract(parseId(req.params.id), req.user!, req.ip ?? null)));
  }),
);

/** POST /api/contracts/:id/sign（Mock CA） */
router.post(
  '/:id/sign',
  requirePermission('contract:sign'),
  asyncHandler(async (req, res) => {
    const body = validate(signContractSchema, req.body);
    res.json(
      okBody(await signContract(parseId(req.params.id), body, req.user!, req.ip ?? null)),
    );
  }),
);

export const contractsRouter = router;
