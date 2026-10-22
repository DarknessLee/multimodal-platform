import express from 'express';
import { okBody } from '../../errors';
import { asyncHandler, parseId } from '../../utils/http';
import { listNotifications, markNotificationRead } from './service';

const router = express.Router();

/** GET /api/notifications?unread=1 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(okBody(await listNotifications(req.user!, req.query as Record<string, unknown>)));
  }),
);

/** POST /api/notifications/:id/read */
router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    res.json(okBody(await markNotificationRead(parseId(req.params.id), req.user!)));
  }),
);

export const notificationsRouter = router;
