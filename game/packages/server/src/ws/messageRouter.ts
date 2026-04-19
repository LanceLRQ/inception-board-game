// WS 入站消息路由
// 对照：plans/design/07-backend-network.md §7.4.3 C→S 消息
//
// 职责：
//   - 根据 ClientMessage.type 分发到 heartbeat / reconnect / ack / chat 处理器
//   - 返回要下发给发送方的 ServerMessage（或 null）
//   - 不处理 BGIO 的 update/sync/matchData（由 BGIO server 自己处理）

import type { ClientMessage, ServerMessage } from './types.js';
import type { HeartbeatManager } from './heartbeat.js';
import type { ReconnectManager } from './reconnect.js';
import type { BotManager } from '../services/BotManager.js';
import { logger } from '../infra/logger.js';

export interface MessageContext {
  readonly matchID: string;
  readonly playerID: string;
}

export interface MessageRouterDeps {
  readonly heartbeat: HeartbeatManager;
  readonly reconnect: ReconnectManager;
  readonly bot: BotManager;
}

export interface RouteResult {
  /** 需要回发给客户端的消息（单个 socket） */
  readonly reply?: ServerMessage;
  /** 需要广播到整个对局的消息 */
  readonly broadcast?: ServerMessage;
}

export class WSMessageRouter {
  constructor(private readonly deps: MessageRouterDeps) {}

  async route(ctx: MessageContext, msg: ClientMessage): Promise<RouteResult> {
    switch (msg.type) {
      case 'icg:heartbeat':
        return this.handleHeartbeat(ctx);

      case 'icg:reconnect':
        return this.handleReconnect(ctx, msg.lastEventSeq);

      case 'icg:ackIntent':
        return this.handleAckIntent(ctx, msg.intentID);

      case 'icg:chatBroadcast':
        // 预设短语广播留 W8.5-9 实装，此处仅占位
        return {};

      case 'icg:spectateStart':
        return {
          reply: {
            type: 'icg:error',
            code: 'SPECTATE_NOT_AVAILABLE',
            message: 'Spectator mode is not enabled in MVP',
          },
        };

      // BGIO 自有消息交给 BGIO，此处不处理
      case 'update':
      case 'sync':
      case 'chat':
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
    this.deps.bot.onReconnect(ctx.matchID, ctx.playerID);
    return {};
  }

  private async handleReconnect(ctx: MessageContext, lastEventSeq: number): Promise<RouteResult> {
    await this.deps.heartbeat.recordHeartbeat(ctx.matchID, ctx.playerID);
    this.deps.bot.onReconnect(ctx.matchID, ctx.playerID);

    const info = await this.deps.reconnect.getMissingEvents(ctx.matchID, lastEventSeq);
    logger.info(
      { matchID: ctx.matchID, playerID: ctx.playerID, lastEventSeq, info },
      'reconnect requested',
    );

    // 告知客户端当前服务端最新序号；实际事件补发走 BGIO sync
    return {
      reply: {
        type: 'sync',
        args: [
          ctx.matchID,
          {
            state: null,
            log: [],
            filtered: !info.needsFullSync,
          },
        ],
      },
    };
  }

  private async handleAckIntent(ctx: MessageContext, intentID: string): Promise<RouteResult> {
    await this.deps.reconnect.markIntentProcessed(ctx.matchID, ctx.playerID, intentID);
    return {};
  }
}
