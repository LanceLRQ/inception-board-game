// Socket.io 网关 - 连接生命周期 + 消息派发 + 广播
// 对照：plans/design/07-backend-network.md §7.4 WebSocket 协议
//
// 职责：
//   1. 从 HTTP server 挂载 Socket.io
//   2. 连接时鉴权（JWT from handshake.auth.token）
//   3. 注册 ConnectionRegistry，通知 BotManager.onReconnect
//   4. 接收客户端消息 → WSMessageRouter → 回/广播
//   5. 断开时 unregister + BotManager.onDisconnect
//   6. 监听 BotManager.onTakeover → 广播 icg:aiTakeover

import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import type { ClientMessage, ServerMessage } from './types.js';
import type { WSMessageRouter } from './messageRouter.js';
import type { ConnectionRegistry } from './connectionRegistry.js';
import type { BotManager } from '../services/BotManager.js';
import type { HeartbeatManager } from './heartbeat.js';
import { verifyToken } from '../infra/jwt.js';
import { logger } from '../infra/logger.js';

export interface GatewayDeps {
  readonly registry: ConnectionRegistry;
  readonly router: WSMessageRouter;
  readonly bot: BotManager;
  readonly heartbeat: HeartbeatManager;
}

export interface GatewayOptions {
  readonly corsOrigin?: string | string[];
  readonly path?: string;
}

export interface AuthenticatedSocketData {
  playerID: string;
  matchID: string;
  nickname: string;
}

const DEFAULT_PATH = '/ws';

export class SocketGateway {
  private io: IOServer | null = null;
  private unsubscribeTakeover: (() => void) | null = null;
  private unsubscribeAbandon: (() => void) | null = null;

  constructor(
    private readonly deps: GatewayDeps,
    private readonly opts: GatewayOptions = {},
  ) {}

  attach(httpServer: HttpServer): IOServer {
    const io = new IOServer(httpServer, {
      path: this.opts.path ?? DEFAULT_PATH,
      cors: this.opts.corsOrigin ? { origin: this.opts.corsOrigin, credentials: true } : undefined,
      pingInterval: 25_000,
      pingTimeout: 20_000,
    });

    io.use((socket, next) => {
      try {
        const auth = socket.handshake.auth as { token?: string; matchID?: string } | undefined;
        if (!auth?.token || !auth?.matchID) {
          return next(new Error('AUTH_REQUIRED'));
        }
        const payload = verifyToken(auth.token);
        (socket.data as AuthenticatedSocketData) = {
          playerID: payload.playerId,
          matchID: auth.matchID,
          nickname: payload.nickname,
        };
        next();
      } catch (err) {
        logger.warn({ err: (err as Error).message }, 'ws auth failed');
        next(new Error('AUTH_INVALID'));
      }
    });

    io.on('connection', (socket) => this.onConnection(socket));

    // 订阅 Bot 接管事件 → 广播到对局
    this.unsubscribeTakeover = this.deps.bot.onTakeover((matchID, record) => {
      this.broadcastToMatch(matchID, {
        type: 'icg:aiTakeover',
        matchID,
        playerID: record.playerID,
      });
    });

    // 订阅硬关事件 → 广播 leave
    this.unsubscribeAbandon = this.deps.bot.onAbandon((matchID, playerID) => {
      this.broadcastToMatch(matchID, {
        type: 'icg:playerLeave',
        matchID,
        playerID,
        reason: 'timeout',
      });
    });

    this.io = io;
    logger.info({ path: this.opts.path ?? DEFAULT_PATH }, 'Socket.io gateway attached');
    return io;
  }

  detach(): void {
    this.unsubscribeTakeover?.();
    this.unsubscribeAbandon?.();
    this.unsubscribeTakeover = null;
    this.unsubscribeAbandon = null;
    if (this.io) {
      this.io.removeAllListeners();
      this.io.close();
      this.io = null;
    }
  }

