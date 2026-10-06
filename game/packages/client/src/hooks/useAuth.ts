import { useCallback, useEffect, useRef, useState } from 'react';
import { identityApi } from '../lib/identityApi';
import { useIdentityStore } from '../stores/useIdentityStore';

/** 建档 / 恢复的结果；recoveryCode 为 null 表示不需要展示（离线模拟身份） */
export interface IdentityResult {
  recoveryCode: string | null;
  warning: string;
}

/** 建档 / 恢复后取一次账号上的头像种子；失败不影响登录，头像按账号 id 推导 */
function syncAvatar(setAvatarSeed: (seed: string) => void): void {
  identityApi
    .me()
    .then((me) => setAvatarSeed(me.avatarSeed))
    .catch(() => undefined);
}

export function useAuth() {
  const { playerId, token, nickname, setIdentity, setNickname, setAvatarSeed, clearIdentity } =
    useIdentityStore();
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
        setAvatarSeed(me.avatarSeed);
      })
      .catch(() => {
        clearIdentity();
      })
      .finally(() => {
        setIsInitialized(true);
      });
  }, [token, setNickname, setAvatarSeed, clearIdentity]);

  const initIdentity = useCallback(
    async (inputNickname: string): Promise<IdentityResult> => {
      setIsLoading(true);
      try {
        const res = await identityApi.init(inputNickname);
        localStorage.setItem('icgame-token', res.token);
        setIdentity(res.playerId, res.token, res.nickname);
        syncAvatar(setAvatarSeed);
        return { recoveryCode: res.recoveryCode, warning: res.recoveryCodeWarning };
      } finally {
        setIsLoading(false);
      }
    },
    [setIdentity, setAvatarSeed],
  );

  const recoverIdentity = useCallback(
    async (code: string): Promise<IdentityResult> => {
      setIsLoading(true);
      try {
        const res = await identityApi.recover(code);
        localStorage.setItem('icgame-token', res.token);
        setIdentity(res.playerId, res.token, res.nickname);
        syncAvatar(setAvatarSeed);
        // 恢复码一次性：用过的码已作废，这里返回的新码需要展示给用户保存
        return { recoveryCode: res.recoveryCode, warning: res.recoveryCodeWarning };
      } finally {
        setIsLoading(false);
      }
    },
    [setIdentity, setAvatarSeed],
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
