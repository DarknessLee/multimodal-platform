import express from 'express';
import { z } from 'zod';
import { okBody } from '../../errors';
import { requirePermission } from '../../middleware/rbac';
import {
  downloadDocumentFile,
  getDocumentDetail,
  listDocuments,
  rerunOcr,
  signDocument,
  uploadDocument,
} from './service';
import { asyncHandler, parseId } from '../../utils/http';
import { validate } from '../../utils/validate';

const router = express.Router();

const docTypeEnum = z.enum(['ORDER_CONFIRM', 'WAYBILL_MASTER', 'WAYBILL_SEGMENT', 'PACKING_LIST', 'POD', 'OTHER'], {
  errorMap: () => ({ message: '单证类型不合法' }),
});
const bizTypeEnum = z.enum(['ORDER', 'WAYBILL', 'BILL', 'CONTRACT'], {
  errorMap: () => ({ message: '业务类型不合法' }),
});

/** GET /api/documents */
router.get(
  '/',
  requirePermission('menu:documents'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listDocuments(req.query as Record<string, unknown>)));
  }),
);

const uploadSchema = z.object({
  docType: docTypeEnum,
  bizType: bizTypeEnum,
  bizId: z.coerce.number({ invalid_type_error: '业务 id 不能为空' }).int().positive('业务 id 不合法'),
  fileName: z.string({ required_error: '文件名不能为空' }).trim().min(1, '文件名不能为空').max(120),
  mimeType: z.string({ required_error: '文件类型不能为空' }).trim().min(1, '文件类型不能为空').max(60),
  contentBase64: z.string({ required_error: '文件内容不能为空' }).min(1, '文件内容不能为空'),
  waybillId: z.coerce.number().int().positive().optional().nullable(),
});

/** POST /api/documents（base64 上传；POD 自动 Mock OCR） */
router.post(
  '/',
  requirePermission('document:upload'),
  asyncHandler(async (req, res) => {
    const input = validate(uploadSchema, req.body);
    res.json(okBody(await uploadDocument(input, req.user!, req.ip ?? null)));
  }),
);

/** GET /api/documents/:id/download（文件流） */
router.get(
  '/:id/download',
  requirePermission('menu:documents'),
  asyncHandler(async (req, res) => {
    const file = await downloadDocumentFile(parseId(req.params.id));
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    res.send(file.buffer);
  }),
);

/** GET /api/documents/:id */
router.get(
  '/:id',
  requirePermission('menu:documents'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await getDocumentDetail(parseId(req.params.id))));
  }),
);

/** POST /api/documents/:id/ocr */
router.post(
  '/:id/ocr',
  requirePermission('document:ocr'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await rerunOcr(parseId(req.params.id), req.user!, req.ip ?? null)));
  }),
);

const signSchema = z.object({
  signerName: z.string({ required_error: '签章人不能为空' }).trim().min(1, '签章人不能为空').max(50),
  sealId: z.coerce.number().int().positive().optional().nullable(),
});

/** POST /api/documents/:id/sign（Mock CA） */
router.post(
  '/:id/sign',
  requirePermission('document:sign'),
  asyncHandler(async (req, res) => {
    const body = validate(signSchema, req.body);
    res.json(
      okBody(
        await signDocument(
          parseId(req.params.id),
          { signerName: body.signerName, sealId: body.sealId ?? null },
          req.user!,
          req.ip ?? null,
        ),
      ),
    );
  }),
);

export const documentsRouter = router;
