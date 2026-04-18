import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface IdentityState {
  playerId: string | null;
  token: string | null;
  nickname: string;
  avatarSeed: number;
  setIdentity: (id: string, token: string, nickname: string) => void;
  setNickname: (nickname: string) => void;
  clearIdentity: () => void;
}

export const useIdentityStore = create<IdentityState>()(
  persist(
    (set) => ({
      playerId: null,
      token: null,
      nickname: '',
      avatarSeed: Math.floor(Math.random() * 100000),
      setIdentity: (id, token, nickname) => set({ playerId: id, token, nickname }),
      setNickname: (nickname) => set({ nickname }),
      clearIdentity: () => set({ playerId: null, token: null }),
    }),
    { name: 'icgame-identity' },
  ),
);
