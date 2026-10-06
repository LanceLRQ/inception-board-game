// 数据请求（TanStack Query）的统一配置：重试、过期时间、错误日志都集中在这里

import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from './api';
import { logger } from './logger';

/** 失败后最多重试几次（不含首次请求） */
export const MAX_REQUEST_RETRIES = 3;
/** 退避起点与上限（毫秒）：1s、2s、4s…，最长 8s */
export const RETRY_BASE_DELAY_MS = 1_000;
export const RETRY_MAX_DELAY_MS = 8_000;
/** 查询结果多久内算新鲜（毫秒）；房间等实时数据靠推送与低频轮询刷新，不靠聚焦或挂载重取 */
export const QUERY_STALE_TIME_MS = 30_000;

/**
 * 是否值得重试：连不上服务（状态码 0）与 5xx 是暂时性故障，有限次重试；
 * 4xx 是请求本身有问题（含 404、409、限流 429），重试不会改变结果。
 * 不是 ApiRequestError 的异常按暂时性故障处理。
 */
export function shouldRetryRequest(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_REQUEST_RETRIES) return false;
  if (error instanceof ApiRequestError) return error.status === 0 || error.status >= 500;
  return true;
}

/** 第 attempt 次重试前等多久（attempt 从 0 开始）：指数退避，封顶 */
export function retryDelayMs(attempt: number): number {
  return Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
}

/** 失败日志：暂时性故障记 ERROR，业务拒绝（4xx）记 WARN */
export function logRequestFailure(scope: 'query' | 'mutation', key: unknown, error: unknown): void {
  const detail = {
    key,
    status: error instanceof ApiRequestError ? error.status : undefined,
    code: error instanceof ApiRequestError ? error.code : undefined,
  };
  if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) {
    logger.warn('net/http', `${scope} rejected`, detail);
  } else {
    logger.error('net/http', `${scope} failed`, { ...detail, error });
  }
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => logRequestFailure('query', query.queryKey, error),
    }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) =>
        logRequestFailure('mutation', mutation.options.mutationKey, error),
    }),
    defaultOptions: {
      queries: {
        retry: shouldRetryRequest,
        retryDelay: retryDelayMs,
        staleTime: QUERY_STALE_TIME_MS,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        // 房间接口自带「后端不可达就退回本地模拟」的降级；浏览器报告离线时也要让它跑，不能把请求挂起
        networkMode: 'always',
      },
      mutations: {
        // 建房、开始游戏等写操作不自动重试，避免重复提交
        retry: false,
        networkMode: 'always',
      },
    },
  });
}
