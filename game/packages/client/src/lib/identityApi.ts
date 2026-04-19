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
  recoveryCode: string;
  recoveryCodeWarning: string;
}

export interface MeResponse {
  playerId: string;
  nickname: string;
  avatarSeed: string;
  locale: string;
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

function randomRecoveryCode(): string {
  const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

let fallbackToMock = MOCK_FLAG;

function isNetworkDown(err: unknown): boolean {
  if (err instanceof ApiRequestError) return err.status >= 500 || err.status === 0;
  return true;
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
    recoveryCode: randomRecoveryCode(),
    recoveryCodeWarning: '离线模式：恢复码仅当前浏览器有效',
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
      const res = await api.post<InitResponse>('/identity/init', { nickname });
      logger.flow('identity', 'real init ok', { playerId: res.playerId });
      return res;
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
