import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const post = vi.fn();
const patch = vi.fn();

vi.mock('./api', () => {
  class ApiRequestError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return { api: { get, post, patch }, ApiRequestError };
});
vi.mock('./logger', () => ({
  logger: { flow: vi.fn(), warn: vi.fn(), error: vi.fn(), ai: vi.fn() },
}));

function stubLocalStorage(): void {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  });
}

const realInit = {
  playerId: 'p1',
  nickname: 'A',
  token: 't',
  expiresAt: 1,
  recoveryCode: 'ABCD-2345',
  recoveryCodeWarning: 'w',
};

describe('identityApi', () => {
  beforeEach(() => {
    vi.resetModules();
    get.mockReset();
    post.mockReset();
    patch.mockReset();
    stubLocalStorage();
  });

  it('init 走通真实后端：带回恢复码，offline 为 false', async () => {
    post.mockResolvedValue(realInit);
    const { identityApi } = await import('./identityApi');
    const res = await identityApi.init('A');
    expect(res.recoveryCode).toBe('ABCD-2345');
    expect(res.offline).toBe(false);
  });

  it('后端不可达回落到模拟身份：不返回恢复码，offline 为 true', async () => {
    post.mockRejectedValue(new TypeError('Failed to fetch'));
    const { identityApi, isOfflineIdentity } = await import('./identityApi');
    const res = await identityApi.init('A');
    expect(res.recoveryCode).toBeNull();
    expect(res.offline).toBe(true);
    expect(isOfflineIdentity()).toBe(true);
  });

  it('isOfflineIdentity 也认模拟令牌（刷新后模块状态丢失的情况）', async () => {
    const { isOfflineIdentity } = await import('./identityApi');
    expect(isOfflineIdentity('mock-p-abc')).toBe(true);
    expect(isOfflineIdentity('eyJhbGciOi')).toBe(false);
    expect(isOfflineIdentity(null)).toBe(false);
  });

  it('recover 走 POST /identity/recover，返回新恢复码', async () => {
    post.mockResolvedValue({ ...realInit, recoveryCode: 'WXYZ-7890' });
    const { identityApi } = await import('./identityApi');
    const res = await identityApi.recover('ABCD-2345');
    expect(post).toHaveBeenCalledWith('/identity/recover', { code: 'ABCD-2345' });
    expect(res.recoveryCode).toBe('WXYZ-7890');
  });

  it('recover 遇到后端错误直接抛出，不回落到模拟身份', async () => {
    post.mockRejectedValue(new TypeError('Failed to fetch'));
    const { identityApi, isOfflineIdentity } = await import('./identityApi');
    await expect(identityApi.recover('ABCD-2345')).rejects.toBeInstanceOf(TypeError);
    expect(isOfflineIdentity()).toBe(false);
  });

  it('离线模拟模式下恢复与重新生成都以 OFFLINE 拒绝', async () => {
    post.mockRejectedValue(new TypeError('Failed to fetch'));
    const { identityApi } = await import('./identityApi');
    await identityApi.init('A');
    post.mockClear();
    await expect(identityApi.recover('ABCD-2345')).rejects.toMatchObject({ code: 'OFFLINE' });
    await expect(identityApi.rotateRecoveryCode()).rejects.toMatchObject({ code: 'OFFLINE' });
    expect(post).not.toHaveBeenCalled();
  });

  it('rotateRecoveryCode 读取响应里的 code 字段', async () => {
    post.mockResolvedValue({ code: 'NEW1-CODE', oldRevoked: true });
    const { identityApi } = await import('./identityApi');
    await expect(identityApi.rotateRecoveryCode()).resolves.toEqual({ code: 'NEW1-CODE' });
    expect(post).toHaveBeenCalledWith('/identity/rotate-recovery-code');
  });

  it('recoveryStatus 读取 hasCode 与生成时间', async () => {
    get.mockResolvedValue({ hasCode: true, createdAt: '2026-10-01T00:00:00.000Z' });
    const { identityApi } = await import('./identityApi');
    await expect(identityApi.recoveryStatus()).resolves.toEqual({
      hasCode: true,
      createdAt: '2026-10-01T00:00:00.000Z',
    });
    expect(get).toHaveBeenCalledWith('/identity/recovery-code');
  });

  it('updateAvatar 走 PATCH /identity/me，返回服务端保存后的种子', async () => {
    patch.mockResolvedValue({ playerId: 'p1', avatarSeed: 'new-seed' });
    const { identityApi } = await import('./identityApi');
    await expect(identityApi.updateAvatar('new-seed')).resolves.toBe('new-seed');
    expect(patch).toHaveBeenCalledWith('/identity/me', { avatarSeed: 'new-seed' });
  });

  it('updateAvatar：服务端报错直接抛出，不写本地', async () => {
    patch.mockRejectedValue(new Error('boom'));
    const { identityApi } = await import('./identityApi');
    await expect(identityApi.updateAvatar('x')).rejects.toThrow('boom');
  });

  it('updateAvatar：离线模拟身份只改本机保存的资料，不请求服务端', async () => {
    post.mockRejectedValue(new TypeError('Failed to fetch'));
    const { identityApi } = await import('./identityApi');
    await identityApi.init('A');
    await expect(identityApi.updateAvatar('local-seed')).resolves.toBe('local-seed');
    expect(patch).not.toHaveBeenCalled();
    await expect(identityApi.me()).resolves.toMatchObject({ avatarSeed: 'local-seed' });
  });
});
