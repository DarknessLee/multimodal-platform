import express from 'express';
import { z } from 'zod';
import { okBody } from '../../errors';
import { requirePermission } from '../../middleware/rbac';
import { asyncHandler, parseId } from '../../utils/http';
import { validate } from '../../utils/validate';
import { confirmPlan, generatePlans, getDispatchBoard, getPlanDetail, listPlans } from './service';

const router = express.Router();

const generateSchema = z.object({
  orderId: z.coerce.number({ invalid_type_error: '订单 id 不能为空' }).int().positive('订单 id 不合法'),
});

/** POST /api/dispatch/plans/generate（生成 COST/TIME/BALANCED 三方案） */
router.post(
  '/plans/generate',
  requirePermission('dispatch:generate'),
  asyncHandler(async (req, res) => {
    const body = validate(generateSchema, req.body);
    res.json(okBody(await generatePlans(body.orderId, req.user!, req.ip ?? null)));
  }),
);

/** GET /api/dispatch/plans */
router.get(
  '/plans',
  requirePermission('menu:dispatch'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listPlans(req.query as Record<string, unknown>)));
  }),
);

/** GET /api/dispatch/plans/:id */
router.get(
  '/plans/:id',
  requirePermission('menu:dispatch'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await getPlanDetail(parseId(req.params.id))));
  }),
);

/** POST /api/dispatch/plans/:id/confirm（确认方案并按方案签发运单/分段） */
router.post(
  '/plans/:id/confirm',
  requirePermission('dispatch:confirm'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await confirmPlan(parseId(req.params.id), req.user!, req.ip ?? null)));
  }),
);

/** GET /api/dispatch/board（调度看板） */
router.get(
  '/board',
  requirePermission('menu:dispatch'),
  asyncHandler(async (_req, res) => {
    res.json(okBody(await getDispatchBoard()));
  }),
);

export const dispatchRouter = router;
