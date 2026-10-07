// Socket.io 网关：连接生命周期 + 入站分发 + 按座位发送
//
// 职责：
//   1. 从 HTTP server 挂载 Socket.io
//   2. 握手时校验令牌与对局成员身份，座位由此得出
//   3. 登记连接，通知 BotManager 与对局服务座位的在线状态变化
//   4. 对局消息交给 matchGateway，心跳与聊天交给 WSMessageRouter
//   5. 每一步完成后，按每条连接的座位各发一份视图与事件
//
// 带对局状态的消息只能按连接单独发送；broadcastToMatch 只收与对局状态无关的消息。

import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import { parseClientMatchMessage } from '@icgame/game-engine';
import type { BroadcastableMessage, ClientMessage, ServerMessage } from './types.js';
import type { WSMessageRouter } from './messageRouter.js';
import type { ConnectionRegistry } from './connectionRegistry.js';
import type { BotManager } from '../services/BotManager.js';
import type { BanChecker } from '../services/BanChecker.js';
import type { MoveGateway } from '../services/MoveGateway.js';
import type { HeartbeatManager } from './heartbeat.js';
import type { MatchRoom, StepOutput } from '../match/MatchRoom.js';
import type { MatchService } from '../match/MatchService.js';
import { verifyToken } from '../infra/jwt.js';
import { logger } from '../infra/logger.js';
import { socketCorsOptions } from '../middleware/cors.js';
import { CHAT_BROADCAST_EVENT } from './chatMessage.js';
import {
  authorizeHandshake,
  handleChatInbound,
  handleMatchMessage,
  seatInfos,
  stateMessage,
  stepMessage,
} from './matchGateway.js';

export interface GatewayDeps {
  readonly registry: ConnectionRegistry;
  readonly router: WSMessageRouter;
  readonly bot: BotManager;
  readonly heartbeat: HeartbeatManager;
  readonly moveGateway: Pick<MoveGateway, 'accept' | 'commit' | 'consumeRate'>;
  readonly bans: Pick<BanChecker, 'isBanned' | 'isTokenCurrent'>;
}

export interface GatewayOptions {
  readonly corsOrigin?: string | string[];
  readonly path?: string;
}

export interface AuthenticatedSocketData {
  playerID: string;
  matchID: string;
  nickname: string;
  seat: string;
}

const DEFAULT_PATH = '/ws';
/** 每个座位的并发连接数上限，超出时踢掉最旧的 */
export const MAX_CONNECTIONS_PER_SEAT = 3;

export class SocketGateway {
  private io: IOServer | null = null;
  private matches: MatchService | null = null;
  private unsubscribeTakeover: (() => void) | null = null;
  private unsubscribeAbandon: (() => void) | null = null;

  constructor(
    private readonly deps: GatewayDeps,
    private readonly opts: GatewayOptions = {},
  ) {}

  /** 对局服务与网关互相需要对方：先建网关，对局服务建好后绑定进来 */
  bindMatches(matches: MatchService): void {
    this.matches = matches;
  }

