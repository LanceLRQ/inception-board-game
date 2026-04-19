import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { identityApi } from '../lib/identityApi';
import { useIdentityStore } from '../stores/useIdentityStore';

interface RecoverResponse {
  playerId: string;
  nickname: string;
  token: string;
  expiresAt: number;
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

    identityApi
      .me()
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
        const res = await identityApi.init(inputNickname);
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
