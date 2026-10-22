import express from 'express';
import { z } from 'zod';
import { okBody } from '../errors';
import { requirePermission } from '../middleware/rbac';
import { updateSegmentStatus } from '../services/segmentService';
import type { SegmentAction } from '../types';
import { asyncHandler, parseId } from '../utils/http';
import { validate } from '../utils/validate';

const router = express.Router();

const segmentActionSchema = z.object({
  action: z.enum(['ACCEPT', 'DEPART', 'ARRIVE', 'GATE_IN'], {
    errorMap: () => ({ message: '不支持的分段动作' }),
  }),
  conditionText: z.string().trim().max(100, '箱况说明不能超过 100 字').optional().nullable(),
});

/** POST /api/segments/:id/status（承运人/港站节点上报推进） */
router.post(
  '/:id/status',
  requirePermission('segment:status'),
  asyncHandler(async (req, res) => {
    const segmentId = parseId(req.params.id);
    const body = validate(segmentActionSchema, req.body);
    const data = await updateSegmentStatus(
      segmentId,
      body.action as SegmentAction,
      body.conditionText ?? undefined,
      req.user!,
      req.ip ?? null,
    );
    res.json(okBody(data));
  }),
);

export const segmentsRouter = router;
