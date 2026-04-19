// BotManager - 跨对局的 AI 接管生命周期调度
// 对照：plans/design/08-security-ai.md §8.5 AI 接管 / §8.5.3 分级断线策略
//
// 职责：
//   - 为每个活跃 matchID 维护一份 AITakeoverManager
//   - 监听玩家连接/断开事件，记录掉线时间
//   - 定时 tick（默认 5s）：对超过接管阈值（默认 60s）的掉线玩家触发 takeover
//   - 玩家回来 → 回切（除非永久补位）
//   - 对局结束 → 清理全部记录
//
// 注：Bot 实际 Move 派发需要 legalMoves 枚举，依赖后续 BGIO 深度集成才能打通。
//     本类只负责"决定哪些玩家当前由 Bot 控制"。

import { AITakeoverManager, type TakeoverReason, type TakeoverRecord } from '@icgame/bot';
import { logger } from '../infra/logger.js';

export interface BotManagerOptions {
  /** 掉线多少毫秒后接管（默认 60s） */
  readonly takeoverThresholdMs?: number;
  /** tick 间隔（默认 5s） */
  readonly tickIntervalMs?: number;
  /** 强制硬关阈值（默认 3min），超过则标记 abandoned */
  readonly hardCutoffMs?: number;
  /** 获取当前时间（可注入用于测试） */
  readonly now?: () => number;
}

export interface DisconnectSnapshot {
  readonly playerID: string;
  readonly disconnectedAt: number;
}

interface MatchEntry {
  readonly manager: AITakeoverManager;
  /** playerID → 最近一次掉线时间戳；已在线的不在表中 */
  readonly disconnects: Map<string, number>;
  /** 永久补位名单（好友房房主离开允许） */
  readonly permanent: Set<string>;
}

export type TakeoverListener = (matchID: string, record: TakeoverRecord) => void;
export type AbandonListener = (matchID: string, playerID: string) => void;

export class BotManager {
  private readonly matches = new Map<string, MatchEntry>();
  private readonly takeoverListeners = new Set<TakeoverListener>();
  private readonly abandonListeners = new Set<AbandonListener>();
  private timer: ReturnType<typeof setInterval> | null = null;

  private readonly takeoverThresholdMs: number;
  private readonly tickIntervalMs: number;
  private readonly hardCutoffMs: number;
  private readonly now: () => number;

  constructor(opts: BotManagerOptions = {}) {
    this.takeoverThresholdMs = opts.takeoverThresholdMs ?? 60_000;
    this.tickIntervalMs = opts.tickIntervalMs ?? 5_000;
    this.hardCutoffMs = opts.hardCutoffMs ?? 180_000;
    this.now = opts.now ?? (() => Date.now());
  }

  /** 启动周期 tick。重复调用幂等。 */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (err) {
        logger.error({ err }, 'BotManager.tick error');
      }
    }, this.tickIntervalMs);
  }

  /** 停止 tick（测试 / 优雅关停用）。 */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 注册对局（可选；首次 onDisconnect 会自动 ensure） */
  registerMatch(matchID: string): void {
    this.ensureMatch(matchID);
  }

  /** 对局结束：释放资源 */
  disposeMatch(matchID: string): void {
    const entry = this.matches.get(matchID);
    if (!entry) return;
    entry.manager.clear();
    entry.disconnects.clear();
    entry.permanent.clear();
    this.matches.delete(matchID);
  }

  /** 玩家掉线 */
  onDisconnect(matchID: string, playerID: string): void {
    const entry = this.ensureMatch(matchID);
    entry.disconnects.set(playerID, this.now());
  }

  /** 玩家重连 */
  onReconnect(matchID: string, playerID: string): void {
    const entry = this.matches.get(matchID);
    if (!entry) return;
    entry.disconnects.delete(playerID);
    // 非永久接管：立即回切
    const rec = entry.manager.list().find((r) => r.playerID === playerID);
    if (rec && !rec.onPermanent) {
      entry.manager.restore(playerID);
    }
  }

  /** 好友房房主离开：标记永久补位 */
  markPermanent(matchID: string, playerID: string): void {
    const entry = this.ensureMatch(matchID);
    entry.permanent.add(playerID);
    entry.manager.takeover(playerID, 'abandoned', { onPermanent: true });
    this.fireTakeover(matchID, entry.manager.list().find((r) => r.playerID === playerID)!);
  }

  /** 查询某玩家当前是否由 Bot 控制 */
  isBotControlled(matchID: string, playerID: string): boolean {
    const entry = this.matches.get(matchID);
    return entry?.manager.isBotControlled(playerID) ?? false;
  }

  /** 获取对局快照（测试/调试用） */
  snapshot(matchID: string): {
    takeovers: TakeoverRecord[];
    disconnects: DisconnectSnapshot[];
  } | null {
    const entry = this.matches.get(matchID);
    if (!entry) return null;
    return {
      takeovers: entry.manager.list(),
      disconnects: [...entry.disconnects.entries()].map(([playerID, disconnectedAt]) => ({
        playerID,
        disconnectedAt,
      })),
    };
  }

  /** 订阅 takeover 事件（用于广播 icg:aiTakeover） */
  onTakeover(listener: TakeoverListener): () => void {
    this.takeoverListeners.add(listener);
    return () => this.takeoverListeners.delete(listener);
  }

  /** 订阅 abandon（硬关）事件 */
  onAbandon(listener: AbandonListener): () => void {
    this.abandonListeners.add(listener);
    return () => this.abandonListeners.delete(listener);
  }

  /** 手动触发一次 tick（测试用） */
  tick(): void {
    const nowTs = this.now();
    for (const [matchID, entry] of this.matches) {
      for (const [playerID, disconnectedAt] of entry.disconnects) {
        const elapsed = nowTs - disconnectedAt;

        // 硬关：>=3min → 标记 abandoned，广播事件
        if (elapsed >= this.hardCutoffMs) {
          if (!entry.manager.isBotControlled(playerID)) {
            entry.manager.takeover(playerID, 'abandoned');
            this.fireTakeover(matchID, entry.manager.list().find((r) => r.playerID === playerID)!);
          }
          this.fireAbandon(matchID, playerID);
          continue;
        }

        // 软接管：>=60s → 切到 SimpleBot
        if (elapsed >= this.takeoverThresholdMs && !entry.manager.isBotControlled(playerID)) {
          const reason: TakeoverReason = 'disconnect';
          entry.manager.takeover(playerID, reason);
          const rec = entry.manager.list().find((r) => r.playerID === playerID);
          if (rec) this.fireTakeover(matchID, rec);
        }
      }
    }
  }

  private ensureMatch(matchID: string): MatchEntry {
    let entry = this.matches.get(matchID);
    if (!entry) {
      entry = {
        manager: new AITakeoverManager(),
        disconnects: new Map(),
        permanent: new Set(),
      };
      this.matches.set(matchID, entry);
    }
    return entry;
  }

  private fireTakeover(matchID: string, record: TakeoverRecord): void {
    for (const l of this.takeoverListeners) {
      try {
        l(matchID, record);
      } catch (err) {
        logger.warn({ err, matchID, playerID: record.playerID }, 'takeover listener error');
      }
    }
  }

  private fireAbandon(matchID: string, playerID: string): void {
    for (const l of this.abandonListeners) {
      try {
        l(matchID, playerID);
      } catch (err) {
        logger.warn({ err, matchID, playerID }, 'abandon listener error');
      }
    }
  }
}
