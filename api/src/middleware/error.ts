import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../errors';

/** 未匹配到任何路由（/api 下统一返回 40401 JSON） */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ code: 40401, message: '接口不存在' });
};

/** 全局错误处理：ApiError / zod / JSON 解析错误 / 兜底 50000 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) {
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.httpStatus).json({ code: err.code, message: err.message });
    return;
  }

  if (err instanceof ZodError) {
    const message = err.issues[0]?.message ?? '参数校验失败';
    res.status(400).json({ code: 40001, message });
    return;
  }

  const raw = err as { type?: string; status?: number; message?: string } | null;
  if (raw?.type === 'entity.parse.failed') {
    res.status(400).json({ code: 40001, message: '请求体不是合法的 JSON' });
    return;
  }

  console.error('[api] 未处理异常：', err);
  res.status(500).json({ code: 50000, message: '服务器内部错误' });
};
