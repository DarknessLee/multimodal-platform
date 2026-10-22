import express from 'express';
import { z } from 'zod';
import { okBody } from '../../errors';
import { requirePermission } from '../../middleware/rbac';
import { asyncHandler, parseId } from '../../utils/http';
import { validate } from '../../utils/validate';
import {
  addContainerMovement,
  getContainerDetail,
  listContainers,
  listDepotStorage,
  releaseContainer,
  repairContainer,
  returnContainer,
} from './service';

const router = express.Router();
const movementTypeEnum = z.enum(
  ['PICKUP', 'GATE_IN', 'LOAD', 'DEPART', 'ARRIVE', 'DISCHARGE', 'GATE_OUT'],
  { errorMap: () => ({ message: '不支持的箱动态类型' }) },
);

/** GET /api/containers */
router.get(
  '/',
  requirePermission('menu:containers'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listContainers(req.user!, req.query as Record<string, unknown>)));
  }),
);

/** GET /api/containers/:id */
router.get(
  '/:id',
  requirePermission('menu:containers'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await getContainerDetail(parseId(req.params.id))));
  }),
);

const releaseSchema = z.object({
  waybillId: z.coerce.number().int().positive().optional().nullable(),
  nodeId: z.coerce.number().int().positive().optional().nullable(),
});

/** POST /api/containers/:id/release */
router.post(
  '/:id/release',
  requirePermission('container:release'),
  asyncHandler(async (req, res) => {
    const body = validate(releaseSchema, req.body ?? {});
    res.json(
      okBody(
        await releaseContainer(
          parseId(req.params.id),
          { waybillId: body.waybillId ?? null, nodeId: body.nodeId ?? null },
          req.user!,
          req.ip ?? null,
        ),
      ),
    );
  }),
);

const movementSchema = z.object({
  movementType: movementTypeEnum,
  nodeId: z.coerce.number().int().positive().optional().nullable(),
  conditionText: z.string().trim().max(120, '箱况说明不能超过 120 字').optional().nullable(),
  photoUrl: z.string().trim().max(255).optional().nullable(),
  remark: z.string().trim().max(255).optional().nullable(),
});

/** POST /api/containers/:id/movements */
router.post(
  '/:id/movements',
  requirePermission('container:movement'),
  asyncHandler(async (req, res) => {
    const body = validate(movementSchema, req.body);
    res.json(
      okBody(
        await addContainerMovement(
          parseId(req.params.id),
          {
            movementType: body.movementType,
            nodeId: body.nodeId ?? null,
            conditionText: body.conditionText ?? null,
            photoUrl: body.photoUrl ?? null,
            remark: body.remark ?? null,
          },
          req.user!,
          req.ip ?? null,
        ),
      ),
    );
  }),
);

const returnSchema = z.object({
  nodeId: z.coerce.number({ invalid_type_error: '还箱节点不能为空' }).int().positive('还箱节点不能为空'),
  conditionText: z.string().trim().max(120, '箱况说明不能超过 120 字').optional().nullable(),
});

/** POST /api/containers/:id/return */
router.post(
  '/:id/return',
  requirePermission('container:return'),
  asyncHandler(async (req, res) => {
    const body = validate(returnSchema, req.body);
    res.json(
      okBody(
        await returnContainer(
          parseId(req.params.id),
          { nodeId: body.nodeId, conditionText: body.conditionText ?? null },
          req.user!,
          req.ip ?? null,
        ),
      ),
    );
  }),
);

const repairSchema = z.object({
  nodeId: z.coerce.number().int().positive().optional().nullable(),
  fee: z.coerce.number({ invalid_type_error: '维修费用不能为空' }).min(0, '维修费用不能为负数'),
  remark: z.string().trim().max(255).optional().nullable(),
});

/** POST /api/containers/:id/repair */
router.post(
  '/:id/repair',
  requirePermission('container:movement'),
  asyncHandler(async (req, res) => {
    const body = validate(repairSchema, req.body);
    res.json(
      okBody(
        await repairContainer(
          parseId(req.params.id),
          { nodeId: body.nodeId ?? null, fee: body.fee, remark: body.remark ?? null },
          req.user!,
          req.ip ?? null,
        ),
      ),
    );
  }),
);

export const containersRouter = router;

/** GET /api/depots/storage */
export const depotsRouter = express.Router();
depotsRouter.get(
  '/storage',
  requirePermission('menu:containers'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listDepotStorage(req.query as Record<string, unknown>)));
  }),
);
