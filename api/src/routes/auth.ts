import express from 'express';
import { z } from 'zod';
import { okBody } from '../errors';
import { requireAuth } from '../middleware/auth';
import { getCurrentUser, login } from '../services/authService';
import { asyncHandler } from '../utils/http';
import { validate } from '../utils/validate';

const router = express.Router();

const loginSchema = z.object({
  username: z.string({ required_error: '账号不能为空' }).trim().min(1, '账号不能为空'),
  password: z.string({ required_error: '密码不能为空' }).min(1, '密码不能为空'),
});

/** POST /api/auth/login（v0 兼容 + Stage 1 权限集） */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const input = validate(loginSchema, req.body);
    const data = await login(input.username, input.password, req.ip ?? null);
    res.json(okBody(data));
  }),
);

/** GET /api/auth/me（当前用户 + permissions/menus） */
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(okBody(await getCurrentUser(req.user!)));
  }),
);

/** GET /api/auth/permissions（docs/05 列出的权限刷新接口，与 me 同结构） */
router.get(
  '/permissions',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(okBody(await getCurrentUser(req.user!)));
  }),
);

export const authRouter = router;
