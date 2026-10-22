// 统一业务错误：code 为契约错误码，httpStatus 为对应的 HTTP 状态码
// 契约错误码：40001 参数校验失败 / 40101 未登录或过期 / 40102 账号或密码错误 /
// 40301 无权限 / 40401 资源不存在 / 40901 当前状态不允许该操作 / 50000 服务器错误

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
      return 409;
    default:
      return 500;
  }
}

export function okBody<T>(data: T): { code: 0; message: 'ok'; data: T } {
  return { code: 0, message: 'ok', data };
}
