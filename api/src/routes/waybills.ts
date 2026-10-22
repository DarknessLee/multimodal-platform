import express from 'express';
import { z } from 'zod';
import { okBody } from '../errors';
import { requirePermission } from '../middleware/rbac';
import { getWaybillTrack, signWaybill } from '../services/waybillService';
import {
  getWaybillDetail,
  listWaybillDocuments,
  listWaybillEvents,
  listWaybills,
} from '../modules/waybill/service';
import { asyncHandler, parseId } from '../utils/http';
import { validate } from '../utils/validate';

const router = express.Router();

const signSchema = z.object({
  signerName: z.string({ required_error: '签收人不能为空' }).trim().min(1, '签收人不能为空').max(50, '签收人不能超过 50 字'),
});

/** GET /api/waybills（一单制运单列表，主运单/分段运单） */
router.get(
  '/',
  requirePermission('menu:waybills'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listWaybills(req.user!, req.query as Record<string, unknown>)));
  }),
);

/** GET /api/waybills/:id/events（交接事件链 + 哈希链字段） */
router.get(
  '/:id/events',
  requirePermission('menu:waybills'),
  asyncHandler(async (req, res) => {
    const waybillId = parseId(req.params.id);
    res.json(okBody(await listWaybillEvents(waybillId, req.query as Record<string, unknown>)));
  }),
);

/** GET /api/waybills/:id/documents（主运单 + 分段运单关联单证） */
router.get(
  '/:id/documents',
  requirePermission('menu:waybills'),
  asyncHandler(async (req, res) => {
    const waybillId = parseId(req.params.id);
    res.json(okBody(await listWaybillDocuments(waybillId)));
  }),
);

/** GET /api/waybills/:id/track（轨迹，v0 兼容） */
router.get(
  '/:id/track',
  asyncHandler(async (req, res) => {
    const waybillId = parseId(req.params.id);
    const data = await getWaybillTrack(waybillId);
    res.json(okBody(data));
  }),
);

/** GET /api/waybills/:id（一单制聚合详情） */
router.get(
  '/:id',
  requirePermission('menu:waybills'),
  asyncHandler(async (req, res) => {
    const waybillId = parseId(req.params.id);
    res.json(okBody(await getWaybillDetail(waybillId)));
  }),
);

/** POST /api/waybills/:id/sign（货主签收，v0 兼容） */
router.post(
  '/:id/sign',
  requirePermission('waybill:sign'),
  asyncHandler(async (req, res) => {
    const waybillId = parseId(req.params.id);
    const body = validate(signSchema, req.body);
    const data = await signWaybill(waybillId, body.signerName, req.user!, req.ip ?? null);
    res.json(okBody(data));
  }),
);

export const waybillsRouter = router;
