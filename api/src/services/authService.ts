import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { ROLE_LABELS } from '../config/labels';
import { queryOne } from '../db/pool';
import { ApiError } from '../errors';
import { writeAudit } from '../middleware/audit';
import { loadPermissions, menuCodesOf } from '../middleware/rbac';
import type { AuthUser, Role, UserRow } from '../types';
import { formatDateTime, nowDate } from '../utils/datetime';

export interface LoginUserDto {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  roleLabel: string;
  permissions: string[];
}

export interface LoginResult {
  token: string;
  user: LoginUserDto;
  /** 顶层权限码（与 user.permissions 相同，便于前端直接取用） */
  permissions: string[];
  /** 菜单码（permission_code 以 menu: 开头的子集） */
  menus: string[];
}

function toUserDto(user: UserRow, permissions: string[]): LoginUserDto {
  return {
    id: Number(user.id),
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role],
    permissions,
  };
}

/**
 * POST /api/auth/login：bcrypt 校验 + 签发 HS256 JWT（12h，payload {uid, username, role, name}）
 * Stage 1：返回 permissions（user 内 + 顶层）与 menus；记录 last_login_at 与登录审计。
 */
export async function login(username: string, password: string, ip: string | null = null): Promise<LoginResult> {
  const user = await queryOne<UserRow>('SELECT * FROM user WHERE username = ? LIMIT 1', [username]);
  if (!user) {
    throw new ApiError(40102, '账号或密码错误');
  }
  if (user.status !== 'ACTIVE') {
    throw new ApiError(40102, '账号已被停用');
  }
  const matched = await bcrypt.compare(password, user.password_hash);
  if (!matched) {
    throw new ApiError(40102, '账号或密码错误');
  }

  const permissions = await loadPermissions(user.role);
  const menus = menuCodesOf(permissions);
  const payload = {
    uid: Number(user.id),
    username: user.username,
    role: user.role,
    name: user.display_name,
  };
  const options: SignOptions = {
    algorithm: 'HS256',
    expiresIn: env.jwtExpiresIn as unknown as SignOptions['expiresIn'],
  };
  const token = jwt.sign(payload, env.jwtSecret, options);

  const at = formatDateTime(nowDate());
  try {
    const { pool } = await import('../db/pool');
    await pool.execute('UPDATE user SET last_login_at = ? WHERE id = ?', [at, user.id]);
  } catch {
    // 登录时间更新失败不影响登录
  }
  await writeAudit(null, {
    user: { uid: Number(user.id), username: user.username, role: user.role },
    action: 'LOGIN',
    actionLabel: '登录系统',
    module: 'auth',
    targetType: 'USER',
    targetId: Number(user.id),
    detail: { username: user.username, role: user.role },
    ip,
  });

  return { token, user: toUserDto(user, permissions), permissions, menus };
}

/** GET /api/auth/me：当前用户 + 权限集 */
export async function getCurrentUser(user: AuthUser) {
  const row = await queryOne<UserRow>('SELECT * FROM user WHERE id = ? LIMIT 1', [user.uid]);
  if (!row) {
    throw new ApiError(40101, '未登录或登录已过期');
  }
  const permissions = await loadPermissions(row.role);
  const menus = menuCodesOf(permissions);
  const userDto = toUserDto(row, permissions);
  return { ...userDto, permissions, menus, user: userDto };
}
