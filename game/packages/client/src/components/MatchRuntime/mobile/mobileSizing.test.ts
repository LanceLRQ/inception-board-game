import { describe, expect, it } from 'vitest';
import { dockHeight } from './MobileDock';
import { heartLockDieSizes } from './MobileTower';

describe('dockHeight', () => {
  it('手机收起 / 展开：收起态含版权行 20px，展开态按视口高度封顶，都让出底部安全区', () => {
    expect(dockHeight(false, 'phone')).toBe('calc(162px + env(safe-area-inset-bottom, 0px))');
    expect(dockHeight(true, 'phone')).toBe(
      'calc(min(56dvh, 478px) + env(safe-area-inset-bottom, 0px))',
    );
  });

  it('平板的坞更高，容得下更大的牌', () => {
    expect(dockHeight(false, 'tablet')).toBe('calc(200px + env(safe-area-inset-bottom, 0px))');
    expect(dockHeight(true, 'tablet')).toBe(
      'calc(min(52dvh, 600px) + env(safe-area-inset-bottom, 0px))',
    );
  });

  it('手机横屏由右栏的 flex 决定高度，不给固定值', () => {
    expect(dockHeight(false, 'compact-landscape')).toBeUndefined();
    expect(dockHeight(true, 'compact-landscape')).toBeUndefined();
  });
});

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
