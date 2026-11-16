import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError } from '../lib/api';
import { identityApi } from '../lib/identityApi';
import { useIdentityStore } from '../stores/useIdentityStore';

/** 建档 / 恢复的结果；recoveryCode 为 null 表示不需要展示（离线模拟身份） */
export interface IdentityResult {
  recoveryCode: string | null;
  warning: string;
}

/** 建档 / 恢复后取一次账号上的头像种子；失败不影响登录，头像按账号 id 推导 */
function syncAvatar(setAvatarSeed: (seed: string) => void, onlineOnly: boolean): void {
  identityApi
    .me({ onlineOnly })
    .then((me) => setAvatarSeed(me.avatarSeed))
    .catch(() => undefined);
}

export function useAuth({ onlineOnly = false } = {}) {
  const { playerId, token, nickname, setIdentity, setNickname, setAvatarSeed, clearIdentity } =
    useIdentityStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(
    !token || (onlineOnly && token.startsWith('mock-')),
  );
  const mountedRef = useRef(false);

  const [initializationError, setInitializationError] = useState<unknown>(null);
  const retryIdentity = useCallback(
    () =>
      identityApi
        .me({ onlineOnly })
        .then((me) => {
          setNickname(me.nickname);
          setAvatarSeed(me.avatarSeed);
        })
        .catch((error: unknown) => {
          // 邀请中的网络失败可重试，不把仍有效的账号当作未登录清除。
          if (onlineOnly && !(error instanceof ApiRequestError && error.status === 401)) {
            setInitializationError(error);
          } else {
            clearIdentity();
          }
        })
        .finally(() => setIsInitialized(true)),
    [onlineOnly, setNickname, setAvatarSeed, clearIdentity],
  );

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    if (!token || (onlineOnly && token.startsWith('mock-'))) return;
    void retryIdentity();
  }, [token, onlineOnly, retryIdentity]);

  const initIdentity = useCallback(
    async (inputNickname: string): Promise<IdentityResult> => {
      setIsLoading(true);
      try {
        const res = await identityApi.init(inputNickname, { onlineOnly });
        localStorage.setItem('icgame-token', res.token);
        setIdentity(res.playerId, res.token, res.nickname);
        syncAvatar(setAvatarSeed, onlineOnly);
        return { recoveryCode: res.recoveryCode, warning: res.recoveryCodeWarning };
      } finally {
        setIsLoading(false);
      }
    },
    [setIdentity, setAvatarSeed, onlineOnly],
  );

  const recoverIdentity = useCallback(
    async (code: string): Promise<IdentityResult> => {
      setIsLoading(true);
      try {
        const res = await identityApi.recover(code, { onlineOnly });
        localStorage.setItem('icgame-token', res.token);
        setIdentity(res.playerId, res.token, res.nickname);
        syncAvatar(setAvatarSeed, onlineOnly);
        // 恢复码一次性：用过的码已作废，这里返回的新码需要展示给用户保存
        return { recoveryCode: res.recoveryCode, warning: res.recoveryCodeWarning };
      } finally {
        setIsLoading(false);
      }
    },
    [setIdentity, setAvatarSeed, onlineOnly],
  );

  const logout = useCallback(() => {
    localStorage.removeItem('icgame-token');
    clearIdentity();
  }, [clearIdentity]);

  return {
    isAuthenticated: !!playerId && !!token && !(onlineOnly && token.startsWith('mock-')),
    initializationError,
    retryIdentity: () => {
      setIsInitialized(false);
      setInitializationError(null);
      void retryIdentity();
    },
    playerId,
    nickname,
    isLoading,
    isInitialized,
    initIdentity,
    recoverIdentity,
    logout,
  };
}
