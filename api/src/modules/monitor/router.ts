import express from 'express';
import { okBody } from '../../errors';
import { requirePermission } from '../../middleware/rbac';
import { asyncHandler, parseId } from '../../utils/http';
import { getMonitorOverview, getWaybillLive, clampDays, computeTrend } from './service';

const router = express.Router();

/** GET /api/monitor/overview */
router.get(
  '/overview',
  requirePermission('menu:monitor'),
  asyncHandler(async (_req, res) => {
    res.json(okBody(await getMonitorOverview()));
  }),
);

/** GET /api/monitor/waybills/:id/live */
router.get(
  '/waybills/:id/live',
  requirePermission('menu:monitor'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await getWaybillLive(parseId(req.params.id))));
  }),
);

/** GET /api/monitor/trend?days=14 */
router.get(
  '/trend',
  requirePermission('menu:monitor'),
  asyncHandler(async (req, res) => {
    const days = clampDays(req.query.days);
    res.json(okBody(await computeTrend(days)));
  }),
);

export const monitorRouter = router;
