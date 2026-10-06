// 联机倒计时的每秒时钟；换算与剩余秒数见 lib/deadlineClock

import { useEffect, useState } from 'react';
import { monotonicNow } from '../../lib/deadlineClock';

export { monotonicNow, remainingSeconds, toLocalDeadline } from '../../lib/deadlineClock';

/** enabled 为 true 时每秒刷新一次单调时钟读数；否则不起定时器 */
export function useSecondClock(enabled: boolean): number {
  const [now, setNow] = useState(() => monotonicNow());
  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(monotonicNow());
    const id = setInterval(tick, 1000);
    queueMicrotask(tick);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}
