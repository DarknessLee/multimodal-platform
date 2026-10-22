import express from 'express';
import { z } from 'zod';
import { okBody } from '../../errors';
import { requirePermission } from '../../middleware/rbac';
import { asyncHandler, parseId } from '../../utils/http';
import { validate } from '../../utils/validate';
import { ackAlert, closeAlert, handleException, listAlerts, listExceptions } from './service';

export const alertsRouter = express.Router();

/** GET /api/alerts */
alertsRouter.get(
  '/',
  requirePermission('menu:alerts'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listAlerts(req.query as Record<string, unknown>)));
  }),
);

/** POST /api/alerts/:id/ack */
alertsRouter.post(
  '/:id/ack',
  requirePermission('alert:ack'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await ackAlert(parseId(req.params.id), req.user!, req.ip ?? null)));
  }),
);

/** POST /api/alerts/:id/close */
alertsRouter.post(
  '/:id/close',
  requirePermission('alert:close'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await closeAlert(parseId(req.params.id), req.user!, req.ip ?? null)));
  }),
);

export const exceptionsRouter = express.Router();

/** GET /api/exceptions */
exceptionsRouter.get(
  '/',
  requirePermission('menu:alerts'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listExceptions(req.query as Record<string, unknown>)));
  }),
);

const handleSchema = z.object({
  resolution: z.string({ required_error: '处置说明不能为空' }).trim().min(1, '处置说明不能为空').max(500),
  status: z.enum(['PROCESSING', 'RESOLVED', 'CLOSED']).optional(),
});

/** POST /api/exceptions/:id/handle */
exceptionsRouter.post(
  '/:id/handle',
  requirePermission('exception:handle'),
  asyncHandler(async (req, res) => {
    const body = validate(handleSchema, req.body);
    res.json(
      okBody(
        await handleException(
          parseId(req.params.id),
          { resolution: body.resolution, status: body.status },
          req.user!,
          req.ip ?? null,
        ),
      ),
    );
  }),
);
