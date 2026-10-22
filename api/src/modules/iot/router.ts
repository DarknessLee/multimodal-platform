import express from 'express';
import { z } from 'zod';
import { okBody } from '../../errors';
import { requirePermission } from '../../middleware/rbac';
import { asyncHandler } from '../../utils/http';
import { validate } from '../../utils/validate';
import { ingestReading, listDevices, listGeoFences, listReadings } from './service';

export const iotRouter = express.Router();

/** GET /api/iot/devices */
iotRouter.get(
  '/devices',
  requirePermission('menu:monitor'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listDevices(req.query as Record<string, unknown>)));
  }),
);

/** GET /api/iot/readings */
iotRouter.get(
  '/readings',
  requirePermission('menu:monitor'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listReadings(req.query as Record<string, unknown>)));
  }),
);

const ingestSchema = z.object({
  deviceNo: z.string({ required_error: '设备编号不能为空' }).trim().min(1, '设备编号不能为空').max(30),
  temperature: z.coerce.number().optional().nullable(),
  humidity: z.coerce.number().optional().nullable(),
  doorOpen: z.union([z.boolean(), z.coerce.number()]).optional().nullable(),
  impactG: z.coerce.number().optional().nullable(),
  lng: z.coerce.number().optional().nullable(),
  lat: z.coerce.number().optional().nullable(),
  reportedAt: z.string().trim().max(30).optional().nullable(),
});

/** POST /api/iot/readings（Mock 上报 + 阈值预警） */
iotRouter.post(
  '/readings',
  requirePermission('iot:ingest'),
  asyncHandler(async (req, res) => {
    const body = validate(ingestSchema, req.body);
    res.json(
      okBody(
        await ingestReading(
          {
            deviceNo: body.deviceNo,
            temperature: body.temperature ?? null,
            humidity: body.humidity ?? null,
            doorOpen: body.doorOpen === null || body.doorOpen === undefined ? null : Boolean(body.doorOpen),
            impactG: body.impactG ?? null,
            lng: body.lng ?? null,
            lat: body.lat ?? null,
            reportedAt: body.reportedAt ?? null,
          },
          req.user!,
          req.ip ?? null,
        ),
      ),
    );
  }),
);

export const geoFencesRouter = express.Router();

/** GET /api/geo-fences */
geoFencesRouter.get(
  '/',
  requirePermission('menu:monitor'),
  asyncHandler(async (req, res) => {
    res.json(okBody(await listGeoFences(req.query as Record<string, unknown>)));
  }),
);
