import { beforeEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({
  flow: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('./logger', () => ({ logger }));

import { ApiRequestError } from './api';
import {
  MAX_REQUEST_RETRIES,
  QUERY_STALE_TIME_MS,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  createAppQueryClient,
  logRequestFailure,
  retryDelayMs,
  shouldRetryRequest,
} from './queryClient';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('shouldRetryRequest', () => {
  it('网络错误与 5xx 在上限之内重试', () => {
    for (const status of [0, 500, 502, 503]) {
      const err = new ApiRequestError(status, 'X', 'x');
      expect(shouldRetryRequest(0, err)).toBe(true);
      expect(shouldRetryRequest(MAX_REQUEST_RETRIES - 1, err)).toBe(true);
    }
  });

  it('达到上限后不再重试', () => {
    expect(shouldRetryRequest(MAX_REQUEST_RETRIES, new ApiRequestError(503, 'X', 'x'))).toBe(false);
  });

  it('4xx 不重试（含 404、409、429）', () => {
    for (const status of [400, 401, 403, 404, 409, 429]) {
      expect(shouldRetryRequest(0, new ApiRequestError(status, 'X', 'x'))).toBe(false);
    }
  });

  it('不是请求错误的异常按暂时性故障处理', () => {
    expect(shouldRetryRequest(0, new TypeError('Failed to fetch'))).toBe(true);
  });
});

describe('retryDelayMs', () => {
  it('指数退避并封顶', () => {
    expect(retryDelayMs(0)).toBe(RETRY_BASE_DELAY_MS);
    expect(retryDelayMs(1)).toBe(2 * RETRY_BASE_DELAY_MS);
    expect(retryDelayMs(2)).toBe(4 * RETRY_BASE_DELAY_MS);
    expect(retryDelayMs(10)).toBe(RETRY_MAX_DELAY_MS);
  });
});

describe('logRequestFailure', () => {
  it('4xx 记 WARN，网络错误与 5xx 记 ERROR', () => {
    logRequestFailure('query', ['room', 'A'], new ApiRequestError(404, 'NOT_FOUND', 'x'));
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();

    logRequestFailure('mutation', ['m'], new ApiRequestError(0, 'NETWORK_ERROR', 'x'));
    logRequestFailure('query', ['q'], new ApiRequestError(503, 'X', 'x'));
    logRequestFailure('query', ['q'], new Error('unknown'));
    expect(logger.error).toHaveBeenCalledTimes(3);
  });
});

describe('createAppQueryClient', () => {
  it('查询的默认配置：有限重试、合理的过期时间、不在聚焦时重取', () => {
    const qc = createAppQueryClient();
    const q = qc.getDefaultOptions().queries!;
    expect(q.retry).toBe(shouldRetryRequest);
    expect(q.retryDelay).toBe(retryDelayMs);
    expect(q.staleTime).toBe(QUERY_STALE_TIME_MS);
    expect(q.refetchOnWindowFocus).toBe(false);
    expect(q.refetchOnReconnect).toBe(false);
    expect(q.networkMode).toBe('always');
    expect(qc.getDefaultOptions().mutations!.retry).toBe(false);
  });

  it('查询失败时 4xx 只请求一次，5xx 按上限重试，并记日志', async () => {
    const qc = createAppQueryClient();
    qc.setDefaultOptions({
      ...qc.getDefaultOptions(),
      queries: { ...qc.getDefaultOptions().queries, retryDelay: 0 },
    });

    const notFound = vi.fn().mockRejectedValue(new ApiRequestError(404, 'NOT_FOUND', 'x'));
    await expect(qc.fetchQuery({ queryKey: ['a'], queryFn: notFound })).rejects.toBeTruthy();
    expect(notFound).toHaveBeenCalledTimes(1);

    const down = vi.fn().mockRejectedValue(new ApiRequestError(503, 'X', 'x'));
    await expect(qc.fetchQuery({ queryKey: ['b'], queryFn: down })).rejects.toBeTruthy();
    expect(down).toHaveBeenCalledTimes(1 + MAX_REQUEST_RETRIES);
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it('写操作失败不重试，并记日志', async () => {
    const qc = createAppQueryClient();
    const fn = vi.fn().mockRejectedValue(new ApiRequestError(503, 'X', 'x'));
    const mutation = qc.getMutationCache().build(qc, { mutationFn: fn });
    await expect(mutation.execute(undefined)).rejects.toBeTruthy();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalled();
  });
});
