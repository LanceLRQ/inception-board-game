// 账号在别处用恢复码找回后，本机的令牌被服务端作废：收到 401 或握手被拒时，
// 清掉本机身份、给一句提示并回到大厅。
//
// 请求层与实时连接层只负责「发现」并广播（不依赖 React 与路由），
// 根组件订阅后统一处理，避免各处各写一套、也避免无限重试。

import { logger } from './logger';

/** 服务端令牌作废的错误码（HTTP 错误体、握手拒绝原因、icg:error 都用它） */
export const TOKEN_REVOKED_CODE = 'TOKEN_REVOKED';

type Listener = (tokenUsed: string | null) => void;

const listeners = new Set<Listener>();

/** 订阅令牌作废事件；返回取消订阅的函数 */
export function subscribeIdentityRevoked(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 发现令牌被作废时调用；tokenUsed 是失败的请求 / 连接所用的令牌，用来识别过期通知 */
export function notifyIdentityRevoked(tokenUsed: string | null): void {
  logger.warn('identity', 'token revoked by server');
  for (const listener of [...listeners]) {
    try {
      listener(tokenUsed);
    } catch (err) {
      logger.error('identity', 'revoked listener failed', err);
    }
  }
}

export interface RevokedHandlerDeps {
  /** 本机当前的登录令牌 */
  currentToken(): string | null;
  /** 清掉本机身份（令牌、昵称、头像、进行中对局的记录） */
  clearIdentity(): void;
  goToLobby(): void;
  showNotice(): void;
}

/**
 * 处理令牌作废通知。只有失效的令牌正是本机现在用的那一个才处理：
 * 同时在途的多个请求会各发一次通知，第一次处理后本机已没有身份，其余的直接忽略；
 * 刚在本机恢复出新身份时，迟到的旧通知也不能把新身份清掉。返回是否处理了。
 */
export function handleIdentityRevoked(tokenUsed: string | null, deps: RevokedHandlerDeps): boolean {
  if (tokenUsed === null || deps.currentToken() !== tokenUsed) return false;
  logger.flow('identity', 'identity cleared after revoke');
  deps.clearIdentity();
  deps.showNotice();
  deps.goToLobby();
  return true;
}

/** 订阅令牌作废事件并交给 handleIdentityRevoked 处理；返回取消订阅的函数 */
export function bindIdentityRevokedHandler(deps: RevokedHandlerDeps): () => void {
  return subscribeIdentityRevoked((tokenUsed) => {
    handleIdentityRevoked(tokenUsed, deps);
  });
}
