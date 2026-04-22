// ShootDiceOverlay 纯导出测试（props 类型校验）

import { describe, it, expect } from 'vitest';
import type { ShootDiceOverlayProps } from './index';

describe('ShootDiceOverlay props 类型', () => {
  it('roll 为 null 时不渲染（类型契约：null | number | undefined）', () => {
    const props: ShootDiceOverlayProps = { roll: null };
    expect(props.roll).toBeNull();
  });

  it('roll 有值时合法', () => {
    const props: ShootDiceOverlayProps = { roll: 5, color: 'red' };
    expect(props.roll).toBe(5);
  });

  it('roll 为 undefined 时合法', () => {
    const props: ShootDiceOverlayProps = { roll: undefined };
    expect(props.roll).toBeUndefined();
  });

  it('支持蓝骰颜色', () => {
    const props: ShootDiceOverlayProps = { roll: 3, color: 'blue' };
    expect(props.color).toBe('blue');
  });

  it('支持 onComplete 回调', () => {
    const fn = () => {};
    const props: ShootDiceOverlayProps = { roll: 1, onComplete: fn };
    expect(props.onComplete).toBe(fn);
  });
});
