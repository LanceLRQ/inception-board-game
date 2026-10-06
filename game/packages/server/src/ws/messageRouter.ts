// WS 入站消息路由：心跳与聊天
//
// 职责：
//   - 根据 ClientMessage.type 分发到心跳 / 聊天处理器
//   - 返回要下发给发送方的消息与要广播到整局的消息
//   - 对局消息（icg:move / icg:sync）不在这里处理，由 matchGateway 负责

import type { BroadcastableMessage, ClientMessage, ServerMessage } from './types.js';
import type { HeartbeatManager } from './heartbeat.js';
import type { BotManager } from '../services/BotManager.js';
import type { ChatService } from '../services/ChatService.js';

export interface MessageContext {
  readonly matchID: string;
  /** 账号 id */
  readonly playerID: string;
  /** 座位号：Bot 管理器按座位识别身份 */
  readonly seat: string;
  readonly faction?: string;
}

export interface MessageRouterDeps {
  readonly heartbeat: HeartbeatManager;
  readonly bot: BotManager;
  readonly chat?: ChatService;
}

export interface RouteResult {
  /** 需要回发给客户端的消息（单个 socket） */
  readonly reply?: ServerMessage;
  /** 需要广播到整个对局的消息 */
  readonly broadcast?: BroadcastableMessage;
}

export class WSMessageRouter {
  constructor(private readonly deps: MessageRouterDeps) {}

  async route(ctx: MessageContext, msg: ClientMessage): Promise<RouteResult> {
    switch (msg.type) {
      case 'icg:heartbeat':
        return this.handleHeartbeat(ctx);

      case 'icg:chatBroadcast':
        return this.handleChatBroadcast(ctx, msg.message);

      // 对局消息由 matchGateway 处理，不应走到这里
      case 'icg:move':
      case 'icg:sync':
      case 'icg:resume':
        return {};

      default: {
        const _exhaustive: never = msg;
        void _exhaustive;
        return {};
      }
    }
  }

  private async handleHeartbeat(ctx: MessageContext): Promise<RouteResult> {
    await this.deps.heartbeat.recordHeartbeat(ctx.matchID, ctx.playerID);
    // 心跳也算"还活着"，若之前因掉线被记录 → 回切
    this.deps.bot.onReconnect(ctx.matchID, ctx.seat);
    return {};
  }

  private handleChatBroadcast(ctx: MessageContext, message: string): RouteResult {
    if (!this.deps.chat) {
      return {
        reply: {
          type: 'icg:error',
          code: 'CHAT_UNAVAILABLE',
          message: 'Chat service not configured',
        },
      };
    }
    const result = this.deps.chat.send({
      matchID: ctx.matchID,
      // 广播里的发送者与对局内其他通知一致，用座位号；冷却也按座位计（座位在对局内唯一）
      senderID: ctx.seat,
      senderFaction: ctx.faction ?? 'all',
      presetId: message,
    });
    if (!result.ok) {
      return {
        reply: {
          type: 'icg:error',
          code: result.code,
          message:
            result.code === 'COOLDOWN'
              ? `Cooldown: retry in ${result.retryAfterMs}ms`
              : result.code === 'UNKNOWN_PRESET'
                ? 'Unknown chat preset'
                : 'Preset not available for your faction',
        },
      };
    }
    // 广播已由 ChatService 内部通过 broadcaster 回调完成
    return {};
  }
}
