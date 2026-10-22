import express from 'express';
import { okBody } from '../../errors';
import { requireRole } from '../../middleware/auth';
import { asyncHandler, parseId } from '../../utils/http';
import { bookSeaTask, confirmSeaBooking, listSeaTasks } from './service';

const router = express.Router();
const seaRoles = requireRole('SEA_CARRIER', 'MTO', 'ADMIN');

/** GET /api/sea/tasks */
router.get(
  '/tasks',
  seaRoles,
  asyncHandler(async (req, res) => {
    res.json(okBody(await listSeaTasks(req.user!)));
  }),
);

/** POST /api/sea/tasks/:waybillId/book */
router.post(
  '/tasks/:waybillId/book',
  seaRoles,
  asyncHandler(async (req, res) => {
    res.json(okBody(await bookSeaTask(parseId(req.params.waybillId), req.user!, req.ip ?? null)));
  }),
);

/** POST /api/sea/bookings/:messageId/confirm */
router.post(
  '/bookings/:messageId/confirm',
  seaRoles,
  asyncHandler(async (req, res) => {
    res.json(
      okBody(await confirmSeaBooking(parseId(req.params.messageId), req.user!, req.ip ?? null)),
    );
  }),
);

export const seaRouter = router;
