import { describe, expect, it } from 'vitest';
import { heartLockDieSizes } from './MobileTower';

describe('heartLockDieSizes', () => {
  it('平板上心锁骰更大，焦点层比非焦点层大', () => {
    const phone = heartLockDieSizes('phone');
    const tablet = heartLockDieSizes('tablet');
    expect(tablet[0]).toBeGreaterThan(phone[0]);
    expect(tablet[1]).toBeGreaterThan(phone[1]);
    expect(phone[1]).toBeGreaterThan(phone[0]);
    expect(heartLockDieSizes('compact-landscape')).toEqual(phone);
  });
});
