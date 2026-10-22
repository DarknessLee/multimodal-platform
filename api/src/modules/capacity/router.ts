import express from 'express';
import { okBody } from '../../errors';
import { requirePermission } from '../../middleware/rbac';
import { asyncHandler } from '../../utils/http';
import { getCapacitySummary, listTrains, listVehicles, listVessels } from './service';

const router = express.Router();

/** GET /api/capacity/summary */
router.get(
  '/summary',
  requirePermission('menu:capacity'),
  asyncHandler(async (_req, res) => {
    res.json(okBody(await getCapacitySummary()));
  }),
);

/** GET /api/capacity/vehicles */
router.get(
  '/vehicles',
  requirePermission('menu:capacity'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listVehicles(req.query as Record<string, unknown>)));
  }),
);

/** GET /api/capacity/trains */
router.get(
  '/trains',
  requirePermission('menu:capacity'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listTrains(req.query as Record<string, unknown>)));
  }),
);

/** GET /api/capacity/vessels */
router.get(
  '/vessels',
  requirePermission('menu:capacity'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listVessels(req.query as Record<string, unknown>)));
  }),
);

export const capacityRouter = router;
