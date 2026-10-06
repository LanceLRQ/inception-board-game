// API 请求封装
// 失败统一抛 ApiRequestError：HTTP 错误带真实状态码，连不上服务（断网、跨域被拒、DNS 失败）是状态码 0。

import { logger } from './logger';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/** 发请求与实时握手共用的登录令牌 */
export function getAuthToken(): string | null {
  try {
    return localStorage.getItem('icgame-token');
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (cause) {
    // fetch 只在网络层失败时抛错（TypeError）；统一成状态码 0 的请求错误，方便重试与降级判断
    const method = options.method ?? 'GET';
    logger.warn('net/http', 'request failed (network)', { method, path });
    throw new ApiRequestError(0, NETWORK_ERROR_CODE, 'Network request failed', cause);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(
      res.status,
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? `HTTP ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

/** 连不上服务时的错误码（状态码为 0） */
export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ApiRequestError';
  }
}

/** 是否是连不上服务（状态码 0） */
export function isNetworkError(err: unknown): boolean {
  return err instanceof ApiRequestError && err.status === 0;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
