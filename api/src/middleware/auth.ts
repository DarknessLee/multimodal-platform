import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { queryOne } from '../db/pool';
import { ApiError } from '../errors';
import type { AuthUser, Role } from '../types';

interface JwtPayloadShape {
  uid?: number;
  username?: string;
  role?: Role;
  name?: string;
}

interface UserContextRow {
  customer_id: number | null;
  partner_id: number | null;
  status: string;
}

/** 校验 Bearer JWT（HS256，12h），并补全 customer_id/partner_id 后挂载 req.user */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(new ApiError(40101, '未登录或登录已过期'));
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  let base: AuthUser;
  try {
    const payload = jwt.verify(token, env.jwtSecret) as JwtPayloadShape;
    if (!payload || typeof payload.uid !== 'number' || !payload.role) {
      throw new Error('JWT payload 不完整');
    }
    base = {
      uid: payload.uid,
      username: payload.username ?? '',
      role: payload.role,
      name: payload.name ?? '',
    };
  } catch {
    next(new ApiError(40101, '未登录或登录已过期'));
    return;
  }

  queryOne<UserContextRow>('SELECT customer_id, partner_id, status FROM user WHERE id = ?', [base.uid])
    .then((row) => {
      if (row && row.status === 'DISABLED') {
        next(new ApiError(40102, '账号已被停用'));
        return;
      }
      req.user = {
        ...base,
        customer_id: row?.customer_id === null || row?.customer_id === undefined ? null : Number(row.customer_id),
        partner_id: row?.partner_id === null || row?.partner_id === undefined ? null : Number(row.partner_id),
      };
      next();
    })
    .catch(next);
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
