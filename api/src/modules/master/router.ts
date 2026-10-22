import express from 'express';
import { z } from 'zod';
import { okBody } from '../../errors';
import { requirePermission } from '../../middleware/rbac';
import { requireRole } from '../../middleware/auth';
import { asyncHandler, parseId } from '../../utils/http';
import { validate } from '../../utils/validate';
import {
  createCustomer,
  createPartner,
  createPriceRule,
  getCustomer,
  listContainerTypes,
  listCustomers,
  listDict,
  listGoods,
  listPartners,
  listPorts,
  listPriceRules,
  listRoutes,
} from './service';

const readRole = requireRole('SHIPPER', 'FORWARDER', 'MTO', 'ADMIN');
const masterReadRole = requireRole('MTO', 'ADMIN', 'FORWARDER');

const creditCodeSchema = z
  .string({ required_error: '统一社会信用代码不能为空' })
  .regex(/^[0-9A-Z]{18}$/, '统一社会信用代码应为 18 位大写字母/数字');
const regionCodeSchema = z
  .string({ required_error: '行政区划代码不能为空' })
  .regex(/^\d{6}$/, '行政区划代码应为 6 位数字');

// ── 客户 ────────────────────────────────────────────────────────────────────
export const customersRouter = express.Router();

customersRouter.get(
  '/',
  readRole,
  asyncHandler(async (req, res) => {
    res.json(okBody(await listCustomers(req.query as Record<string, unknown>)));
  }),
);

customersRouter.get(
  '/:id',
  readRole,
  asyncHandler(async (req, res) => {
    res.json(okBody(await getCustomer(parseId(req.params.id))));
  }),
);

const createCustomerSchema = z.object({
  name: z.string({ required_error: '客户名称不能为空' }).trim().min(1, '客户名称不能为空').max(100),
  shortName: z.string().trim().max(50).optional(),
  creditCode: creditCodeSchema,
  contactName: z.string({ required_error: '联系人不能为空' }).trim().min(1, '联系人不能为空').max(50),
  contactPhone: z.string({ required_error: '联系电话不能为空' }).trim().min(1, '联系电话不能为空').max(30),
  email: z.string().trim().max(100).optional().nullable(),
  regionCode: regionCodeSchema,
  address: z.string({ required_error: '地址不能为空' }).trim().min(1, '地址不能为空').max(200),
  industry: z.string().trim().max(50).optional(),
  creditLevel: z.enum(['AAA', 'AA', 'A', 'B', 'C']).optional(),
  remark: z.string().trim().max(255).optional().nullable(),
});

customersRouter.post(
  '/',
  requireRole('FORWARDER', 'MTO', 'ADMIN'),
  requirePermission('customer:create'),
  asyncHandler(async (req, res) => {
    const input = validate(createCustomerSchema, req.body);
    res.json(okBody(await createCustomer(input, req.user!, req.ip ?? null)));
  }),
);

// ── 伙伴 ────────────────────────────────────────────────────────────────────
export const partnersRouter = express.Router();

partnersRouter.get(
  '/',
  masterReadRole,
  asyncHandler(async (req, res) => {
    res.json(okBody(await listPartners(req.query as Record<string, unknown>)));
  }),
);

const partnerTypeEnum = z.enum(
  [
    'ROAD_CARRIER',
    'RAIL_OPERATOR',
    'SEA_CARRIER',
    'PORT',
    'RAIL_STATION',
    'DEPOT',
    'WAREHOUSE',
    'FORWARDER',
    'FINANCE',
    'INSURANCE',
    'REGULATOR',
  ],
  { errorMap: () => ({ message: '伙伴类型不合法' }) },
);

