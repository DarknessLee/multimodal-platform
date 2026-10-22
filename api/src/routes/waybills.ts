import express from 'express';
import { z } from 'zod';
import { okBody } from '../errors';
import { getWaybillTrack, signWaybill } from '../services/waybillService';
import { asyncHandler, parseId } from '../utils/http';
import { validate } from '../utils/validate';

const router = express.Router();

const signSchema = z.object({
  signerName: z.string({ required_error: '签收人不能为空' }).trim().min(1, '签收人不能为空').max(50, '签收人不能超过 50 字'),
});

/** GET /api/waybills/:id/track（轨迹） */
router.get(
  '/:id/track',
  asyncHandler(async (req, res) => {
    const waybillId = parseId(req.params.id);
    const data = await getWaybillTrack(waybillId);
    res.json(okBody(data));
  }),
);

/** POST /api/waybills/:id/sign（货主签收） */
router.post(
  '/:id/sign',
  asyncHandler(async (req, res) => {
    const waybillId = parseId(req.params.id);
    const body = validate(signSchema, req.body);
    const data = await signWaybill(waybillId, body.signerName, req.user!);
    res.json(okBody(data));
  }),
);

export const waybillsRouter = router;
