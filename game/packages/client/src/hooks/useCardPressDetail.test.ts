// createCardPressStateMachine 行为测试（纯函数工厂，脱离 React 环境）
// 对照：plans/design/06c-match-table-layout.md §6.1

import { describe, it, expect, vi } from 'vitest';
import {
  createCardPressStateMachine,
  type KeyboardLikeEvent,
  type PointerLikeEvent,
  type TimerHandle,
  type TimerScheduler,
} from './useCardPressDetail.js';
import { LONG_PRESS_MS } from '../lib/interactionConfig.js';

/** 构建一个受控 scheduler：手动推进 advance(ms) 触发到期回调 */
function makeControlledScheduler(): TimerScheduler & {
  advance: (ms: number) => void;
  pending: () => number;
} {
  type Entry = { dueAt: number; fn: () => void; handle: number };
  let now = 0;
  let nextHandle = 1;
  const entries: Entry[] = [];

  return {
    setTimeout(fn, ms) {
      const handle = nextHandle++;
      entries.push({ dueAt: now + ms, fn, handle });
      return handle as unknown as TimerHandle;
    },
    clearTimeout(handle) {
      const idx = entries.findIndex((e) => e.handle === (handle as number));
      if (idx !== -1) entries.splice(idx, 1);
    },
    advance(ms) {
      now += ms;
      const due = entries.filter((e) => e.dueAt <= now);
      for (const e of due) {
        const idx = entries.indexOf(e);
        if (idx !== -1) entries.splice(idx, 1);
        e.fn();
      }
    },
    pending() {
      return entries.length;
    },
  };
}

function ptr(x = 0, y = 0): PointerLikeEvent {
  return { clientX: x, clientY: y };
}

function key(k: string, repeat = false): KeyboardLikeEvent {
  return { key: k, repeat, preventDefault: vi.fn() };
}

describe('interactionConfig', () => {
  it('LONG_PRESS_MS 为 2000ms', () => {
    expect(LONG_PRESS_MS).toBe(2000);
  });
});

