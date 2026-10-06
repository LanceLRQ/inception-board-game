import { describe, expect, it } from 'vitest';
import { avatarSeedOf, withSelfAvatar } from './avatarSeed';

describe('avatarSeedOf', () => {
  it('座位表里有种子就用它', () => {
    expect(avatarSeedOf({ seat: '1', nickname: '甲', avatarSeed: '4242' })).toBe('4242');
  });

  it('没有种子（Bot、本地来源、旧版服务端）：由座位与昵称推导，稳定且各座位不同', () => {
    const a = avatarSeedOf({ seat: '1', nickname: 'AI Lv.1-2' });
    expect(a).toBe(avatarSeedOf({ seat: '1', nickname: 'AI Lv.1-2' }));
    expect(a).not.toBe(avatarSeedOf({ seat: '2', nickname: 'AI Lv.1-2' }));
    expect(a.length).toBeGreaterThan(0);
  });

  it('种子是空串按没有处理', () => {
    expect(avatarSeedOf({ seat: '0', nickname: 'x', avatarSeed: '' })).toBe('seat-0-x');
  });

  it('座位表里找不到这个座位时用座位号', () => {
    expect(avatarSeedOf(undefined, '7')).toBe('seat-7');
  });
});

describe('withSelfAvatar', () => {
  const seats = [
    { seat: '0', nickname: '我', isBot: false, connected: true, takenOver: false },
    { seat: '1', nickname: 'AI', isBot: true, connected: true, takenOver: false },
  ];

  it('只给本人座位补上身份里的头像种子', () => {
    const out = withSelfAvatar(seats, '0', '1234');
    expect(out[0]!.avatarSeed).toBe('1234');
    expect(out[1]!.avatarSeed).toBeUndefined();
  });

  it('没有种子或不知道本人座位时原样返回', () => {
    expect(withSelfAvatar(seats, '0', '')).toBe(seats);
    expect(withSelfAvatar(seats, null, '1234')).toBe(seats);
  });

  it('本人座位自带种子时以座位表为准', () => {
    const own = [{ ...seats[0]!, avatarSeed: 'srv' }, seats[1]!];
    expect(withSelfAvatar(own, '0', '1234')).toBe(own);
  });
});
