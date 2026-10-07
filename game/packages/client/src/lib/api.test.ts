import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logger', () => ({
  logger: { flow: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { ApiRequestError, NETWORK_ERROR_CODE, api, isNetworkError } from './api';
import { subscribeIdentityRevoked } from './identityRevoked';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api 请求封装', () => {
  it('连不上服务时抛状态码 0 的请求错误，并保留原始异常', async () => {
    const cause = new TypeError('Failed to fetch');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(cause));
    const err = await api.get('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 0, code: NETWORK_ERROR_CODE });
    expect((err as Error).cause).toBe(cause);
    expect(isNetworkError(err)).toBe(true);
  });

  it('HTTP 错误带真实状态码与服务端错误码', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: { code: 'ROOM_FULL', message: '房间已满' } }),
      }),
    );
    const err = await api.post('/rooms/ABC234/join').catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 409, code: 'ROOM_FULL', message: '房间已满' });
    expect(isNetworkError(err)).toBe(false);
  });

  it('错误响应不是 JSON 时退回通用文案', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('not json');
        },
      }),
    );
    await expect(api.get('/x')).rejects.toMatchObject({
      status: 502,
      code: 'UNKNOWN',
      message: 'HTTP 502',
    });
  });

  it('成功时返回解析后的 JSON，并带上登录令牌', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ a: 1 }) });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', { getItem: () => 'tok-1' });
    await expect(api.get('/x')).resolves.toEqual({ a: 1 });
    const init = fetchMock.mock.calls[0]![1] as { headers: Record<string, string> };
    expect(init.headers.Authorization).toBe('Bearer tok-1');
  });

  describe('令牌被服务端作废（账号已在别处恢复）', () => {
    function stubError(status: number, code: string) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status,
          json: async () => ({ error: { code, message: 'x' } }),
        }),
      );
    }

    it('401 TOKEN_REVOKED：广播失效通知（带上用过的令牌），调用方仍收到请求错误', async () => {
      vi.stubGlobal('localStorage', { getItem: () => 'tok-old' });
      stubError(401, 'TOKEN_REVOKED');
      const seen: Array<string | null> = [];
      const off = subscribeIdentityRevoked((t) => seen.push(t));
      try {
        await expect(api.get('/identity/me')).rejects.toMatchObject({
          status: 401,
          code: 'TOKEN_REVOKED',
        });
      } finally {
        off();
      }
      expect(seen).toEqual(['tok-old']);
    });

    it.each([
      [401, 'UNAUTHORIZED'],
      [403, 'BANNED'],
      [422, 'INVALID_RECOVERY_CODE'],
    ])('%i %s 不触发失效通知', async (status, code) => {
      vi.stubGlobal('localStorage', { getItem: () => 'tok-old' });
      stubError(status, code);
      const seen: Array<string | null> = [];
      const off = subscribeIdentityRevoked((t) => seen.push(t));
      try {
        await api.get('/x').catch(() => undefined);
      } finally {
        off();
      }
      expect(seen).toEqual([]);
    });

    it('没带令牌的请求收到 TOKEN_REVOKED 也不处理（没有身份可清）', async () => {
      vi.stubGlobal('localStorage', { getItem: () => null });
      stubError(401, 'TOKEN_REVOKED');
      const seen: Array<string | null> = [];
      const off = subscribeIdentityRevoked((t) => seen.push(t));
      try {
        await api.get('/x').catch(() => undefined);
      } finally {
        off();
      }
      expect(seen).toEqual([]);
    });
  });
});
