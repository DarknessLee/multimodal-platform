// 统一业务错误：code 为契约错误码，httpStatus 为对应的 HTTP 状态码
// v0：40001 参数校验失败 / 40101 未登录或过期 / 40102 账号或密码错误 / 40301 无权限
//     40401 资源不存在 / 40901 当前状态不允许该操作 / 50000 服务器错误
// Stage 1 新增：40902 重复操作或已完成 / 40903 无可用价格规则 / 42201 业务规则不满足

export class ApiError extends Error {
  readonly code: number;
  readonly httpStatus: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.httpStatus = httpStatusOf(code);
  }
}

function httpStatusOf(code: number): number {
  switch (code) {
    case 40001:
      return 400;
    case 40101:
    case 40102:
      return 401;
    case 40301:
      return 403;
    case 40401:
      return 404;
    case 40901:
    case 40902:
    case 40903:
      return 409;
    case 42201:
      return 422;
    default:
      return 500;
  }
}

export function okBody<T>(data: T): { code: 0; message: 'ok'; data: T } {
  return { code: 0, message: 'ok', data };
}
