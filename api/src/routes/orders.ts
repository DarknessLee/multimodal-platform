import express from 'express';
import { z } from 'zod';
import { ApiError, okBody } from '../errors';
import { requirePermission } from '../middleware/rbac';
import { settleOrder } from '../services/billService';
import { dispatchOrder } from '../services/dispatchService';
import { getOrderDetail, listOrders } from '../services/orderQueryService';
import { cancelOrder, createQuickOrder, type CreateQuickOrderInput } from '../modules/orderV1/service';
import { acceptQuote } from '../modules/quote/service';
import type { OrderSource, OrderStatus, OrderType, Priority } from '../types';
import { todayDateString } from '../utils/datetime';
import { asyncHandler, parseId } from '../utils/http';
import { validate } from '../utils/validate';

const router = express.Router();

/** 前端清空筛选/可选字段时可能传 '' / null，统一按“未传”处理，避免 40001 误报 */
const emptyAsUndefined = (value: unknown): unknown => (value === '' || value === null ? undefined : value);

const cargoLineSchema = z.object({
  goodsCode: z.preprocess(emptyAsUndefined, z.string().trim().max(20).optional()),
  goodsName: z.preprocess(emptyAsUndefined, z.string().trim().min(1, '货物名称不能为空').max(100).optional()),
  quantity: z.preprocess(emptyAsUndefined, z.coerce.number().positive('货物数量必须大于 0').optional()),
  unit: z.preprocess(emptyAsUndefined, z.string().trim().max(20).optional()),
  weightT: z.preprocess(emptyAsUndefined, z.coerce.number().min(0, '货物重量不能为负数').optional()),
  volumeCbm: z.preprocess(emptyAsUndefined, z.coerce.number().min(0).optional()),
  containerType: z.preprocess(
    emptyAsUndefined,
    z.enum(['20GP', '40GP', '40HQ', '45HQ', '40RF']).optional(),
  ),
  containerCount: z.preprocess(
    emptyAsUndefined,
    z.coerce.number().int().min(1, '箱量至少为 1').max(100).optional(),
  ),
  dangerousFlag: z.preprocess(emptyAsUndefined, z.union([z.boolean(), z.coerce.number()]).optional()),
  packaging: z.preprocess(emptyAsUndefined, z.string().trim().max(50).optional()),
  remark: z.preprocess(emptyAsUndefined, z.string().trim().max(255).optional()),
});

const createOrderSchema = z.object({
  // 报价转单通道
  quoteId: z.preprocess(emptyAsUndefined, z.coerce.number().int().positive().optional()),
  contractId: z.preprocess(emptyAsUndefined, z.coerce.number().int().positive().optional()),
  // 快速下单通道（v0 字段 + v1 可选）
  cargoName: z.preprocess(emptyAsUndefined, z.string().trim().max(100).optional()),
  cargoWeight: z.preprocess(emptyAsUndefined, z.coerce.number().optional()),
  containerType: z.preprocess(
    emptyAsUndefined,
    z.enum(['20GP', '40GP', '40HQ', '45HQ', '40RF']).optional(),
  ),
  containerCount: z.preprocess(emptyAsUndefined, z.coerce.number().int().optional()),
  origin: z.preprocess(emptyAsUndefined, z.string().trim().max(100).optional()),
  destination: z.preprocess(emptyAsUndefined, z.string().trim().max(100).optional()),
  requiredPickupDate: z.preprocess(
    emptyAsUndefined,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '提货日期格式应为 YYYY-MM-DD').optional(),
  ),
  remark: z.preprocess(emptyAsUndefined, z.string().trim().max(255).optional()),
  customerId: z.preprocess(emptyAsUndefined, z.coerce.number().int().positive().optional()),
  consigneeCustomerId: z.preprocess(emptyAsUndefined, z.coerce.number().int().positive().optional()),
  notifyCustomerId: z.preprocess(emptyAsUndefined, z.coerce.number().int().positive().optional()),
  routeTemplateId: z.preprocess(emptyAsUndefined, z.coerce.number().int().positive().optional()),
  orderType: z.preprocess(emptyAsUndefined, z.enum(['ROAD_RAIL', 'RAIL_SEA', 'ROAD_RAIL_SEA']).optional()),
  priority: z.preprocess(emptyAsUndefined, z.enum(['NORMAL', 'URGENT']).optional()),
  cargoLines: z.array(cargoLineSchema).optional(),
});

