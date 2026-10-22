import express from 'express';
import { okBody } from '../errors';
import { requireRole } from '../middleware/auth';
import { getBillDetail, listBills } from '../services/billService';
import { asyncHandler, parseId } from '../utils/http';

const router = express.Router();

/** GET /api/bills（应收/应付账单列表，v0 仅详情保持不变） */
router.get(
  '/',
  requireRole('SETTLEMENT', 'FINANCE', 'MTO', 'ADMIN'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listBills(req.query as Record<string, unknown>)));
  }),
);

/** GET /api/bills/:id（分段账单，v0 兼容 + Stage4 扩展） */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const billId = parseId(req.params.id);
    const data = await getBillDetail(billId);
    res.json(okBody(data));
  }),
);

export const billsRouter = router;