  attach(httpServer: HttpServer): IOServer {
    const io = new IOServer(httpServer, {
      path: this.opts.path ?? DEFAULT_PATH,
      cors: socketCorsOptions(this.opts.corsOrigin),
      pingInterval: 25_000,
      pingTimeout: 20_000,
    });

    io.use((socket, next) => {
      const matches = this.matches;
      if (matches === null) return next(new Error('NOT_IN_MATCH'));
      authorizeHandshake(socket.handshake.auth, { verifyToken, matches, bans: this.deps.bans })
        .then((result) => {
          if (!result.ok) return next(new Error(result.error));
          (socket.data as AuthenticatedSocketData) = {
            playerID: result.playerID,
            matchID: result.matchID,
            nickname: result.nickname,
            seat: result.seat,
          };
          next();
        })
        .catch((err: unknown) => {
          // 封禁查询失败时拒绝连接，而不是放行
          logger.error({ err }, 'ws handshake check failed');
          next(new Error('AUTH_INVALID'));
        });
    });

    io.on('connection', (socket) => this.onConnection(socket));

    // Bot 接管与硬关通知；BotManager 里的身份是座位号
    this.unsubscribeTakeover = this.deps.bot.onTakeover((matchID, record) => {
      this.broadcastToMatch(matchID, {
        type: 'icg:aiTakeover',
        matchID,
        playerID: record.playerID,
      });
    });
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
      void this.io.close();
      this.io = null;
    }
  }

  /** 广播到整个对局所有连接；只允许与对局状态无关的消息 */
  broadcastToMatch(matchID: string, msg: BroadcastableMessage): void {
    for (const sid of this.deps.registry.getSocketsByMatch(matchID)) {
      this.emitTo(sid, msg);
    }
  }

  /** 发送到指定玩家（所有其设备） */
  sendToPlayer(playerID: string, msg: BroadcastableMessage): void {
    for (const sid of this.deps.registry.getSocketsByPlayer(playerID)) {
      this.emitTo(sid, msg);
    }
  }

  /** 断开某账号的全部对局连接（封禁生效、凭恢复码在别处找回账号时调用）；返回断开的连接数。座位随后走掉线托管 */
  disconnectPlayer(playerID: string, code = 'BANNED', message = 'Account is banned'): number {
    const sids = [...this.deps.registry.getSocketsByPlayer(playerID)];
    for (const sid of sids) {
      this.emitTo(sid, { type: 'icg:error', code, message });
      this.io?.sockets.sockets.get(sid)?.disconnect(true);
    }
    return sids.length;
  }

  /** 一步完成后：按每条连接的座位各发一份视图与事件 */
  sendStep(matchID: string, output: StepOutput): void {
    const room = this.matches?.get(matchID) ?? null;
    if (room === null) return;
    const seats = this.seatsOf(room);
    for (const conn of this.deps.registry.listMatchConnections(matchID)) {
      this.emitTo(conn.socketId, stepMessage(room, output, conn.seat, seats));
    }
  }

  /** 座位在线或接管状态变了：给这局每条连接发最新座位表 */
  sendSeats(matchID: string): void {
    const room = this.matches?.get(matchID) ?? null;
    if (room === null) return;
    this.broadcastToMatch(matchID, {
      type: 'icg:seats',
      matchID,
      seats: this.seatsOf(room),
    });
  }

  /** 存储不可用 / 已恢复：提示这局的所有连接 */
  sendStorageHealth(matchID: string, healthy: boolean): void {
    this.broadcastToMatch(matchID, { type: 'icg:storage', matchID, healthy });
  }

  /** 房间被原地换成从存储重新加载的新房间：给这局每条连接重发一份完整视图 */
  resyncMatch(matchID: string): void {
    const room = this.matches?.get(matchID) ?? null;
    if (room === null) return;
    const seats = this.seatsOf(room);
    for (const conn of this.deps.registry.listMatchConnections(matchID)) {
      // 重新加载后的版本号可能比客户端手里的低，带上 reset 让客户端无条件接受
      this.emitTo(conn.socketId, { ...stateMessage(room, conn.seat, seats), reset: true });
    }
    // 连接手里可能还留着旧房间的「存储不可用」提示：按新房间的状态补发一条，让它能消失
    this.sendStorageHealth(matchID, room.isStorageHealthy());
  }

  /** 对局无法继续：通知这局的所有连接并断开 */
  abortMatch(matchID: string): void {
    for (const sid of [...this.deps.registry.getSocketsByMatch(matchID)]) {
      this.emitTo(sid, {
        type: 'icg:error',
        code: 'MATCH_ABORTED',
        message: 'Match interrupted',
      });
      this.io?.sockets.sockets.get(sid)?.disconnect(true);
    }
  }

  private seatsOf(room: MatchRoom) {
    const { registry, bot } = this.deps;
    return seatInfos(room, {
      isConnected: (seat) =>
        registry.listMatchConnections(room.matchID).some((c) => c.seat === seat),
      isTakenOver: (seat) => bot.isBotControlled(room.matchID, seat),
      takeoverReason: (seat) => bot.takeoverReason(room.matchID, seat),
    });
  }

  /** 座位已有的连接达到上限时，从最旧的开始踢，给新连接腾位置 */
  private evictOldestConnections(matchID: string, seat: string): void {
    const existing = this.deps.registry.listSeatConnections(matchID, seat);
    const excess = existing.length - (MAX_CONNECTIONS_PER_SEAT - 1);
    for (const old of existing.slice(0, Math.max(0, excess))) {
      logger.warn({ matchID, seat, socketId: old.socketId }, 'ws connection replaced');
      this.emitTo(old.socketId, {
        type: 'icg:error',
        code: 'REPLACED',
        message: 'Too many connections for this seat',
      });
      this.io?.sockets.sockets.get(old.socketId)?.disconnect(true);
    }
  }

  /** 按连接发送任意服务端消息 */
  private emitTo(socketId: string, msg: ServerMessage): void {
    this.io?.to(socketId).emit(msg.type, msg);
  }

  private onConnection(socket: Socket): void {
    const matches = this.matches;
    const { playerID, matchID, seat } = socket.data as AuthenticatedSocketData;
    if (matches === null) {
      socket.disconnect(true);
      return;
    }

    this.evictOldestConnections(matchID, seat);
    this.deps.registry.register({
      socketId: socket.id,
      playerID,
      matchID,
      seat,
      connectedAt: Date.now(),
    });

    // 座位在线 → 回切 AI 接管，并让对局服务重新排程、通知座位表
    this.deps.bot.onReconnect(matchID, seat);
    this.deps.heartbeat.recordHeartbeat(matchID, playerID).catch((err: unknown) => {
      logger.warn({ err, matchID }, 'heartbeat record failed');
    });
    matches.seatsChanged(matchID);
    logger.info({ socketId: socket.id, matchID, seat }, 'ws connected');

    const room = matches.get(matchID);
    if (room !== null) {
      this.emitTo(socket.id, stateMessage(room, seat, this.seatsOf(room)));
      // 晚到的连接也要知道存储正处于不可用
      if (!room.isStorageHealthy()) {
        this.emitTo(socket.id, { type: 'icg:storage', matchID, healthy: false });
      }
    }

    socket.onAny(async (event: string, payload: unknown) => {
      if (event === 'disconnect' || event === 'error') return;
      try {
        const parsed = parseClientMatchMessage(event, payload);
        if (parsed !== null) {
          const out = await handleMatchMessage(
            parsed,
            { matchID, playerID, seat },
            {
              matches,
              moveGateway: this.deps.moveGateway,
              seatsFor: (r) => this.seatsOf(r),
            },
          );
          socket.emit(out.type, out);
          return;
        }
        if (event === 'icg:resume') {
          // 形状不对的取消托管请求同样要有回应
          socket.emit('icg:error', {
            type: 'icg:error',
            code: 'INVALID_MESSAGE',
            message: 'Malformed icg:resume',
          });
          return;
        }
        if (event === 'icg:move') {
          // 形状不对的 move 也要有回应，而不是静默丢弃
          socket.emit('icg:moveResult', {
            type: 'icg:moveResult',
            intentId: '',
            ok: false,
            code: 'not_object',
          });
          return;
        }

        if (event === CHAT_BROADCAST_EVENT) {
          const chat = await handleChatInbound(
            event,
            payload,
            { matchID, playerID, seat },
            { matches, moveGateway: this.deps.moveGateway, router: this.deps.router },
          );
          if (chat.reply) socket.emit(chat.reply.type, chat.reply);
          return;
        }

        const msg = normalizeInbound(event, payload);
        if (!msg) return;
        const result = await this.deps.router.route({ matchID, playerID, seat }, msg);
        if (result.reply) socket.emit(result.reply.type, result.reply);
        if (result.broadcast) this.broadcastToMatch(matchID, result.broadcast);
      } catch (err) {
        logger.error({ err, event, matchID }, 'ws route error');
        socket.emit('icg:error', {
          type: 'icg:error',
          code: 'INTERNAL_ERROR',
          message: 'Message routing failed',
        });
      }
    });

    socket.on('disconnect', (reason) => {
      const meta = this.deps.registry.unregister(socket.id);
      logger.info({ socketId: socket.id, reason }, 'ws disconnected');
      if (!meta) return;
      const seatStillOnline = this.deps.registry
        .listMatchConnections(meta.matchID)
        .some((c) => c.seat === meta.seat);
      if (seatStillOnline) return;
      this.deps.bot.onDisconnect(meta.matchID, meta.seat);
      this.broadcastToMatch(meta.matchID, {
        type: 'icg:playerLeave',
        matchID: meta.matchID,
        playerID: meta.seat,
        reason: 'disconnect',
      });
      matches.seatsChanged(meta.matchID);
    });
  }
}

/**
 * 把 onAny 的 (event, payload) 还原为心跳消息（导出供测试）。
 * 聊天消息不走这里：它要先过 parseChatBroadcast 的形状校验与限流，见 handleChatInbound。
 */
export function normalizeInbound(event: string, payload: unknown): ClientMessage | null {
  if (event === CHAT_BROADCAST_EVENT) return null;
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
  if (event === 'icg:heartbeat') return { type: 'icg:heartbeat', at: Date.now() };
  return null;
}
