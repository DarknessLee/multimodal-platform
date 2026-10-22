import express from 'express';
import { z } from 'zod';
import { okBody } from '../../errors';
import { requirePermission } from '../../middleware/rbac';
import { asyncHandler, parseId } from '../../utils/http';
import { validate } from '../../utils/validate';
import {
  acceptReport,
  createReport,
  getRegulatorDashboard,
  getReportDetail,
  listComplianceChecks,
  listReports,
  runComplianceChecks,
  submitReport,
} from './service';

const router = express.Router();

/** GET /api/regulator/reports */
router.get(
  '/reports',
  requirePermission('menu:regulator'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listReports(req.query as Record<string, unknown>)));
  }),
);

const createSchema = z.object({
  reportType: z.enum(['OPERATION_MONTHLY', 'SAFETY', 'COMPLAINT', 'STATISTICS'], {
    errorMap: () => ({ message: '报送类型不合法' }),
  }),
  period: z.string({ required_error: '报送周期不能为空' }).regex(/^\d{4}-\d{2}$/, '报送周期格式应为 YYYY-MM'),
  regulatorName: z.string({ required_error: '监管机构不能为空' }).trim().min(1, '监管机构不能为空').max(100),
});

/** POST /api/regulator/reports */
router.post(
  '/reports',
  requirePermission('regulator:report-create'),
  asyncHandler(async (req, res) => {
    const input = validate(createSchema, req.body);
    res.json(okBody(await createReport(input, req.user!, req.ip ?? null)));
  }),
);

/** GET /api/regulator/reports/:id */
router.get(
  '/reports/:id',
  requirePermission('menu:regulator'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await getReportDetail(parseId(req.params.id))));
  }),
);

/** POST /api/regulator/reports/:id/submit */
router.post(
  '/reports/:id/submit',
  requirePermission('regulator:report-submit'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await submitReport(parseId(req.params.id), req.user!, req.ip ?? null)));
  }),
);

const acceptSchema = z.object({
  accepted: z.boolean({ required_error: '受理结果不能为空' }),
  comment: z.string().trim().max(255).optional(),
});

/** POST /api/regulator/reports/:id/accept */
router.post(
  '/reports/:id/accept',
  requirePermission('regulator:report-accept'),
  asyncHandler(async (req, res) => {
    const body = validate(acceptSchema, req.body);
    res.json(
      okBody(
        await acceptReport(
          parseId(req.params.id),
          { accepted: body.accepted, comment: body.comment },
          req.user!,
          req.ip ?? null,
        ),
      ),
    );
  }),
);

/** GET /api/regulator/compliance-checks */
router.get(
  '/compliance-checks',
  requirePermission('menu:regulator'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listComplianceChecks(req.query as Record<string, unknown>)));
  }),
);

/** POST /api/regulator/compliance-checks/run */
router.post(
  '/compliance-checks/run',
  requirePermission('regulator:check-run'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await runComplianceChecks(req.user!, req.ip ?? null)));
  }),
);

/** GET /api/regulator/dashboard */
router.get(
  '/dashboard',
  requirePermission('menu:regulator'),
  asyncHandler(async (_req, res) => {
    res.json(okBody(await getRegulatorDashboard()));
  }),
);

export const regulatorRouter = router;
