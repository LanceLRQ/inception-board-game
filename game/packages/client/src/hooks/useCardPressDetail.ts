// useCardPressDetail - 卡牌长按/双击/键盘统一交互 hook
// 对照：plans/design/06c-match-table-layout.md §6.1
//
// 架构：核心状态机 createCardPressStateMachine 为纯工厂函数（闭包 + 外部注入 timer 调度），
// useCardPressDetail 仅在 hook 里 useRef 持有实例并在卸载时销毁，保证测试可脱离 React 环境。
// 约定对齐 useReconnect.reconnectReducer / useChatCooldown.computeCooldownRemaining 的拆分风格。

import { useEffect, useRef, useState } from 'react';
import { LONG_PRESS_MS, LONG_PRESS_MOVE_TOLERANCE } from '../lib/interactionConfig.js';

export interface UseCardPressDetailOptions {
  /** 短按/单击回调 */
  onClick?: () => void;
  /** 长按/双击/键盘长按回调（查看详情） */
  onDetail?: () => void;
  /** 长按阈值（毫秒），默认读 interactionConfig.LONG_PRESS_MS */
  longPressMs?: number;
  /** 是否允许 PC 双击等价长按，默认 true */
  enableDoubleClick?: boolean;
  /** 是否允许键盘 Enter/Space 触发，默认 true */
  enableKeyboard?: boolean;
  /** 禁用 detail 分支：金库/梦境层卡传 true，仅保留 onClick */
  disableDetail?: boolean;
  /** 长按移动像素容忍度，默认 LONG_PRESS_MOVE_TOLERANCE */
  moveTolerance?: number;
}

/** 最小事件接口，用于解耦 React.PointerEvent 依赖，便于单测注入 */
export interface PointerLikeEvent {
  clientX: number;
  clientY: number;
}
export interface KeyboardLikeEvent {
  key: string;
  repeat?: boolean;
  preventDefault?: () => void;
}

export interface CardPressHandlers {
  onPointerDown: (e: PointerLikeEvent) => void;
  onPointerMove: (e: PointerLikeEvent) => void;
  onPointerUp: (e: PointerLikeEvent) => void;
  onPointerLeave: (e: PointerLikeEvent) => void;
  onPointerCancel: (e: PointerLikeEvent) => void;
  onDoubleClick: () => void;
  onKeyDown: (e: KeyboardLikeEvent) => void;
  onKeyUp: (e: KeyboardLikeEvent) => void;
}

