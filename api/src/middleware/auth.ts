import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { ApiError } from '../errors';
import type { AuthUser, Role } from '../types';

interface JwtPayloadShape {
  uid?: number;
  username?: string;
  role?: Role;
  name?: string;
}

/** 校验 Bearer JWT（HS256，12h），挂载 req.user */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(new ApiError(40101, '未登录或登录已过期'));
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = jwt.verify(token, env.jwtSecret) as JwtPayloadShape;
    if (!payload || typeof payload.uid !== 'number' || !payload.role) {
      throw new Error('JWT payload 不完整');
    }
    const user: AuthUser = {
      uid: payload.uid,
      username: payload.username ?? '',
      role: payload.role,
      name: payload.name ?? '',
    };
    req.user = user;
    next();
  } catch {
    next(new ApiError(40101, '未登录或登录已过期'));
  }
};

/** 角色白名单校验（需在 requireAuth 之后使用） */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new ApiError(40101, '未登录或登录已过期'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ApiError(40301, '无权限执行该操作'));
      return;
    }
    next();
  };
}

/** 取当前登录用户（理论上 requireAuth 之后必然存在） */
export function currentUser(req: { user?: AuthUser }): AuthUser {
  if (!req.user) {
    throw new ApiError(40101, '未登录或登录已过期');
  }
  return req.user;
}
