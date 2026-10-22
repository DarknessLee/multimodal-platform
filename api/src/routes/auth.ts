import express from 'express';
import { z } from 'zod';
import { okBody } from '../errors';
import { login } from '../services/authService';
import { asyncHandler } from '../utils/http';
import { validate } from '../utils/validate';

const router = express.Router();

const loginSchema = z.object({
  username: z.string({ required_error: '账号不能为空' }).trim().min(1, '账号不能为空'),
  password: z.string({ required_error: '密码不能为空' }).min(1, '密码不能为空'),
});

/** POST /api/auth/login */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const input = validate(loginSchema, req.body);
    const data = await login(input.username, input.password);
    res.json(okBody(data));
  }),
);

export const authRouter = router;
