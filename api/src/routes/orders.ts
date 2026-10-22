import express from 'express';
import { z } from 'zod';
import { okBody } from '../errors';
import { requireRole } from '../middleware/auth';
import { settleOrder } from '../services/billService';
import { createOrder } from '../services/orderCreateService';
import { getOrderDetail, listOrders } from '../services/orderQueryService';
import { dispatchOrder } from '../services/dispatchService';
import type { OrderStatus } from '../types';
import { todayDateString } from '../utils/datetime';
import { asyncHandler, parseId } from '../utils/http';
import { validate } from '../utils/validate';

const router = express.Router();

const createOrderSchema = z
  .object({
    cargoName: z.string({ required_error: '货名不能为空' }).trim().min(1, '货名不能为空').max(100, '货名不能超过 100 字'),
    cargoWeight: z.coerce
      .number({ invalid_type_error: '货物重量必须为数字', required_error: '货物重量不能为空' })
      .positive('货物重量必须大于 0'),
    containerType: z.enum(['20GP', '40GP', '40HQ', '45HQ'], {
      errorMap: () => ({ message: '箱型必须为 20GP/40GP/40HQ/45HQ' }),
    }),
    containerCount: z.coerce
      .number({ invalid_type_error: '箱量必须为数字', required_error: '箱量不能为空' })
      .int('箱量必须为整数')
      .min(1, '箱量至少为 1')
      .max(20, '箱量不能超过 20'),
    origin: z.string({ required_error: '起运地不能为空' }).trim().min(1, '起运地不能为空').max(100, '起运地不能超过 100 字'),
    destination: z
      .string({ required_error: '目的地不能为空' })
      .trim()
      .min(1, '目的地不能为空')
      .max(100, '目的地不能超过 100 字'),
    requiredPickupDate: z
      .string({ required_error: '提货日期不能为空' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, '提货日期格式应为 YYYY-MM-DD'),
    remark: z.string().max(255, '备注不能超过 255 字').optional().nullable(),
  })
  .refine((value) => value.requiredPickupDate >= todayDateString(), {
    message: '提货日期不能早于今天',
    path: ['requiredPickupDate'],
  });

const listQuerySchema = z.object({
  status: z
    .enum(['CREATED', 'DISPATCHED', 'IN_TRANSIT', 'ARRIVED', 'SIGNED', 'BILLED'], {
      errorMap: () => ({ message: '订单状态不合法' }),
    })
    .optional(),
  keyword: z.string().trim().max(100, '关键字过长').optional(),
});

const dispatchSchema = z.object({
  roadCarrierCode: z.string({ required_error: '请选择公路承运商' }).min(1, '请选择公路承运商'),
});

/** POST /api/orders（货主下单） */
router.post(
  '/',
  requireRole('SHIPPER'),
  asyncHandler(async (req, res) => {
    const input = validate(createOrderSchema, req.body);
    const orderId = await createOrder(input, req.user!.uid);
    const data = await getOrderDetail(orderId, req.user!);
    res.json(okBody(data));
  }),
);

/** GET /api/orders（按角色过滤） */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = validate(listQuerySchema, req.query);
    const data = await listOrders(req.user!, {
      status: query.status as OrderStatus | undefined,
      keyword: query.keyword,
    });
    res.json(okBody(data));
  }),
);

/** GET /api/orders/:id（聚合详情） */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const orderId = parseId(req.params.id);
    const data = await getOrderDetail(orderId, req.user!);
    res.json(okBody(data));
  }),
);

/** POST /api/orders/:id/dispatch（MTO 调度） */
router.post(
  '/:id/dispatch',
  requireRole('MTO'),
  asyncHandler(async (req, res) => {
    const orderId = parseId(req.params.id);
    const body = validate(dispatchSchema, req.body);
    const data = await dispatchOrder(orderId, body.roadCarrierCode);
    res.json(okBody(data));
  }),
);

/** POST /api/orders/:id/settle（结算出账） */
router.post(
  '/:id/settle',
  requireRole('SETTLEMENT'),
  asyncHandler(async (req, res) => {
    const orderId = parseId(req.params.id);
    const data = await settleOrder(orderId);
    res.json(okBody(data));
  }),
);

export const ordersRouter = router;
