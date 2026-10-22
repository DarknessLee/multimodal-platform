import express from 'express';
import { okBody } from '../../errors';
import { asyncHandler } from '../../utils/http';
import { getSummary, getTrend } from './service';

const router = express.Router();

/** GET /api/dashboard/summary */
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    res.json(okBody(await getSummary(req.user!)));
  }),
);

/** GET /api/dashboard/trend?days=14 */
router.get(
  '/trend',
  asyncHandler(async (req, res) => {
    res.json(okBody(await getTrend(req.user!, req.query.days)));
  }),
);

export const dashboardRouter = router;
