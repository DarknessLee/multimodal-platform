import express from 'express';
import { okBody } from '../../errors';
import { requirePermission } from '../../middleware/rbac';
import { asyncHandler } from '../../utils/http';
import { listNotarizeRecords, verifyByTxId } from './service';

const router = express.Router();

/** GET /api/notarize/records?bizType=&bizId=&page= */
router.get(
  '/records',
  requirePermission('menu:waybills'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listNotarizeRecords(req.query as Record<string, unknown>)));
  }),
);

/** GET /api/notarize/verify/:txId */
router.get(
  '/verify/:txId',
  requirePermission('menu:waybills'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await verifyByTxId(String(req.params.txId))));
  }),
);

export const notarizeRouter = router;