const createPartnerSchema = z.object({
  name: z.string({ required_error: '伙伴名称不能为空' }).trim().min(1, '伙伴名称不能为空').max(100),
  shortName: z.string().trim().max(50).optional(),
  type: partnerTypeEnum,
  creditCode: creditCodeSchema,
  contactName: z.string({ required_error: '联系人不能为空' }).trim().min(1, '联系人不能为空').max(50),
  contactPhone: z.string({ required_error: '联系电话不能为空' }).trim().min(1, '联系电话不能为空').max(30),
  email: z.string().trim().max(100).optional().nullable(),
  regionCode: regionCodeSchema,
  address: z.string({ required_error: '地址不能为空' }).trim().min(1, '地址不能为空').max(200),
  qualifications: z.unknown().optional(),
  rating: z.coerce.number().min(0, '评分不能小于 0').max(5, '评分不能大于 5').optional(),
  settlementAccount: z.string().trim().max(50).optional().nullable(),
  remark: z.string().trim().max(255).optional().nullable(),
});

partnersRouter.post(
  '/',
  requirePermission('partner:create'),
  asyncHandler(async (req, res) => {
    const input = validate(createPartnerSchema, req.body);
    res.json(okBody(await createPartner(input, req.user!, req.ip ?? null)));
  }),
);

// ── 港站 / 线路 / 货物 / 箱型（登录用户皆可读，供下单/报价选择） ───────────
export const portsRouter = express.Router();
portsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(okBody(await listPorts(String(req.query.type ?? '') || null)));
  }),
);

export const routesRouter = express.Router();
routesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(okBody(await listRoutes()));
  }),
);

export const goodsRouter = express.Router();
goodsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(okBody(await listGoods()));
  }),
);

export const containerTypesRouter = express.Router();
containerTypesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(okBody(await listContainerTypes()));
  }),
);

export const dictsRouter = express.Router();
dictsRouter.get(
  '/:type',
  asyncHandler(async (req, res) => {
    res.json(okBody(await listDict(String(req.params.type))));
  }),
);

// ── 价格规则 ────────────────────────────────────────────────────────────────
export const priceRulesRouter = express.Router();

priceRulesRouter.get(
  '/',
  masterReadRole,
  asyncHandler(async (req, res) => {
    res.json(okBody(await listPriceRules(req.query as Record<string, unknown>)));
  }),
);

const createPriceRuleSchema = z.object({
  ruleName: z.string({ required_error: '规则名称不能为空' }).trim().min(1, '规则名称不能为空').max(120),
  mode: z.enum(['ROAD', 'SEA', 'RAIL', 'PORT', 'OTHER'], {
    errorMap: () => ({ message: '计费模式不合法' }),
  }),
  chargeType: z.enum(['BASE', 'SURCHARGE']).optional(),
  routeTemplateId: z.coerce.number().int().positive().optional().nullable(),
  containerTypeCode: z.string().trim().max(10).optional().nullable(),
  containerTypeId: z.coerce.number().int().positive().optional().nullable(),
  customerId: z.coerce.number().int().positive().optional().nullable(),
  contractId: z.coerce.number().int().positive().optional().nullable(),
  calcMethod: z.enum(['PER_CONTAINER', 'PER_KM', 'PER_TON', 'PER_TEU', 'FLAT'], {
    errorMap: () => ({ message: '计算方式不合法' }),
  }),
  unitPrice: z.coerce.number().min(0, '单价不能为负数'),
  unit: z.string().trim().max(20).optional(),
  minCharge: z.coerce.number().min(0, '最低收费不能为负数').optional(),
  priority: z.coerce.number().int().optional(),
  effectiveFrom: z.string({ required_error: '生效日期不能为空' }).regex(/^\d{4}-\d{2}-\d{2}$/, '生效日期格式应为 YYYY-MM-DD'),
  effectiveTo: z.string({ required_error: '失效日期不能为空' }).regex(/^\d{4}-\d{2}-\d{2}$/, '失效日期格式应为 YYYY-MM-DD'),
  currency: z.string().trim().length(3).optional(),
  remark: z.string().trim().max(255).optional().nullable(),
});

priceRulesRouter.post(
  '/',
  requirePermission('price:create'),
  asyncHandler(async (req, res) => {
    const input = validate(createPriceRuleSchema, req.body);
    res.json(okBody(await createPriceRule(input, req.user!, req.ip ?? null)));
  }),
);
