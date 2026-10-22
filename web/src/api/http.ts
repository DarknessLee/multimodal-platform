import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';
import type { ApiEnvelope } from '../types';
import { clearSession, readToken } from '../utils/session';

/** 统一的 axios 实例：/api 前缀由 Vite 代理到 127.0.0.1:8080 */
export const http = axios.create({
  baseURL: '/api',
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

/** 统一的接口错误：message 始终为后端中文提示（或网络提示） */
export class ApiError extends Error {
  code: number;

  status?: number;

  constructor(message: string, code = 50000, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

http.interceptors.request.use((config) => {
  const token = readToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let redirectingToLogin = false;

function redirectToLogin(message: string): void {
  if (redirectingToLogin) return;
  redirectingToLogin = true;
  clearSession();
  ElMessage.error(message);
  const redirect = `${window.location.pathname}${window.location.search}`;
  const target = redirect && !redirect.startsWith('/login')
    ? `/login?redirect=${encodeURIComponent(redirect)}`
    : '/login';
  window.setTimeout(() => {
    window.location.assign(target);
  }, 300);
}

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ code?: number; message?: string }>) => {
    const status = error.response?.status;
    const code = error.response?.data?.code;
    const serverMessage = error.response?.data?.message;
    const message = serverMessage
      || (status ? `请求失败（HTTP ${status}）` : '网络异常，请确认后端 API 服务已启动');

    // 未登录/登录过期：清空会话并回登录页（登录接口本身的 40102 只提示，不跳转）
    if (code === 40101 || (status === 401 && code !== 40102)) {
      redirectToLogin(message);
      return Promise.reject(new ApiError(message, code ?? 40101, status));
    }

    ElMessage.error(message);
    return Promise.reject(new ApiError(message, code ?? 50000, status));
  },
);

/** 发起请求并拆包 { code, message, data }，code 非 0 时抛错 */
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await http.request<ApiEnvelope<T>>(config);
  const body = response.data;
  if (!body || typeof body.code !== 'number') {
    ElMessage.error('接口响应格式异常');
    throw new ApiError('接口响应格式异常');
  }
  if (body.code !== 0) {
    ElMessage.error(body.message || '操作失败');
    throw new ApiError(body.message || '操作失败', body.code);
  }
  return body.data;
}
