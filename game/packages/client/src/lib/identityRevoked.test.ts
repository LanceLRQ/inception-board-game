import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logger', () => ({
  logger: { flow: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  TOKEN_REVOKED_CODE,
  bindIdentityRevokedHandler,
  handleIdentityRevoked,
  notifyIdentityRevoked,
  subscribeIdentityRevoked,
} from './identityRevoked';

const unsubscribers: Array<() => void> = [];
afterEach(() => {
  for (const off of unsubscribers.splice(0)) off();
});

describe('notifyIdentityRevoked / subscribeIdentityRevoked', () => {
  it('错误码与服务端一致', () => {
    expect(TOKEN_REVOKED_CODE).toBe('TOKEN_REVOKED');
  });

  it('订阅者收到失效时用的令牌；取消订阅后不再收到', () => {
    const seen: Array<string | null> = [];
    const off = subscribeIdentityRevoked((token) => seen.push(token));
    unsubscribers.push(off);
    notifyIdentityRevoked('tok-1');
    notifyIdentityRevoked(null);
    off();
    notifyIdentityRevoked('tok-2');
    expect(seen).toEqual(['tok-1', null]);
  });

  it('某个订阅者抛错不影响其他订阅者', () => {
    const seen: string[] = [];
    unsubscribers.push(
      subscribeIdentityRevoked(() => {
        throw new Error('boom');
      }),
      subscribeIdentityRevoked((token) => seen.push(String(token))),
    );
    expect(() => notifyIdentityRevoked('tok')).not.toThrow();
    expect(seen).toEqual(['tok']);
  });
});

describe('handleIdentityRevoked', () => {
  function deps(current: string | null) {
    return {
      currentToken: () => current,
      clearIdentity: vi.fn(),
      goToLobby: vi.fn(),
      showNotice: vi.fn(),
    };
  }

  it('失效的令牌就是本机现在用的：清掉身份、提示、回大厅', () => {
    const d = deps('tok-1');
    expect(handleIdentityRevoked('tok-1', d)).toBe(true);
    expect(d.clearIdentity).toHaveBeenCalledTimes(1);
    expect(d.showNotice).toHaveBeenCalledTimes(1);
    expect(d.goToLobby).toHaveBeenCalledTimes(1);
  });

  it('本机已经换了新令牌（刚在这台设备上恢复过）：忽略迟到的失效通知', () => {
    const d = deps('tok-new');
    expect(handleIdentityRevoked('tok-old', d)).toBe(false);
    expect(d.clearIdentity).not.toHaveBeenCalled();
    expect(d.showNotice).not.toHaveBeenCalled();
    expect(d.goToLobby).not.toHaveBeenCalled();
  });

  it('本机已经没有身份（已被清掉）：不重复提示', () => {
    const d = deps(null);
    expect(handleIdentityRevoked('tok-1', d)).toBe(false);
    expect(d.showNotice).not.toHaveBeenCalled();
  });

  it('没带令牌的通知（匿名请求）不处理', () => {
    const d = deps('tok-1');
    expect(handleIdentityRevoked(null, d)).toBe(false);
    expect(d.clearIdentity).not.toHaveBeenCalled();
  });
});

describe('bindIdentityRevokedHandler', () => {
  it('收到本机令牌的失效通知时处理一次；同时在途的重复通知不再重复处理；取消订阅后不再处理', () => {
    let token: string | null = 'tok-1';
    const clearIdentity = vi.fn(() => {
      token = null;
    });
    const goToLobby = vi.fn();
    const showNotice = vi.fn();
    const off = bindIdentityRevokedHandler({
      currentToken: () => token,
      clearIdentity,
      goToLobby,
      showNotice,
    });
    unsubscribers.push(off);

    notifyIdentityRevoked('tok-1');
    notifyIdentityRevoked('tok-1');
    notifyIdentityRevoked('tok-1');
    expect(clearIdentity).toHaveBeenCalledTimes(1);
    expect(showNotice).toHaveBeenCalledTimes(1);
    expect(goToLobby).toHaveBeenCalledTimes(1);

    off();
    token = 'tok-2';
    notifyIdentityRevoked('tok-2');
    expect(clearIdentity).toHaveBeenCalledTimes(1);
  });
});
