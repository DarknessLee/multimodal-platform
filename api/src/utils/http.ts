import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ApiError } from '../errors';

export type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** 包裹 async 路由，把 rejection 交给 Express 错误中间件 */
export function asyncHandler(handler: AsyncRouteHandler): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

/** 解析路径参数中的数字 id（Express 5 的 params 值可能为 string[]） */
export function parseId(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(40001, 'ID 参数不合法');
  }
  return id;
}
