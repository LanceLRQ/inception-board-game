// 进程内的周期任务：启动时先跑一次，之后按固定间隔重复
//
// 单次失败只记日志，不影响后续调度；上一次还没跑完时跳过这一轮，避免重叠。
// 计时器不阻止进程退出。

import { logger } from './logger.js';

export function startPeriodic(
  task: string,
  intervalMs: number,
  job: () => Promise<void>,
): () => void {
  let running = false;

  const run = (): void => {
    if (running) return;
    running = true;
    job()
      .catch((err: unknown) => {
        logger.error({ task, err }, 'periodic task failed');
      })
      .finally(() => {
        running = false;
      });
  };

  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
