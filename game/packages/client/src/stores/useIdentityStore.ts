import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface IdentityState {
  playerId: string | null;
  token: string | null;
  nickname: string;
  /** 像素头像种子：以服务端账号上的为准，登录后从 /identity/me 同步；未同步前为空串 */
  avatarSeed: string;
  setIdentity: (id: string, token: string, nickname: string) => void;
  setNickname: (nickname: string) => void;
  setAvatarSeed: (seed: string) => void;
  clearIdentity: () => void;
}

/** 旧版本把一个本机随机数当作头像种子存在这里，与账号无关；升级时丢弃，等登录后按账号同步 */
export function migrateIdentity(persisted: unknown): Partial<IdentityState> {
  const old = (persisted ?? {}) as Partial<IdentityState> & { avatarSeed?: unknown };
  return {
    playerId: old.playerId ?? null,
    token: old.token ?? null,
    nickname: typeof old.nickname === 'string' ? old.nickname : '',
    avatarSeed: typeof old.avatarSeed === 'string' ? old.avatarSeed : '',
  };
}

export const useIdentityStore = create<IdentityState>()(
  persist(
    (set) => ({
      playerId: null,
      token: null,
      nickname: '',
      avatarSeed: '',
      setIdentity: (id, token, nickname) => set({ playerId: id, token, nickname }),
      setNickname: (nickname) => set({ nickname }),
      setAvatarSeed: (avatarSeed) => set({ avatarSeed }),
      clearIdentity: () => set({ playerId: null, token: null, avatarSeed: '' }),
    }),
    {
      name: 'icgame-identity',
      version: 1,
      migrate: (persisted) => migrateIdentity(persisted) as IdentityState,
    },
  ),
);
