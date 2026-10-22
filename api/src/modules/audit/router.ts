import express from 'express';
import { okBody } from '../../errors';
import { requirePermission } from '../../middleware/rbac';
import { asyncHandler } from '../../utils/http';
import { listAuditLogs } from './service';

const router = express.Router();

/** GET /api/audit/logs（ADMIN/MTO） */
router.get(
  '/logs',
  requirePermission('menu:audit'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listAuditLogs(req.query as Record<string, unknown>)));
  }),
);

export const auditRouter = router;
