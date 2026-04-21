// 响应窗口超时 Timer 管理器
// 对照：plans/report/phase3-out-of-turn-interaction-review.md OOT-06 · F11
//
// 设计方针（方案 C · Node setTimeout + 启动时扫描重建）：
//   - 单进程单实例友好：BGIO 0.50 authoritative server 天然单进程一致
//   - 无外部依赖：不依赖 Redis keyspace notifications，私有部署 1GB/2vCPU 零成本
//   - 重启恢复：server 启动时 `recoverFromSnapshots()` 遍历活跃 match 的
//     `state.G.pendingResponseWindow`，用剩余时间重建 timer
//   - BGIO 集成点：`onExpire` 回调由宿主注入（目前 bgio/ 目录空，BGIO 实装后接入）
//
// 生命周期：
//   scheduleTimeout(key, delayMs)  — 开窗时挂定时器
//   cancelTimeout(key)             — 响应 / pass / 全员 resolve 时取消
//   recoverFromSnapshots(items)    — 重启时批量恢复
//   shutdown()                     — SIGTERM 时清理所有 timer
//
// W19-B F11 阶段：本模块独立 + 单测完备；实际 dispatch handleTimeout 的集成
//   待 server BGIO authoritative server 挂载后，通过 `onExpire` 回调接入 MoveGateway。

import { logger } from '../infra/logger.js';

/** 窗口唯一标识：matchID:windowDepth（栈式嵌套时深度区分） */
export type WindowTimerKey = string;

/** 超时回调：宿主实现具体 dispatch 逻辑（本地调 passResponse / 远端 MoveGateway 等） */
export type OnExpireCallback = (key: WindowTimerKey) => void | Promise<void>;

/** 恢复时的快照项 */
export interface WindowTimerSnapshot {
  /** 窗口唯一 key（matchID:depth） */
  readonly key: WindowTimerKey;
  /** 窗口打开时的绝对时间戳（毫秒）*/
  readonly openedAtMs: number;
  /** 窗口配置的超时毫秒数 */
  readonly timeoutMs: number;
}

/** 可注入的 timer 原语（测试用 fake timers 注入；默认用 Node 的 setTimeout/clearTimeout） */
export interface TimerPrimitives {
  readonly setTimeout: (cb: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  readonly clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
  readonly now: () => number;
}

const DEFAULT_PRIMS: TimerPrimitives = {
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (h) => clearTimeout(h),
  now: () => Date.now(),
};

interface Entry {
  readonly key: WindowTimerKey;
  readonly handle: ReturnType<typeof setTimeout>;
  readonly expireAtMs: number;
}

/**
 * 响应窗口超时管理器（进程内）。
 * 线程安全前提：单进程单实例（BGIO 天然满足）。多实例部署需按 matchID hash 路由到同一进程。
 */
export class WindowTimerManager {
  private readonly entries = new Map<WindowTimerKey, Entry>();
  private shuttingDown = false;

  constructor(
    private readonly onExpire: OnExpireCallback,
    private readonly prims: TimerPrimitives = DEFAULT_PRIMS,
  ) {}

  /** 打开窗口时调用 — delayMs 超时后触发 onExpire(key) */
  scheduleTimeout(key: WindowTimerKey, delayMs: number): void {
    if (this.shuttingDown) {
      logger.warn({ key }, 'WindowTimerManager.schedule after shutdown; ignored');
      return;
    }
    // 若同 key 已存在（栈式嵌套或重入保护），先取消旧的
    this.cancelTimeout(key);
    // 零/负延迟：立即触发（保留异步语义，避免调用方栈污染）
    const safeDelay = Math.max(0, Math.floor(delayMs));
    const expireAtMs = this.prims.now() + safeDelay;
    const handle = this.prims.setTimeout(() => {
      this.entries.delete(key);
      // 捕获 onExpire 异常，避免 timer 未捕获导致进程崩溃
      Promise.resolve()
        .then(() => this.onExpire(key))
        .catch((err) => logger.error({ err, key }, 'WindowTimerManager onExpire failed'));
    }, safeDelay);
    this.entries.set(key, { key, handle, expireAtMs });
    logger.debug({ key, delayMs: safeDelay, expireAtMs }, 'window timer scheduled');
  }

  /** 响应/pass/全员 resolve 时调用 — 取消该窗口的 timer */
  cancelTimeout(key: WindowTimerKey): boolean {
    const e = this.entries.get(key);
    if (!e) return false;
    this.prims.clearTimeout(e.handle);
    this.entries.delete(key);
    logger.debug({ key }, 'window timer cancelled');
    return true;
  }

  /** 重启时批量恢复 — 对每个 snapshot 计算剩余时间重建 timer */
  recoverFromSnapshots(items: readonly WindowTimerSnapshot[]): number {
    let recovered = 0;
    for (const item of items) {
      const elapsed = this.prims.now() - item.openedAtMs;
      const remaining = Math.max(0, item.timeoutMs - elapsed);
      this.scheduleTimeout(item.key, remaining);
      recovered += 1;
    }
    logger.info({ recovered, total: items.length }, 'window timers recovered from snapshot');
    return recovered;
  }

  /** 当前活跃窗口数（用于监控/测试） */
  activeCount(): number {
    return this.entries.size;
  }

  /** 查询某 key 的剩余毫秒（key 不存在返回 null） */
  getRemainingMs(key: WindowTimerKey): number | null {
    const e = this.entries.get(key);
    if (!e) return null;
    return Math.max(0, e.expireAtMs - this.prims.now());
  }

  /** SIGTERM / shutdown 时清理所有 timer */
  shutdown(): void {
    this.shuttingDown = true;
    for (const e of this.entries.values()) {
      this.prims.clearTimeout(e.handle);
    }
    const count = this.entries.size;
    this.entries.clear();
    logger.info({ count }, 'WindowTimerManager shutdown');
  }
}