  /** 广播到整个对局所有 socket */
  broadcastToMatch(matchID: string, msg: ServerMessage): void {
    if (!this.io) return;
    const socketIds = this.deps.registry.getSocketsByMatch(matchID);
    for (const sid of socketIds) {
      this.io.to(sid).emit(msg.type, msg);
    }
  }

  /** 发送到指定玩家（所有其设备） */
  sendToPlayer(playerID: string, msg: ServerMessage): void {
    if (!this.io) return;
    const socketIds = this.deps.registry.getSocketsByPlayer(playerID);
    for (const sid of socketIds) {
      this.io.to(sid).emit(msg.type, msg);
    }
  }

  private onConnection(socket: Socket): void {
    const data = socket.data as AuthenticatedSocketData;
    const { playerID, matchID, nickname } = data;

    this.deps.registry.register({
      socketId: socket.id,
      playerID,
      matchID,
      connectedAt: Date.now(),
    });

    // 通知 BotManager 玩家在线 → 回切 AI 接管
    this.deps.bot.onReconnect(matchID, playerID);
    void this.deps.heartbeat.recordHeartbeat(matchID, playerID);

    logger.info({ socketId: socket.id, playerID, matchID }, 'ws connected');

    this.broadcastToMatch(matchID, {
      type: 'icg:playerJoin',
      matchID,
      player: { playerID, nickname, seat: -1 },
    });

    // 统一消息接收：客户端可 emit(type, payload) 或 emit('message', msg)
    socket.onAny(async (event: string, payload: unknown) => {
      if (event === 'disconnect' || event === 'error') return;
      const msg = this.normalizeInbound(event, payload);
      if (!msg) return;

      try {
        const result = await this.deps.router.route({ matchID, playerID }, msg);
        if (result.reply) {
          socket.emit(result.reply.type, result.reply);
        }
        if (result.broadcast) {
          this.broadcastToMatch(matchID, result.broadcast);
        }
      } catch (err) {
        logger.error({ err, event, playerID, matchID }, 'ws route error');
        socket.emit('icg:error', {
          type: 'icg:error',
          code: 'INTERNAL_ERROR',
          message: 'Message routing failed',
        });
      }
    });

    socket.on('disconnect', (reason) => {
      const meta = this.deps.registry.unregister(socket.id);
      if (meta) {
        this.deps.bot.onDisconnect(meta.matchID, meta.playerID);
        this.broadcastToMatch(meta.matchID, {
          type: 'icg:playerLeave',
          matchID: meta.matchID,
          playerID: meta.playerID,
          reason: 'disconnect',
        });
      }
      logger.info({ socketId: socket.id, reason }, 'ws disconnected');
    });
  }

  private normalizeInbound(event: string, payload: unknown): ClientMessage | null {
    return normalizeInbound(event, payload);
  }
}

/** 把 onAny 的 (event, payload) 还原为 ClientMessage（导出供测试） */
export function normalizeInbound(event: string, payload: unknown): ClientMessage | null {
  // 客户端可直接 emit(ClientMessage.type, message)，payload 即完整消息
  if (
    payload &&
    typeof payload === 'object' &&
    'type' in payload &&
    (payload as { type: string }).type === event
  ) {
    return payload as ClientMessage;
  }

  // 兜底：根据 event 名字包装最小消息
  switch (event) {
    case 'icg:heartbeat':
      return { type: 'icg:heartbeat', at: Date.now() };
    case 'icg:reconnect': {
      const seq =
        payload && typeof payload === 'object' && 'lastEventSeq' in payload
          ? Number((payload as { lastEventSeq: unknown }).lastEventSeq) || 0
          : 0;
      return { type: 'icg:reconnect', lastEventSeq: seq };
    }
    case 'icg:ackIntent': {
      const id =
        payload && typeof payload === 'object' && 'intentID' in payload
          ? String((payload as { intentID: unknown }).intentID)
          : '';
      if (!id) return null;
      return { type: 'icg:ackIntent', intentID: id };
    }
    default:
      return null;
  }
}
