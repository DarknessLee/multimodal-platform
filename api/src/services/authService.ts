import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { ROLE_LABELS } from '../config/labels';
import { queryOne } from '../db/pool';
import { ApiError } from '../errors';
import type { Role, UserRow } from '../types';

interface LoginUserDto {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  roleLabel: string;
}

interface LoginResult {
  token: string;
  user: LoginUserDto;
}

/** POST /api/auth/login：bcrypt 校验 + 签发 HS256 JWT（12h，payload {uid, username, role, name}） */
export async function login(username: string, password: string): Promise<LoginResult> {
  const user = await queryOne<UserRow>('SELECT * FROM user WHERE username = ? LIMIT 1', [username]);
  if (!user) {
    throw new ApiError(40102, '账号或密码错误');
  }
  const matched = await bcrypt.compare(password, user.password_hash);
  if (!matched) {
    throw new ApiError(40102, '账号或密码错误');
  }

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

  return {
    token,
    user: {
      id: Number(user.id),
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      roleLabel: ROLE_LABELS[user.role],
    },
  };
}
