import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getAuthToken } from '../lib/api';
import { bindIdentityRevokedHandler } from '../lib/identityRevoked';
import { forgetOnlineMatch } from '../lib/onlineMatchMemo';
import { toast } from '../lib/toast';
import { useIdentityStore } from '../stores/useIdentityStore';

/** 本机登录令牌在 localStorage 里的键（与 useAuth、api 一致） */
const TOKEN_STORAGE_KEY = 'icgame-token';

/** 提示停留时间：比普通提示长，用户可能正在对局里 */
const NOTICE_DURATION_MS = 8000;

/**
 * 账号在别处用恢复码找回后，本机令牌被服务端作废：清掉本机身份与缓存、提示一句、回到大厅。
 * 挂在根组件上，请求层与实时连接层发现作废时统一走这里。
 */
export function useRevokedIdentityHandler(): void {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  useEffect(
    () =>
      bindIdentityRevokedHandler({
        currentToken: getAuthToken,
        clearIdentity: () => {
          try {
            localStorage.removeItem(TOKEN_STORAGE_KEY);
          } catch {
            /* 存储不可用时只清内存里的身份 */
          }
          useIdentityStore.getState().clearIdentity();
          forgetOnlineMatch();
          queryClient.clear();
        },
        showNotice: () => {
          toast.warn(t('recovery.revoked'), { duration: NOTICE_DURATION_MS });
        },
        goToLobby: () => {
          void navigate('/lobby', { replace: true });
        },
      }),
    [navigate, queryClient, t],
  );
}
