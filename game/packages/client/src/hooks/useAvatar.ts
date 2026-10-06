// 本人的像素头像：读取与「换一个」。种子以服务端账号上的为准，换一个即写回服务端

import { useCallback, useState } from 'react';
import { generateRandomAvatarSeed } from '@icgame/shared';
import { identityApi } from '../lib/identityApi';
import { logger } from '../lib/logger';
import { useIdentityStore } from '../stores/useIdentityStore';

/** 账号上还没有同步到种子时，用账号 id（再退到昵称）推导一个稳定的，避免头像闪变 */
export function effectiveAvatarSeed(
  avatarSeed: string,
  playerId: string | null,
  nickname: string,
): string {
  return avatarSeed || playerId || nickname || 'player';
}

export interface UseAvatar {
  readonly seed: string;
  readonly rolling: boolean;
  /** 上一次「换一个」没有保存成功 */
  readonly failed: boolean;
  /** 摇一个新种子并保存；保存成功后才改变显示 */
  readonly roll: () => Promise<void>;
}

export function useAvatar(): UseAvatar {
  const avatarSeed = useIdentityStore((s) => s.avatarSeed);
  const playerId = useIdentityStore((s) => s.playerId);
  const nickname = useIdentityStore((s) => s.nickname);
  const setAvatarSeed = useIdentityStore((s) => s.setAvatarSeed);
  const [rolling, setRolling] = useState(false);
  const [failed, setFailed] = useState(false);

  const roll = useCallback(async () => {
    if (rolling) return;
    setRolling(true);
    setFailed(false);
    try {
      const saved = await identityApi.updateAvatar(generateRandomAvatarSeed());
      setAvatarSeed(saved);
      logger.flow('identity', 'avatar rolled');
    } catch (err) {
      logger.warn('identity', 'avatar save failed', err);
      setFailed(true);
    } finally {
      setRolling(false);
    }
  }, [rolling, setAvatarSeed]);

  return {
    seed: effectiveAvatarSeed(avatarSeed, playerId, nickname),
    rolling,
    failed,
    roll,
  };
}
