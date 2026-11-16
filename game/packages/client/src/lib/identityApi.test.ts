import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const post = vi.fn();
const patch = vi.fn();
const loadFingerprint = vi.fn();
const getFingerprint = vi.fn();

vi.mock('@fingerprintjs/fingerprintjs', () => ({ load: loadFingerprint }));

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
  return {
    api: { get, post, patch },
    ApiRequestError,
    getAuthToken: () => localStorage.getItem('icgame-token'),
  };
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
  recoveryCode: 'ABCD-2345-EFGH',
  recoveryCodeWarning: 'w',
};

describe('identityApi', () => {
  beforeEach(() => {
    vi.resetModules();
    get.mockReset();
    post.mockReset();
    patch.mockReset();
    loadFingerprint.mockReset().mockResolvedValue({ get: getFingerprint });
    getFingerprint.mockReset();
    stubLocalStorage();
  });

  it('init 走通真实后端：带回恢复码，offline 为 false', async () => {
    post.mockResolvedValue(realInit);
    const { identityApi } = await import('./identityApi');
    const res = await identityApi.init('A');
    expect(res.recoveryCode).toBe('ABCD-2345-EFGH');
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

  it('邀请建档网络失败不生成模拟身份，重试成功后仍返回真实恢复码', async () => {
    post.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(realInit);
    const { identityApi, isOfflineIdentity } = await import('./identityApi');
    await expect(identityApi.init('A', { onlineOnly: true })).rejects.toBeInstanceOf(TypeError);
    expect(localStorage.getItem('icgame-mock-identity')).toBeNull();
    expect(isOfflineIdentity()).toBe(false);
    await expect(identityApi.init('A', { onlineOnly: true })).resolves.toMatchObject({
      offline: false,
      recoveryCode: realInit.recoveryCode,
    });
  });

  it('邀请验证身份失败保留网络错误，不读取本地模拟身份', async () => {
    get.mockRejectedValue(new TypeError('Failed to fetch'));
    const { identityApi, isOfflineIdentity } = await import('./identityApi');
    await expect(identityApi.me({ onlineOnly: true })).rejects.toBeInstanceOf(TypeError);
    expect(isOfflineIdentity()).toBe(false);
  });

  it('同一登录只上报一次 visitorId，并关闭第三方遥测', async () => {
    const { identityApi } = await import('./identityApi');
    localStorage.setItem('icgame-token', realInit.token);
    const visitorId = 'a'.repeat(32);
    getFingerprint.mockResolvedValue({ visitorId, components: { raw: '只在本机' } });
    post.mockResolvedValue({ registered: true });

    await Promise.all([
      identityApi.registerFingerprint(realInit.token),
      identityApi.registerFingerprint(realInit.token),
    ]);
    await identityApi.registerFingerprint(realInit.token);
    expect(loadFingerprint).toHaveBeenCalledExactlyOnceWith({ monitoring: false });
    expect(post).toHaveBeenCalledExactlyOnceWith('/identity/fingerprint', {
      fingerprint: visitorId,
    });
  });

  it('模拟身份跳过采集，浏览器阻断采集不影响身份并允许下次重试', async () => {
    const { identityApi } = await import('./identityApi');
    localStorage.setItem('icgame-token', 'mock-identity');
    await identityApi.registerFingerprint('mock-identity');
    expect(loadFingerprint).not.toHaveBeenCalled();

    localStorage.setItem('icgame-token', realInit.token);
    loadFingerprint.mockRejectedValueOnce(new Error('浏览器阻断采集'));
    await expect(identityApi.registerFingerprint(realInit.token)).resolves.toBeUndefined();
    expect(post).not.toHaveBeenCalled();
    getFingerprint.mockResolvedValue({ visitorId: 'b'.repeat(32) });
    post.mockResolvedValue({ registered: true });
    await identityApi.registerFingerprint(realInit.token);
    expect(post).toHaveBeenCalledOnce();
  });

  it('采集途中切换身份时，旧登录的上报不会发给新登录', async () => {
    const { identityApi } = await import('./identityApi');
    localStorage.setItem('icgame-token', realInit.token);
    const visitorId = 'c'.repeat(32);
    getFingerprint
      .mockImplementationOnce(async () => {
        localStorage.setItem('icgame-token', 'recovered');
        return { visitorId };
      })
      .mockResolvedValue({ visitorId });
    post.mockResolvedValue({ registered: true });

    await identityApi.registerFingerprint(realInit.token);
    expect(post).not.toHaveBeenCalled();
    await identityApi.registerFingerprint('recovered');
    expect(post).toHaveBeenCalledExactlyOnceWith('/identity/fingerprint', {
      fingerprint: visitorId,
    });
  });

  it('recover 走 POST /identity/recover，返回新恢复码', async () => {
    post.mockResolvedValue({ ...realInit, recoveryCode: 'WXYZ-7890-MNPQ' });
    const { identityApi } = await import('./identityApi');
    const res = await identityApi.recover('ABCD-2345-EFGH');
    expect(post).toHaveBeenCalledWith('/identity/recover', { code: 'ABCD-2345-EFGH' });
    expect(res.recoveryCode).toBe('WXYZ-7890-MNPQ');
  });

  it('recover 遇到后端错误直接抛出，不回落到模拟身份', async () => {
    post.mockRejectedValue(new TypeError('Failed to fetch'));
    const { identityApi, isOfflineIdentity } = await import('./identityApi');
    await expect(identityApi.recover('ABCD-2345-EFGH')).rejects.toBeInstanceOf(TypeError);
    expect(isOfflineIdentity()).toBe(false);
  });

  it('离线模拟模式下恢复与重新生成都以 OFFLINE 拒绝', async () => {
    post.mockRejectedValue(new TypeError('Failed to fetch'));
    const { identityApi } = await import('./identityApi');
    await identityApi.init('A');
    post.mockClear();
    await expect(identityApi.recover('ABCD-2345-EFGH')).rejects.toMatchObject({ code: 'OFFLINE' });
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
