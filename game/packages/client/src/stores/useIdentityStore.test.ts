import { beforeEach, describe, expect, it } from 'vitest';
import { migrateIdentity, useIdentityStore } from './useIdentityStore';

describe('migrateIdentity', () => {
  it('旧版本里的数字头像种子被丢弃，其余字段保留', () => {
    expect(
      migrateIdentity({ playerId: 'p1', token: 't', nickname: '甲', avatarSeed: 41234 }),
    ).toEqual({ playerId: 'p1', token: 't', nickname: '甲', avatarSeed: '' });
  });

  it('字符串种子保留；空数据得到空身份', () => {
    expect(migrateIdentity({ avatarSeed: 'abc' }).avatarSeed).toBe('abc');
    expect(migrateIdentity(undefined)).toEqual({
      playerId: null,
      token: null,
      nickname: '',
      avatarSeed: '',
    });
  });
});

describe('useIdentityStore', () => {
  beforeEach(() => useIdentityStore.setState({ playerId: null, token: null, avatarSeed: '' }));

  it('登录后可写入头像种子，退出登录时清空', () => {
    useIdentityStore.getState().setIdentity('p1', 'tok', '甲');
    useIdentityStore.getState().setAvatarSeed('seed-1');
    expect(useIdentityStore.getState().avatarSeed).toBe('seed-1');
    useIdentityStore.getState().clearIdentity();
    expect(useIdentityStore.getState().avatarSeed).toBe('');
    expect(useIdentityStore.getState().token).toBeNull();
  });
});
