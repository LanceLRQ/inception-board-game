// AI 接管管理器 - 真人 → Bot 切换的生命周期
// 对照：plans/design/08-security-ai.md §8.5 AI 接管
//
// 策略：
//   1. 记录每个玩家的最后活动时间（heartbeat / move）
//   2. 超过 AI_TAKEOVER_MS（60s）无活动 → 切换到 SimpleBot（L0）
//   3. 真人重连后立即恢复（发 icg:reconnect 时回切）
//   4. 好友房：房主离开可允许 Bot 永久补位（onPermanent=true）

import type { Bot } from './randomBot.js';
import { SimpleBot } from './simpleBot.js';

export type TakeoverReason = 'timeout' | 'disconnect' | 'abandoned' | 'manual';

export interface TakeoverRecord {
  readonly playerID: string;
  readonly bot: Bot;
  readonly since: number;
  readonly reason: TakeoverReason;
  readonly onPermanent: boolean;
}

export class AITakeoverManager {
  private readonly records = new Map<string, TakeoverRecord>();

  /** 切换玩家到 Bot 控制 */
  takeover(
    playerID: string,
    reason: TakeoverReason = 'timeout',
    opts: { bot?: Bot; onPermanent?: boolean } = {},
  ): TakeoverRecord {
    const record: TakeoverRecord = {
      playerID,
      bot: opts.bot ?? new SimpleBot(),
      since: Date.now(),
      reason,
      onPermanent: opts.onPermanent ?? false,
    };
    this.records.set(playerID, record);
    return record;
  }

  /** 玩家回来：移除接管（除非 permanent） */
  restore(playerID: string): boolean {
    const rec = this.records.get(playerID);
    if (!rec) return false;
    if (rec.onPermanent) return false;
    this.records.delete(playerID);
    return true;
  }

  /** 查询是否 AI 接管中 */
  isBotControlled(playerID: string): boolean {
    return this.records.has(playerID);
  }

  /** 获取 Bot 实例（若由 AI 控制） */
  getBot(playerID: string): Bot | null {
    return this.records.get(playerID)?.bot ?? null;
  }

  /** 遍历所有接管记录（用于 tick 或 debug） */
  list(): TakeoverRecord[] {
    return [...this.records.values()];
  }

  /** 清空所有（对局结束时调用） */
  clear(): void {
    this.records.clear();
  }
}