/** Timer 调度抽象：便于测试替换为 fake timers */
export interface TimerScheduler {
  setTimeout: (fn: () => void, ms: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
}
export type TimerHandle = unknown;

const defaultScheduler: TimerScheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as TimerHandle,
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface CreateStateMachineOptions extends UseCardPressDetailOptions {
  scheduler?: TimerScheduler;
}

/**
 * 创建卡牌按压状态机（纯工厂，脱离 React）。
 *
 * 所有 option 通过 opts 对象传入；**内部每次事件回调都从 opts 实时读取最新值**，
 * 因此如果调用方在外部可变引用里修改 opts 字段，会立即生效（hook 侧依赖此语义保持 handler 身份稳定）。
 */
export function createCardPressStateMachine(
  opts: CreateStateMachineOptions = {},
): CardPressHandlers & { destroy: () => void } {
  let pressTimer: TimerHandle | null = null;
  let pressDetailFired = false;
  let pressStart: { x: number; y: number } | null = null;

  let keyTimer: TimerHandle | null = null;
  let keyDetailFired = false;

  function scheduler() {
    return opts.scheduler ?? defaultScheduler;
  }
  function longPressMs() {
    return opts.longPressMs ?? LONG_PRESS_MS;
  }
  function moveTolerance() {
    return opts.moveTolerance ?? LONG_PRESS_MOVE_TOLERANCE;
  }

  function clearPressTimer() {
    if (pressTimer != null) {
      scheduler().clearTimeout(pressTimer);
      pressTimer = null;
    }
  }
  function clearKeyTimer() {
    if (keyTimer != null) {
      scheduler().clearTimeout(keyTimer);
      keyTimer = null;
    }
  }

  const handlers: CardPressHandlers = {
    onPointerDown(e) {
      pressDetailFired = false;
      pressStart = { x: e.clientX, y: e.clientY };
      clearPressTimer();
      if (!opts.disableDetail && opts.onDetail) {
        pressTimer = scheduler().setTimeout(() => {
          pressDetailFired = true;
          pressTimer = null;
          opts.onDetail?.();
        }, longPressMs());
      }
    },
    onPointerMove(e) {
      if (pressTimer == null || pressStart == null) return;
      const dx = e.clientX - pressStart.x;
      const dy = e.clientY - pressStart.y;
      const tol = moveTolerance();
      if (dx * dx + dy * dy > tol * tol) {
        clearPressTimer();
      }
    },
    onPointerUp() {
      const wasTimerActive = pressTimer != null;
      clearPressTimer();
      pressStart = null;
      if (wasTimerActive && !pressDetailFired) {
        opts.onClick?.();
      }
    },
    onPointerLeave() {
      clearPressTimer();
      pressStart = null;
    },
    onPointerCancel() {
      clearPressTimer();
      pressStart = null;
    },
    onDoubleClick(): void {
      if (opts.disableDetail) return;
      if (opts.enableDoubleClick === false) return;
      opts.onDetail?.();
    },
    onKeyDown(e) {
      if (opts.enableKeyboard === false) return;
      if (e.key === 'Enter') {
        e.preventDefault?.();
        opts.onClick?.();
        return;
      }
      if (e.key === ' ' || e.key === 'Space') {
        if (e.repeat) return;
        e.preventDefault?.();
        keyDetailFired = false;
        clearKeyTimer();
        if (!opts.disableDetail && opts.onDetail) {
          keyTimer = scheduler().setTimeout(() => {
            keyDetailFired = true;
            keyTimer = null;
            opts.onDetail?.();
          }, longPressMs());
        }
      }
    },
    onKeyUp(e) {
      if (opts.enableKeyboard === false) return;
      if (e.key === ' ' || e.key === 'Space') {
        const wasTimerActive = keyTimer != null;
        clearKeyTimer();
        if (wasTimerActive && !keyDetailFired) {
          opts.onClick?.();
        }
      }
    },
  };

  return {
    ...handlers,
    destroy() {
      clearPressTimer();
      clearKeyTimer();
    },
  };
}

/**
 * React hook 封装：在组件挂载期间维持单个状态机实例，props 变化不重建机器
 * （通过 mutableOpts 实时透传保证回调永远拿到最新 props）。
 *
 * 注意：machine 用 useState lazy init 而非 useRef——避免 render 期访问 ref.current
 * 触发 react-hooks/refs lint 告警；machine 引用稳定，其字段可安全导出。
 */
export function useCardPressDetail(opts: UseCardPressDetailOptions = {}): {
  handlers: CardPressHandlers;
} {
  // 维持一个可变 opts 容器：状态机需"事件触发时读最新 props"的语义，
  // 这是 useRef 持有可变外部源的经典用法；mutableOptsRef.current 仅作为
  // machine 内部事件/effect 回调的查询对象，不参与 render。
  const mutableOptsRef = useRef<CreateStateMachineOptions>({ ...opts });
  // eslint-disable-next-line react-hooks/refs -- 故意在 render 阶段同步 opts 到 ref：machine 内部通过此 ref 在事件触发时读最新 props（useRef 持有可变外部源的经典模式）
  Object.assign(mutableOptsRef.current, opts);

  // lazy init：整个组件生命周期只创建一次 machine 实例
  // eslint-disable-next-line react-hooks/refs -- machine 需要 mutableOptsRef 作为 mutable source，lazy init 的 ref 读取是安全的
  const [machine] = useState(() => createCardPressStateMachine(mutableOptsRef.current));

  useEffect(() => {
    return () => machine.destroy();
  }, [machine]);

  return {
    handlers: {
      onPointerDown: machine.onPointerDown,
      onPointerMove: machine.onPointerMove,
      onPointerUp: machine.onPointerUp,
      onPointerLeave: machine.onPointerLeave,
      onPointerCancel: machine.onPointerCancel,
      onDoubleClick: machine.onDoubleClick,
      onKeyDown: machine.onKeyDown,
      onKeyUp: machine.onKeyUp,
    },
  };
}
