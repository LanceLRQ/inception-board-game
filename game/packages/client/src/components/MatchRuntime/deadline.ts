// 服务端截止时间的剩余秒数与每秒刷新的时钟

import { useEffect, useState } from 'react';

/** 距截止还剩几秒（向上取整，最小 0）；没有截止时间返回 null */
export function remainingSeconds(deadlineAt: number | null, now: number): number | null {
  if (deadlineAt === null) return null;
  return Math.max(0, Math.ceil((deadlineAt - now) / 1000));
}

/** enabled 为 true 时每秒刷新一次当前时间；否则不起定时器 */
export function useSecondClock(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 1000);
    queueMicrotask(tick);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}
