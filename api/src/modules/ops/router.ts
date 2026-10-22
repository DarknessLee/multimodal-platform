import express from 'express';
import { z } from 'zod';
import { okBody } from '../../errors';
import { requirePermission } from '../../middleware/rbac';
import { asyncHandler, parseId } from '../../utils/http';
import { validate } from '../../utils/validate';
import {
  createDict,
  fullChainCheck,
  getOpsDashboard,
  getOpsHealth,
  listConfigs,
  listDicts,
  listJobs,
  runJob,
  updateConfig,
  updateDict,
} from './service';

const router = express.Router();

/** GET /api/ops/configs */
router.get(
  '/configs',
  requirePermission('menu:ops'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listConfigs(req.query as Record<string, unknown>)));
  }),
);

const configSchema = z.object({
  configValue: z.string({ required_error: '配置值不能为空' }).max(2000, '配置值过长'),
});

/** PUT /api/ops/configs/:key */
router.put(
  '/configs/:key',
  requirePermission('ops:config-update'),
  asyncHandler(async (req, res) => {
    const body = validate(configSchema, req.body);
    res.json(okBody(await updateConfig(String(req.params.key), body.configValue, req.user!, req.ip ?? null)));
  }),
);

/** GET /api/ops/dicts */
router.get(
  '/dicts',
  requirePermission('menu:ops'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listDicts(req.query as Record<string, unknown>)));
  }),
);

const createDictSchema = z.object({
  dictType: z.string({ required_error: '字典类型不能为空' }).trim().min(1).max(30),
  dictKey: z.string({ required_error: '字典键不能为空' }).trim().min(1).max(50),
  dictValue: z.string({ required_error: '字典值不能为空' }).trim().min(1).max(100),
  sort: z.coerce.number().int().min(0).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  remark: z.string().trim().max(200).optional(),
});

/** POST /api/ops/dicts */
router.post(
  '/dicts',
  requirePermission('ops:dict-manage'),
  asyncHandler(async (req, res) => {
    const body = validate(createDictSchema, req.body);
    res.json(okBody(await createDict(body, req.user!, req.ip ?? null)));
  }),
);

const updateDictSchema = z.object({
  dictKey: z.string().trim().min(1).max(50).optional(),
  dictValue: z.string().trim().min(1).max(100).optional(),
  sort: z.coerce.number().int().min(0).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  remark: z.string().trim().max(200).optional().nullable(),
});

/** PUT /api/ops/dicts/:id */
router.put(
  '/dicts/:id',
  requirePermission('ops:dict-manage'),
  asyncHandler(async (req, res) => {
    const body = validate(updateDictSchema, req.body);
    res.json(
      okBody(
        await updateDict(
          parseId(req.params.id),
          { ...body, remark: body.remark ?? undefined },
          req.user!,
          req.ip ?? null,
        ),
      ),
    );
  }),
);

/** GET /api/ops/jobs */
router.get(
  '/jobs',
  requirePermission('menu:ops'),
  asyncHandler(async (_req, res) => {
    res.json(okBody(await listJobs()));
  }),
);

/** POST /api/ops/jobs/:code/run */
router.post(
  '/jobs/:code/run',
  requirePermission('ops:job-run'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await runJob(String(req.params.code), req.user!, req.ip ?? null)));
  }),
);

/** GET /api/ops/health */
router.get(
  '/health',
  requirePermission('menu:ops'),
  asyncHandler(async (_req, res) => {
    res.json(okBody(await getOpsHealth()));
  }),
);

/** GET /api/ops/dashboard */
router.get(
  '/dashboard',
  requirePermission('menu:ops'),
  asyncHandler(async (_req, res) => {
    res.json(okBody(await getOpsDashboard()));
  }),
);

/** GET /api/ops/full-chain-check（ADMIN + MTO 可查看） */
router.get(
  '/full-chain-check',
  requirePermission('ops:full-chain-check'),
  asyncHandler(async (_req, res) => {
    res.json(okBody(await fullChainCheck()));
  }),
);

export const opsRouter = router;