const listQuerySchema = z.object({
  status: z.preprocess(
    emptyAsUndefined,
    z
      .enum(['CREATED', 'CONTRACTED', 'CONFIRMED', 'DISPATCHED', 'IN_TRANSIT', 'ARRIVED', 'SIGNED', 'BILLED', 'CANCELLED'], {
        errorMap: () => ({ message: '订单状态不合法' }),
      })
      .optional(),
  ),
  keyword: z.preprocess(emptyAsUndefined, z.string().trim().max(100, '关键字过长').optional()),
  orderType: z.preprocess(emptyAsUndefined, z.enum(['ROAD_RAIL', 'RAIL_SEA', 'ROAD_RAIL_SEA']).optional()),
  source: z.preprocess(emptyAsUndefined, z.enum(['QUICK', 'QUOTE']).optional()),
  customerId: z.preprocess(emptyAsUndefined, z.coerce.number().int().positive().optional()),
});

const dispatchSchema = z.object({
  roadCarrierCode: z.string({ required_error: '请选择公路承运商' }).min(1, '请选择公路承运商'),
});

function assertQuickOrderBody(body: z.infer<typeof createOrderSchema>): void {
  const hasCargoLines = Array.isArray(body.cargoLines) && body.cargoLines.length > 0;
  const missing: string[] = [];
  if (!body.origin) missing.push('起运地');
  if (!body.destination) missing.push('目的地');
  if (!body.requiredPickupDate) missing.push('提货日期');
  if (!hasCargoLines) {
    if (!body.cargoName) missing.push('货名');
    if (body.cargoWeight === undefined || Number(body.cargoWeight) <= 0) missing.push('货物重量');
    if (!body.containerType) missing.push('箱型');
    if (!body.containerCount || body.containerCount < 1) missing.push('箱量');
  }
  if (missing.length > 0) {
    throw new ApiError(40001, `快速下单缺少必填字段：${missing.join('、')}`);
  }
  if (body.requiredPickupDate && body.requiredPickupDate < todayDateString()) {
    throw new ApiError(40001, '提货日期不能早于今天');
  }
  if (!hasCargoLines && body.containerCount && (body.containerCount < 1 || body.containerCount > 20)) {
    throw new ApiError(40001, '箱量必须为 1~20 的整数');
  }
}

/**
 * POST /api/orders（双通道）
 * 1) { quoteId, contractId? } 报价转单；2) v0 快速下单字段（可选 cargoLines 多货物行）
 */
router.post(
  '/',
  requirePermission('order:create'),
  asyncHandler(async (req, res) => {
    const body = validate(createOrderSchema, req.body ?? {});
    if (body.quoteId) {
      const created = await acceptQuote(
        body.quoteId,
        { contractId: body.contractId ?? null },
        req.user!,
        req.ip ?? null,
      );
      res.json(okBody(await getOrderDetail(created.orderId, req.user!)));
      return;
    }
    assertQuickOrderBody(body);
    const orderId = await createQuickOrder(body as CreateQuickOrderInput, req.user!, req.ip ?? null);
    res.json(okBody(await getOrderDetail(orderId, req.user!)));
  }),
);

/** GET /api/orders（按角色过滤 + v1 筛选，保持 v0 数组返回） */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = validate(listQuerySchema, req.query);
    const data = await listOrders(req.user!, {
      status: query.status as OrderStatus | undefined,
      keyword: query.keyword,
      orderType: query.orderType as OrderType | undefined,
      source: query.source as OrderSource | undefined,
      customerId: query.customerId,
    });
    res.json(okBody(data));
  }),
);

/** GET /api/orders/:id（聚合详情） */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const orderId = parseId(req.params.id);
    res.json(okBody(await getOrderDetail(orderId, req.user!)));
  }),
);

/** POST /api/orders/:id/cancel（SHIPPER/MTO/ADMIN，仅未调度） */
router.post(
  '/:id/cancel',
  requirePermission('order:cancel'),
  asyncHandler(async (req, res) => {
    const orderId = parseId(req.params.id);
    const target = await cancelOrder(orderId, req.user!, req.ip ?? null);
    res.json(okBody({ ...target, order: await getOrderDetail(orderId, req.user!) }));
  }),
);

/** POST /api/orders/:id/dispatch（MTO 调度，兼容 CREATED/CONTRACTED/CONFIRMED） */
router.post(
  '/:id/dispatch',
  requirePermission('order:dispatch'),
  asyncHandler(async (req, res) => {
    const orderId = parseId(req.params.id);
    const body = validate(dispatchSchema, req.body);
    const data = await dispatchOrder(orderId, body.roadCarrierCode, req.user!, req.ip ?? null);
    res.json(okBody(data));
  }),
);

/** POST /api/orders/:id/settle（结算出账） */
router.post(
  '/:id/settle',
  requirePermission('bill:settle'),
  asyncHandler(async (req, res) => {
    const orderId = parseId(req.params.id);
    const data = await settleOrder(orderId, req.user!, req.ip ?? null);
    res.json(okBody(data));
  }),
);

export const ordersRouter = router;
