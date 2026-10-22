import express from 'express';
import { okBody } from '../errors';
import { getBillDetail } from '../services/billService';
import { asyncHandler, parseId } from '../utils/http';

const router = express.Router();

/** GET /api/bills/:id（分段账单） */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const billId = parseId(req.params.id);
    const data = await getBillDetail(billId);
    res.json(okBody(data));
  }),
);

export const billsRouter = router;
