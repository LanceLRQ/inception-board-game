// useChatCooldown - 预设短语发送冷却（客户端 UX 层）
// 对照：plans/design/07-backend-network.md §7.9 / 06-frontend-design.md 预设短语面板
//
// 设计：
//   - 纯函数 computeCooldownRemaining 可单测
//   - Hook 自动每 100ms 倒计时更新 UI（足够流畅，CPU 低）
//   - 冷却时按钮 disable + 显示剩余秒数

import { useCallback, useEffect, useState } from 'react';

export interface ChatCooldownState {
  readonly lastSentAt: number | null;
  readonly remainingMs: number;
  readonly isCoolingDown: boolean;
}

/** 纯函数：计算剩余冷却毫秒 */
export function computeCooldownRemaining(
  lastSentAt: number | null,
  now: number,
  cooldownMs: number,
): number {
  if (lastSentAt === null) return 0;
  const elapsed = now - lastSentAt;
  if (elapsed >= cooldownMs) return 0;
  const remaining = cooldownMs - elapsed;
  return remaining > 0 ? remaining : 0;
}

/** 纯函数：根据剩余时间决定是否冷却中 */
export function isCoolingDownNow(remainingMs: number): boolean {
  return remainingMs > 0;
}

export interface UseChatCooldownOptions {
  /** 冷却毫秒，默认 3000 */
  readonly cooldownMs?: number;
  /** 倒计时 tick 间隔，默认 100ms */
  readonly tickIntervalMs?: number;
}

export interface UseChatCooldownReturn {
  readonly state: ChatCooldownState;
  /** 调用后标记"已发送"，开始冷却 */
  readonly markSent: () => void;
  /** 手动重置（例：服务端明确告知未受限） */
  readonly reset: () => void;
}

export function useChatCooldown(opts: UseChatCooldownOptions = {}): UseChatCooldownReturn {
  const cooldownMs = opts.cooldownMs ?? 3_000;
  const tickMs = opts.tickIntervalMs ?? 100;

  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (lastSentAt === null) return;
    const timer = setInterval(() => {
      const cur = Date.now();
      setNow(cur);
      if (cur - lastSentAt >= cooldownMs) {
        setLastSentAt(null);
      }
    }, tickMs);
    return () => clearInterval(timer);
  }, [lastSentAt, cooldownMs, tickMs]);

  const markSent = useCallback(() => {
    const cur = Date.now();
    setLastSentAt(cur);
    setNow(cur);
  }, []);

  const reset = useCallback(() => {
    setLastSentAt(null);
  }, []);

  const remainingMs = computeCooldownRemaining(lastSentAt, now, cooldownMs);
  const state: ChatCooldownState = {
    lastSentAt,
    remainingMs,
    isCoolingDown: isCoolingDownNow(remainingMs),
  };

  return { state, markSent, reset };
}
