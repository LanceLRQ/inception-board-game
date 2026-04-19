import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useIdentityStore } from '../stores/useIdentityStore';

interface InitResponse {
  playerId: string;
  nickname: string;
  token: string;
  expiresAt: number;
  recoveryCode: string;
  recoveryCodeWarning: string;
}

interface RecoverResponse {
  playerId: string;
  nickname: string;
  token: string;
  expiresAt: number;
}

interface MeResponse {
  playerId: string;
  nickname: string;
  avatarSeed: string;
  locale: string;
}

export function useAuth() {
  const { playerId, token, nickname, setIdentity, setNickname, clearIdentity } = useIdentityStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(!token);
  const mountedRef = useRef(false);

  // 启动时验证 token 是否有效
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    if (!token) return;

    api
      .get<MeResponse>('/identity/me')
      .then((me) => {
        setNickname(me.nickname);
      })
      .catch(() => {
        clearIdentity();
      })
      .finally(() => {
        setIsInitialized(true);
      });
  }, [token, setNickname, clearIdentity]);

  const initIdentity = useCallback(
    async (inputNickname: string) => {
      setIsLoading(true);
      try {
        const res = await api.post<InitResponse>('/identity/init', { nickname: inputNickname });
        localStorage.setItem('icgame-token', res.token);
        setIdentity(res.playerId, res.token, res.nickname);
        return { recoveryCode: res.recoveryCode, warning: res.recoveryCodeWarning };
      } finally {
        setIsLoading(false);
      }
    },
    [setIdentity],
  );

  const recoverIdentity = useCallback(
    async (code: string) => {
      setIsLoading(true);
      try {
        const res = await api.post<RecoverResponse>('/identity/recover', { code });
        localStorage.setItem('icgame-token', res.token);
        setIdentity(res.playerId, res.token, res.nickname);
      } finally {
        setIsLoading(false);
      }
    },
    [setIdentity],
  );

  const logout = useCallback(() => {
    localStorage.removeItem('icgame-token');
    clearIdentity();
  }, [clearIdentity]);

  return {
    isAuthenticated: !!playerId && !!token,
    playerId,
    nickname,
    isLoading,
    isInitialized,
    initIdentity,
    recoverIdentity,
    logout,
  };
}
