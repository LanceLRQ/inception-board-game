// ChatService - 预设短语冷却 + 白名单 + 广播
// 对照：plans/design/07-backend-network.md §7.9 聊天协议
//        plans/design/08-security-ai.md §8.6 聊天反刷屏
//
// 职责：
//   - 3s 冷却（按 playerID）
//   - 预设 ID 白名单校验（MVP 只允许 CHAT_PRESETS 内 ID）
//   - 阵营可见性校验（某些战术语仅盗梦者可发）
//   - 调用注入的 broadcaster 广播 icg:chatMessage
//   - 不直接依赖 SocketGateway（解耦 + 可测）

import {
  findChatPreset,
  isPresetAvailableForFaction,
  type ChatPresetFaction,
} from '@icgame/shared';
import type { ServerMessage } from '../ws/types.js';
import { logger } from '../infra/logger.js';

export interface SendChatInput {
  readonly matchID: string;
  readonly senderID: string;
  readonly senderFaction: ChatPresetFaction | string;
  readonly presetId: string;
}

export type ChatAcceptResult = {
  readonly ok: true;
  readonly payload: ChatMessagePayload;
};

export type ChatRejectResult = {
  readonly ok: false;
  readonly code: 'COOLDOWN' | 'UNKNOWN_PRESET' | 'FACTION_FORBIDDEN';
  readonly retryAfterMs?: number;
};

export type ChatResult = ChatAcceptResult | ChatRejectResult;

export interface ChatMessagePayload {
  readonly senderID: string;
  readonly presetId: string;
  readonly sentAt: number;
}

export interface ChatServiceOptions {
  /** 每玩家发送冷却毫秒（默认 3000） */
  readonly cooldownMs?: number;
  /** 注入的时间函数（测试用） */
  readonly now?: () => number;
}

export type ChatBroadcaster = (matchID: string, msg: ServerMessage) => void;

export class ChatService {
  /** key = `${matchID}:${senderID}`，value = 最近一次发送时间戳 */
  private readonly lastSentAt = new Map<string, number>();
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(
    private readonly broadcaster: ChatBroadcaster,
    opts: ChatServiceOptions = {},
  ) {
    this.cooldownMs = opts.cooldownMs ?? 3_000;
    this.now = opts.now ?? (() => Date.now());
  }

  /** 发送预设短语：冷却+白名单+阵营校验，通过则广播并返回成功结果 */
  send(input: SendChatInput): ChatResult {
    const preset = findChatPreset(input.presetId);
    if (!preset) {
      return { ok: false, code: 'UNKNOWN_PRESET' };
    }
    if (!isPresetAvailableForFaction(preset, input.senderFaction)) {
      return { ok: false, code: 'FACTION_FORBIDDEN' };
    }

    const key = this.makeKey(input.matchID, input.senderID);
    const last = this.lastSentAt.get(key) ?? 0;
    const nowTs = this.now();
    const elapsed = nowTs - last;
    if (last > 0 && elapsed < this.cooldownMs) {
      return {
        ok: false,
        code: 'COOLDOWN',
        retryAfterMs: this.cooldownMs - elapsed,
      };
    }

    this.lastSentAt.set(key, nowTs);

    const payload: ChatMessagePayload = {
      senderID: input.senderID,
      presetId: input.presetId,
      sentAt: nowTs,
    };

    try {
      this.broadcaster(input.matchID, {
        type: 'icg:chatMessage',
        matchID: input.matchID,
        message: {
          sender: input.senderID,
          text: preset.textZh,
          phraseId: preset.id,
          sentAt: nowTs,
        },
      });
    } catch (err) {
      logger.warn({ err, matchID: input.matchID }, 'chat broadcast failed');
    }

    return { ok: true, payload };
  }

  /** 查询某玩家剩余冷却时间（测试/UI 用） */
  remainingCooldown(matchID: string, senderID: string): number {
    const key = this.makeKey(matchID, senderID);
    const last = this.lastSentAt.get(key) ?? 0;
    if (last === 0) return 0;
    const remaining = this.cooldownMs - (this.now() - last);
    return remaining > 0 ? remaining : 0;
  }

  /** 对局结束清理记录 */
  disposeMatch(matchID: string): void {
    const prefix = `${matchID}:`;
    for (const k of this.lastSentAt.keys()) {
      if (k.startsWith(prefix)) this.lastSentAt.delete(k);
    }
  }

  private makeKey(matchID: string, senderID: string): string {
    return `${matchID}:${senderID}`;
  }
}
