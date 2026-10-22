import express from 'express';
import { z } from 'zod';
import { okBody } from '../../errors';
import { requirePermission } from '../../middleware/rbac';
import { asyncHandler, parseId } from '../../utils/http';
import { validate } from '../../utils/validate';
import {
  getAdapterHealth,
  getIntegrationStats,
  getMessageDetail,
  listAdapters,
  listMessages,
  listSystems,
  retryMessage,
  retryMessagesBatch,
  testAdapter,
} from './service';

const router = express.Router();

/** GET /api/integration/systems */
router.get(
  '/systems',
  requirePermission('menu:integration'),
  asyncHandler(async (_req, res) => {
    res.json(okBody(await listSystems()));
  }),
);

/** GET /api/integration/adapters（Stage 5） */
router.get(
  '/adapters',
  requirePermission('menu:integration'),
  asyncHandler(async (_req, res) => {
    res.json(okBody(await listAdapters()));
  }),
);

/** GET /api/integration/adapters/:id/health */
router.get(
  '/adapters/:id/health',
  requirePermission('menu:integration'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await getAdapterHealth(parseId(req.params.id))));
  }),
);

/** POST /api/integration/adapters/:id/test */
router.post(
  '/adapters/:id/test',
  requirePermission('integration:adapter-test'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await testAdapter(parseId(req.params.id), req.user!, req.ip ?? null)));
  }),
);

/** GET /api/integration/stats（Stage 5） */
router.get(
  '/stats',
  requirePermission('menu:integration'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await getIntegrationStats(req.query.days)));
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

const retryBatchSchema = z.object({
  ids: z
    .array(z.coerce.number({ invalid_type_error: '报文 id 必须为数字' }).int().positive('报文 id 不合法'))
    .min(1, '至少选择 1 条报文')
    .max(20, '单次最多重试 20 条报文'),
});

/** POST /api/integration/messages/retry-batch（Stage 5，≤20 条） */
router.post(
  '/messages/retry-batch',
  requirePermission('integration:retry-batch'),
  asyncHandler(async (req, res) => {
    const body = validate(retryBatchSchema, req.body);
    const ids = [...new Set(body.ids)];
    res.json(okBody(await retryMessagesBatch(ids, req.user!, req.ip ?? null)));
  }),
);

/** GET /api/integration/messages/:id（Stage 5 报文详情） */
router.get(
  '/messages/:id',
  requirePermission('menu:integration'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await getMessageDetail(parseId(req.params.id))));
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
