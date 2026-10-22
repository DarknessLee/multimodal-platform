import express from 'express';
import { okBody } from '../../errors';
import { requirePermission } from '../../middleware/rbac';
import { asyncHandler, parseId } from '../../utils/http';
import { validate } from '../../utils/validate';
import { z } from 'zod';
import { listMessages, listSystems, retryMessage } from './service';

const router = express.Router();

/** GET /api/integration/systems */
router.get(
  '/systems',
  requirePermission('menu:integration'),
  asyncHandler(async (_req, res) => {
    res.json(okBody(await listSystems()));
  }),
);

/** GET /api/integration/messages */
router.get(
  '/messages',
  requirePermission('menu:integration'),
  asyncHandler(async (req, res) => {
    const data = await listMessages(req.query as Record<string, unknown>);
    res.json(okBody(data));
  }),
);

const retrySchema = z.object({}).passthrough();

/** POST /api/integration/messages/:id/retry */
router.post(
  '/messages/:id/retry',
  requirePermission('integration:retry'),
  asyncHandler(async (req, res) => {
    validate(retrySchema, req.body ?? {});
    const id = parseId(req.params.id);
    const data = await retryMessage(id, req.user!, req.ip ?? null);
    res.json(okBody(data));
  }),
);

export const integrationRouter = router;