describe('createCardPressStateMachine · 长按（pointer）', () => {
  it('按下后达到 LONG_PRESS_MS 触发 onDetail，不触发 onClick', () => {
    const onClick = vi.fn();
    const onDetail = vi.fn();
    const s = makeControlledScheduler();
    const m = createCardPressStateMachine({ onClick, onDetail, scheduler: s });

    m.onPointerDown(ptr());
    s.advance(LONG_PRESS_MS);
    m.onPointerUp(ptr());

    expect(onDetail).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('未达阈值抬起触发 onClick', () => {
    const onClick = vi.fn();
    const onDetail = vi.fn();
    const s = makeControlledScheduler();
    const m = createCardPressStateMachine({ onClick, onDetail, scheduler: s });

    m.onPointerDown(ptr());
    s.advance(LONG_PRESS_MS - 1);
    m.onPointerUp(ptr());

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDetail).not.toHaveBeenCalled();
  });

  it('pointermove 超 moveTolerance 取消长按', () => {
    const onClick = vi.fn();
    const onDetail = vi.fn();
    const s = makeControlledScheduler();
    const m = createCardPressStateMachine({
      onClick,
      onDetail,
      scheduler: s,
      moveTolerance: 10,
    });

    m.onPointerDown(ptr(0, 0));
    m.onPointerMove(ptr(15, 0)); // 超过 10px
    s.advance(LONG_PRESS_MS);

    expect(onDetail).not.toHaveBeenCalled();
    m.onPointerUp(ptr(15, 0));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('pointermove 未超 moveTolerance 不取消长按', () => {
    const onDetail = vi.fn();
    const s = makeControlledScheduler();
    const m = createCardPressStateMachine({
      onDetail,
      scheduler: s,
      moveTolerance: 10,
    });

    m.onPointerDown(ptr(0, 0));
    m.onPointerMove(ptr(5, 5)); // sqrt(50) ≈ 7.07 < 10
    s.advance(LONG_PRESS_MS);

    expect(onDetail).toHaveBeenCalledTimes(1);
  });

  it('pointerleave 取消长按', () => {
    const onClick = vi.fn();
    const onDetail = vi.fn();
    const s = makeControlledScheduler();
    const m = createCardPressStateMachine({ onClick, onDetail, scheduler: s });

    m.onPointerDown(ptr());
    m.onPointerLeave(ptr());
    s.advance(LONG_PRESS_MS);

    expect(onDetail).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('pointercancel 取消长按', () => {
    const onDetail = vi.fn();
    const s = makeControlledScheduler();
    const m = createCardPressStateMachine({ onDetail, scheduler: s });

    m.onPointerDown(ptr());
    m.onPointerCancel(ptr());
    s.advance(LONG_PRESS_MS);

    expect(onDetail).not.toHaveBeenCalled();
  });

  it('destroy 清理未触发的 timer', () => {
    const onDetail = vi.fn();
    const s = makeControlledScheduler();
    const m = createCardPressStateMachine({ onDetail, scheduler: s });

    m.onPointerDown(ptr());
    expect(s.pending()).toBe(1);
    m.destroy();
    expect(s.pending()).toBe(0);

    s.advance(LONG_PRESS_MS);
    expect(onDetail).not.toHaveBeenCalled();
  });
});

describe('createCardPressStateMachine · disableDetail', () => {
  it('disableDetail=true 长按不触发 onDetail，也不启动计时器', () => {
    const onClick = vi.fn();
    const onDetail = vi.fn();
    const s = makeControlledScheduler();
    const m = createCardPressStateMachine({
      onClick,
      onDetail,
      disableDetail: true,
      scheduler: s,
    });

    m.onPointerDown(ptr());
    expect(s.pending()).toBe(0);
    s.advance(LONG_PRESS_MS * 2);
    m.onPointerUp(ptr());

    expect(onDetail).not.toHaveBeenCalled();
    // 因为没有 timer，onPointerUp 的 wasTimerActive=false，也不触发 click
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disableDetail=true 双击不触发 onDetail', () => {
    const onDetail = vi.fn();
    const m = createCardPressStateMachine({
      onDetail,
      disableDetail: true,
    });

    m.onDoubleClick();
    expect(onDetail).not.toHaveBeenCalled();
  });
});

describe('createCardPressStateMachine · 双击', () => {
  it('默认启用：双击触发 onDetail', () => {
    const onDetail = vi.fn();
    const m = createCardPressStateMachine({ onDetail });

    m.onDoubleClick();
    expect(onDetail).toHaveBeenCalledTimes(1);
  });

  it('enableDoubleClick=false 双击无效', () => {
    const onDetail = vi.fn();
    const m = createCardPressStateMachine({
      onDetail,
      enableDoubleClick: false,
    });

    m.onDoubleClick();
    expect(onDetail).not.toHaveBeenCalled();
  });
});

describe('createCardPressStateMachine · 键盘', () => {
  it('Enter 触发 onClick', () => {
    const onClick = vi.fn();
    const m = createCardPressStateMachine({ onClick });

    const e = key('Enter');
    m.onKeyDown(e);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('Space 长按达阈值触发 onDetail', () => {
    const onClick = vi.fn();
    const onDetail = vi.fn();
    const s = makeControlledScheduler();
    const m = createCardPressStateMachine({ onClick, onDetail, scheduler: s });

    m.onKeyDown(key(' '));
    s.advance(LONG_PRESS_MS);
    m.onKeyUp(key(' '));

    expect(onDetail).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('Space 短按触发 onClick', () => {
    const onClick = vi.fn();
    const onDetail = vi.fn();
    const s = makeControlledScheduler();
    const m = createCardPressStateMachine({ onClick, onDetail, scheduler: s });

    m.onKeyDown(key(' '));
    s.advance(100);
    m.onKeyUp(key(' '));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDetail).not.toHaveBeenCalled();
  });

  it('Space repeat 被忽略（不重置计时器）', () => {
    const onDetail = vi.fn();
    const s = makeControlledScheduler();
    const m = createCardPressStateMachine({ onDetail, scheduler: s });

    m.onKeyDown(key(' '));
    s.advance(LONG_PRESS_MS / 2);
    m.onKeyDown(key(' ', true)); // repeat=true 应被忽略，不重置 timer
    s.advance(LONG_PRESS_MS / 2);

    expect(onDetail).toHaveBeenCalledTimes(1);
  });

  it('enableKeyboard=false 时 Enter/Space 都无效', () => {
    const onClick = vi.fn();
    const onDetail = vi.fn();
    const s = makeControlledScheduler();
    const m = createCardPressStateMachine({
      onClick,
      onDetail,
      enableKeyboard: false,
      scheduler: s,
    });

    m.onKeyDown(key('Enter'));
    m.onKeyDown(key(' '));
    s.advance(LONG_PRESS_MS);

    expect(onClick).not.toHaveBeenCalled();
    expect(onDetail).not.toHaveBeenCalled();
  });

  it('disableDetail=true Space 长按不触发 onDetail', () => {
    const onDetail = vi.fn();
    const s = makeControlledScheduler();
    const m = createCardPressStateMachine({
      onDetail,
      disableDetail: true,
      scheduler: s,
    });

    m.onKeyDown(key(' '));
    s.advance(LONG_PRESS_MS * 2);
    m.onKeyUp(key(' '));

    expect(onDetail).not.toHaveBeenCalled();
  });
});

describe('createCardPressStateMachine · 自定义阈值', () => {
  it('使用自定义 longPressMs', () => {
    const onDetail = vi.fn();
    const s = makeControlledScheduler();
    const m = createCardPressStateMachine({
      onDetail,
      longPressMs: 500,
      scheduler: s,
    });

    m.onPointerDown(ptr());
    s.advance(499);
    expect(onDetail).not.toHaveBeenCalled();
    s.advance(1);
    expect(onDetail).toHaveBeenCalledTimes(1);
  });
});
