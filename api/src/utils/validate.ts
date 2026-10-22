import { z } from 'zod';
import { ApiError } from '../errors';

/** zod 校验，失败统一抛 40001（取第一条中文提示） */
export function validate<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ApiError(40001, first?.message ?? '参数校验失败');
  }
  return parsed.data;
}
