// ShootDiceOverlay 纯导出测试（props 类型校验）

import { describe, it, expect } from 'vitest';
import { SHOOT_DIE_BASE, shootDieSize, type ShootDiceOverlayProps } from './index';

describe('ShootDiceOverlay props 类型', () => {
  it('roll 为 null 时不渲染（类型契约：null | number | undefined）', () => {
    const props: ShootDiceOverlayProps = { roll: null };
    expect(props.roll).toBeNull();
  });

  it('roll 有值时合法', () => {
    const props: ShootDiceOverlayProps = { roll: 5, kind: 'combat' };
    expect(props.roll).toBe(5);
  });

  it('roll 为 undefined 时合法', () => {
    const props: ShootDiceOverlayProps = { roll: undefined };
    expect(props.roll).toBeUndefined();
  });

  it('支持心锁骰', () => {
    const props: ShootDiceOverlayProps = { roll: 3, kind: 'lock' };
    expect(props.kind).toBe('lock');
  });

  it('支持 onComplete 回调', () => {
    const fn = () => {};
    const props: ShootDiceOverlayProps = { roll: 1, onComplete: fn };
    expect(props.onComplete).toBe(fn);
  });
});

describe('shootDieSize', () => {
  it('窄屏与常规桌面保持基准边长', () => {
    expect(shootDieSize(390, 844)).toBe(SHOOT_DIE_BASE);
    expect(shootDieSize(1280, 800)).toBe(SHOOT_DIE_BASE);
  });

  it('大屏随桌面舞台放大', () => {
    expect(shootDieSize(1920, 1080)).toBe(Math.round(SHOOT_DIE_BASE * 1.35));
    expect(shootDieSize(2560, 1440)).toBe(Math.round(SHOOT_DIE_BASE * 1.8));
  });
});
