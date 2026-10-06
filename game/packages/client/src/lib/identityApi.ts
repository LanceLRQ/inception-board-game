// 身份 API 抽象层
// 真实后端：POST /identity/init → 签发 JWT + 恢复码
// 无后端：本地随机生成 UUID + 昵称，直接返回"伪 token"，全流程纯前端
//
// 用途：保证 VITE_USE_MOCK_API=1 或后端不可达时，pnpm dev 也能走完好友房流程

import { api, ApiRequestError } from './api';
import { logger } from './logger';

export interface InitResponse {
  playerId: string;
  nickname: string;
  token: string;
  expiresAt: number;
  /** 离线模拟身份没有真实恢复码，此时为 null，界面不得展示 */
  recoveryCode: string | null;
  recoveryCodeWarning: string;
  /** 本次是否由本地模拟身份产生 */
  offline: boolean;
}

/** 服务端 init / recover 的原始响应 */
interface RealIdentityResponse {
  playerId: string;
  nickname: string;
  token: string;
  expiresAt: number;
  recoveryCode: string;
  recoveryCodeWarning: string;
}

export interface MeResponse {
  playerId: string;
  nickname: string;
  avatarSeed: string;
  locale: string;
  /** 仅真实后端返回 */
  createdAt?: string;
}

export interface RecoveryStatus {
  hasCode: boolean;
  createdAt: string | null;
}

const MOCK_FLAG = (import.meta.env.VITE_USE_MOCK_API ?? '').toString() === '1';
const MOCK_STORAGE = 'icgame-mock-identity';

function loadMockIdentity(): MeResponse | null {
  try {
    const raw = localStorage.getItem(MOCK_STORAGE);
    return raw ? (JSON.parse(raw) as MeResponse) : null;
  } catch {
    return null;
  }
}

function saveMockIdentity(me: MeResponse): void {
  localStorage.setItem(MOCK_STORAGE, JSON.stringify(me));
}

function randomId(): string {
  return 'p-' + Math.random().toString(36).slice(2, 10);
}

let fallbackToMock = MOCK_FLAG;

/** 当前是否处于本地模拟身份（后端不可达回落，或令牌本身就是模拟令牌） */
export function isOfflineIdentity(token?: string | null): boolean {
  return fallbackToMock || (token ?? '').startsWith('mock-');
}

function offlineError(): ApiRequestError {
  return new ApiRequestError(0, 'OFFLINE', 'Offline identity has no recovery code');
}

function isNetworkDown(err: unknown): boolean {
  if (err instanceof ApiRequestError) return err.status >= 500 || err.status === 0;
  return true;
}

function saveMockAvatar(avatarSeed: string): string {
  const me = loadMockIdentity();
  if (me) saveMockIdentity({ ...me, avatarSeed });
  return avatarSeed;
}

async function mockInit(nickname: string): Promise<InitResponse> {
  const playerId = randomId();
  const me: MeResponse = {
    playerId,
    nickname,
    avatarSeed: Math.floor(Math.random() * 100000).toString(),
    locale: 'zh-CN',
  };
  saveMockIdentity(me);
  logger.flow('identity', 'mock init', { playerId, nickname });
  return {
    playerId,
    nickname,
    token: `mock-${playerId}`,
    expiresAt: Date.now() + 365 * 86_400_000,
    recoveryCode: null,
    recoveryCodeWarning: '',
    offline: true,
  };
}

async function mockMe(): Promise<MeResponse> {
  const me = loadMockIdentity();
  if (!me) throw new ApiRequestError(401, 'UNAUTHORIZED', 'No mock identity');
  return me;
}

export const identityApi = {
  async init(nickname: string): Promise<InitResponse> {
    if (fallbackToMock) return mockInit(nickname);
    try {
      const res = await api.post<RealIdentityResponse>('/identity/init', { nickname });
      logger.flow('identity', 'real init ok', { playerId: res.playerId });
      return { ...res, offline: false };
    } catch (err) {
      if (isNetworkDown(err)) {
        logger.warn('identity', 'backend unavailable, fallback to mock');
        fallbackToMock = true;
        return mockInit(nickname);
      }
      logger.error('identity', 'init failed', err);
      throw err;
    }
  },

  /** 凭恢复码恢复；不回落到模拟身份（模拟身份没有可恢复的账号） */
  async recover(code: string): Promise<InitResponse> {
    if (fallbackToMock) throw offlineError();
    try {
      const res = await api.post<RealIdentityResponse>('/identity/recover', { code });
      logger.flow('identity', 'recover ok', { playerId: res.playerId });
      return { ...res, offline: false };
    } catch (err) {
      logger.warn('identity', 'recover failed', {
        status: err instanceof ApiRequestError ? err.status : undefined,
        code: err instanceof ApiRequestError ? err.code : undefined,
      });
      throw err;
    }
  },

  /** 重新生成恢复码，旧码立即作废；返回新码明文 */
  async rotateRecoveryCode(): Promise<{ code: string }> {
    if (fallbackToMock) throw offlineError();
    try {
      const res = await api.post<{ code: string; oldRevoked: boolean }>(
        '/identity/rotate-recovery-code',
      );
      logger.flow('identity', 'recovery code rotated');
      return { code: res.code };
    } catch (err) {
      logger.warn('identity', 'rotate recovery code failed', {
        status: err instanceof ApiRequestError ? err.status : undefined,
      });
      throw err;
    }
  },

  /** 当前是否有有效恢复码（只有状态，没有明文） */
  async recoveryStatus(): Promise<RecoveryStatus> {
    if (fallbackToMock) throw offlineError();
    return api.get<RecoveryStatus>('/identity/recovery-code');
  },

  /** 保存新的像素头像种子；返回服务端实际保存的值。离线模拟身份只改本机保存的资料 */
  async updateAvatar(avatarSeed: string): Promise<string> {
    if (fallbackToMock) return saveMockAvatar(avatarSeed);
    const res = await api.patch<{ avatarSeed: string }>('/identity/me', { avatarSeed });
    logger.flow('identity', 'avatar updated');
    return res.avatarSeed;
  },

  async me(): Promise<MeResponse> {
    if (fallbackToMock) return mockMe();
    try {
      return await api.get<MeResponse>('/identity/me');
    } catch (err) {
      if (isNetworkDown(err)) {
        fallbackToMock = true;
        return mockMe();
      }
      throw err;
    }
  },
};
