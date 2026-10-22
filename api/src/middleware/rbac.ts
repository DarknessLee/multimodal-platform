// RBAC：权限码校验（DB role_permission 为准，空表时用静态兜底矩阵）
import type { RequestHandler } from 'express';
import { FALLBACK_ROLE_PERMISSIONS } from '../config/permissions';
import { queryRows } from '../db/pool';
import { ApiError } from '../errors';
import type { Role } from '../types';

const cache = new Map<string, string[]>();

/** 读取角色权限码（进程内缓存） */
export async function loadPermissions(role: Role | string, force = false): Promise<string[]> {
  const key = String(role);
  if (!force && cache.has(key)) {
    return cache.get(key) as string[];
  }
  let codes: string[] = [];
  try {
    const rows = await queryRows<{ permission_code: string }>(
      `SELECT p.permission_code
         FROM permission p
         JOIN role_permission rp ON rp.permission_id = p.id
         JOIN role r ON r.id = rp.role_id
        WHERE r.role_code = ?
        ORDER BY p.sort_no ASC`,
      [key],
    );
    codes = rows.map((row) => row.permission_code);
  } catch {
    codes = [];
  }
  if (codes.length === 0) {
    codes = FALLBACK_ROLE_PERMISSIONS[key] ?? [];
  }
  cache.set(key, codes);
  return codes;
}

/** 清空权限缓存（DB 重置后调用） */
export function clearPermissionCache(): void {
  cache.clear();
}

export function menuCodesOf(permissions: string[]): string[] {
  return permissions.filter((code) => code.startsWith('menu:'));
}

/** 任一权限码满足即放行；否则 40301 */
export function requirePermission(...codes: string[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new ApiError(40101, '未登录或登录已过期'));
      return;
    }
    loadPermissions(req.user.role)
      .then((permissions) => {
        req.permissions = permissions;
        if (codes.length > 0 && !codes.some((code) => permissions.includes(code))) {
          next(new ApiError(40301, '无权限执行该操作'));
          return;
        }
        next();
      })
      .catch(next);
  };
}

/** 附加权限到 req.permissions（不拦截） */
export const attachPermissions: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next();
    return;
  }
  loadPermissions(req.user.role)
    .then((permissions) => {
      req.permissions = permissions;
      next();
    })
    .catch(next);
};
