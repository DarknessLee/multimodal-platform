import express from 'express';
import { okBody } from '../../errors';
import { requirePermission } from '../../middleware/rbac';
import { asyncHandler } from '../../utils/http';
import {
  getAnalyticsByCustomer,
  getAnalyticsByMode,
  getAnalyticsOverview,
  getAnalyticsTrend,
  getFinanceDashboard,
} from './service';

const router = express.Router();

/** GET /api/analytics/overview?days=30 */
router.get(
  '/overview',
  requirePermission('menu:analytics'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await getAnalyticsOverview(req.query.days)));
  }),
);

/** GET /api/analytics/trend?days=14 */
router.get(
  '/trend',
  requirePermission('menu:analytics'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await getAnalyticsTrend(req.query.days)));
  }),
);

/** GET /api/analytics/by-customer */
router.get(
  '/by-customer',
  requirePermission('menu:analytics'),
  asyncHandler(async (_req, res) => {
    res.json(okBody(await getAnalyticsByCustomer()));
  }),
);

/** GET /api/analytics/by-mode */
router.get(
  '/by-mode',
  requirePermission('menu:analytics'),
  asyncHandler(async (_req, res) => {
    res.json(okBody(await getAnalyticsByMode()));
  }),
);

export const analyticsRouter = router;

export const financeRouter = express.Router();

/** GET /api/finance/dashboard */
financeRouter.get(
  '/dashboard',
  requirePermission('menu:analytics'),
  asyncHandler(async (_req, res) => {
    res.json(okBody(await getFinanceDashboard()));
  }),
);
