import { describe, expect, it } from 'vitest';
import { effectiveAvatarSeed } from './useAvatar';

describe('effectiveAvatarSeed', () => {
  it('账号上有种子就用它', () => {
    expect(effectiveAvatarSeed('s1', 'p1', '甲')).toBe('s1');
  });
  it('没有种子时依次退到账号 id、昵称，最后给固定值', () => {
    expect(effectiveAvatarSeed('', 'p1', '甲')).toBe('p1');
    expect(effectiveAvatarSeed('', null, '甲')).toBe('甲');
    expect(effectiveAvatarSeed('', null, '')).toBe('player');
  });
});
