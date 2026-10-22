import express from 'express';
import { okBody } from '../../errors';
import { requireRole } from '../../middleware/auth';
import { asyncHandler, parseId } from '../../utils/http';
import { applyRailDemand, confirmRailDemand, listRailTasks } from './service';

const router = express.Router();
const railRoles = requireRole('RAIL_CARRIER', 'MTO', 'ADMIN');

/** GET /api/rail/tasks */
router.get(
  '/tasks',
  railRoles,
  asyncHandler(async (req, res) => {
    res.json(okBody(await listRailTasks(req.user!)));
  }),
);

/** POST /api/rail/tasks/:waybillId/apply */
router.post(
  '/tasks/:waybillId/apply',
  railRoles,
  asyncHandler(async (req, res) => {
    res.json(
      okBody(await applyRailDemand(parseId(req.params.waybillId), req.user!, req.ip ?? null)),
    );
  }),
);

/** POST /api/rail/demands/:messageId/confirm */
router.post(
  '/demands/:messageId/confirm',
  railRoles,
  asyncHandler(async (req, res) => {
    res.json(
      okBody(await confirmRailDemand(parseId(req.params.messageId), req.user!, req.ip ?? null)),
    );
  }),
);

export const railRouter = router;
