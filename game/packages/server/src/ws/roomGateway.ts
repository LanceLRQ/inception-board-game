// 房间推送网关：房间等待页的成员变化、补 Bot、开始游戏由服务端推送，替代客户端轮询
//
// 挂在同一个 Socket.io 服务的 /rooms 命名空间上（与对局连接共用 /ws 路径与端口）。
// 握手带令牌与房间码，只有房间成员能连上；推送内容是房间本身的公开信息（成员昵称、座位、状态、对局编号），
// 不含任何对局内的状态。成员被移出后，下一次推送时断开他的连接。

import type { Namespace, Server as IOServer, Socket } from 'socket.io';
import { verifyToken } from '../infra/jwt.js';
import { logger } from '../infra/logger.js';
import type { BanChecker } from '../services/BanChecker.js';
import { toRoomPayload, type RoomPayload, type RoomState } from '../services/LobbyService.js';

export const ROOM_NAMESPACE = '/rooms';
/** 推送事件名 */
export const ROOM_EVENT = 'icg:room';
/** 同一个人在同一房间的并发连接数上限，超出时踢掉最旧的 */
export const MAX_ROOM_CONNECTIONS_PER_PLAYER = 5;

const ROOM_CODE_PATTERN = /^[A-Za-z0-9]{6}$/;

export type RoomHandshakeError = 'AUTH_REQUIRED' | 'AUTH_INVALID' | 'BANNED' | 'NOT_IN_ROOM';

export type RoomHandshakeResult =
  | { ok: true; playerID: string; room: RoomState }
  | { ok: false; error: RoomHandshakeError };

export interface RoomHandshakeDeps {
  verifyToken(token: string): { playerId: string };
  bans: Pick<BanChecker, 'isBanned'>;
  getRoom(code: string): Promise<RoomState | null>;
}

/** 房间连接的握手校验：令牌有效、未被封禁、本人是房间成员。房间不存在与非成员不作区分 */
export async function authorizeRoomHandshake(
  auth: unknown,
  deps: RoomHandshakeDeps,
): Promise<RoomHandshakeResult> {
  if (auth === null || typeof auth !== 'object') return { ok: false, error: 'AUTH_REQUIRED' };
  const { token, code } = auth as { token?: unknown; code?: unknown };
  if (typeof token !== 'string' || token === '') return { ok: false, error: 'AUTH_REQUIRED' };
  if (typeof code !== 'string' || !ROOM_CODE_PATTERN.test(code)) {
    return { ok: false, error: 'AUTH_REQUIRED' };
  }

  let playerId: string;
  try {
    playerId = deps.verifyToken(token).playerId;
  } catch {
    return { ok: false, error: 'AUTH_INVALID' };
  }
  if (await deps.bans.isBanned(playerId)) return { ok: false, error: 'BANNED' };

  const room = await deps.getRoom(code.toUpperCase());
  if (room === null || !room.players.some((p) => p.playerId === playerId)) {
    logger.warn({ code, reason: 'NOT_IN_ROOM' }, 'room handshake rejected');
    return { ok: false, error: 'NOT_IN_ROOM' };
  }
  return { ok: true, playerID: playerId, room };
}

interface RoomSocketData {
  playerID: string;
  code: string;
}

/** 房间成员所在的 Socket.io 房间名 */
export function roomChannel(code: string): string {
  return `room:${code.toUpperCase()}`;
}

export interface RoomGatewayDeps {
  bans: Pick<BanChecker, 'isBanned'>;
  getRoom(code: string): Promise<RoomState | null>;
}

export class RoomGateway {
  private ns: Namespace | null = null;

  constructor(private readonly deps: RoomGatewayDeps) {}

  /** 在已创建的 Socket.io 服务上挂 /rooms 命名空间 */
  attach(io: IOServer): void {
    const ns = io.of(ROOM_NAMESPACE);
    ns.use((socket, next) => {
      authorizeRoomHandshake(socket.handshake.auth, {
        verifyToken,
        bans: this.deps.bans,
        getRoom: this.deps.getRoom,
      })
        .then((result) => {
          if (!result.ok) return next(new Error(result.error));
          (socket.data as RoomSocketData) = {
            playerID: result.playerID,
            code: result.room.code,
          };
          next();
        })
        .catch((err: unknown) => {
          logger.error({ err }, 'room handshake check failed');
          next(new Error('AUTH_INVALID'));
        });
    });
    ns.on('connection', (socket) => this.onConnection(socket));
    this.ns = ns;
  }

  detach(): void {
    this.ns?.removeAllListeners();
    this.ns = null;
  }

  /** 房间变了：把最新状态推给仍在成员里的连接，已不在成员里的连接断开 */
  publish(room: RoomState): void {
    const ns = this.ns;
    if (ns === null) return;
    const sids = ns.adapter.rooms.get(roomChannel(room.code));
    if (sids === undefined) return;
    const payload = toRoomPayload(room);
    for (const sid of [...sids]) {
      const socket = ns.sockets.get(sid);
      if (socket === undefined) continue;
      const { playerID } = socket.data as RoomSocketData;
      if (room.players.some((p) => p.playerId === playerID)) {
        socket.emit(ROOM_EVENT, { type: ROOM_EVENT, room: payload });
      } else {
        socket.emit('icg:error', {
          type: 'icg:error',
          code: 'NOT_IN_ROOM',
          message: 'No longer in this room',
        });
        socket.disconnect(true);
      }
    }
  }

  private async onConnection(socket: Socket): Promise<void> {
    const { playerID, code } = socket.data as RoomSocketData;
    const channel = roomChannel(code);
    await socket.join(channel);
    this.evictOldest(channel, playerID);
    logger.info({ code, socketId: socket.id }, 'room ws connected');

    // 连上之后立刻补发一次最新状态：握手校验与订阅之间发生的变化不会漏掉
    try {
      const room = await this.deps.getRoom(code);
      if (room === null) {
        socket.disconnect(true);
        return;
      }
      if (room.players.some((p) => p.playerId === playerID)) {
        socket.emit(ROOM_EVENT, { type: ROOM_EVENT, room: toRoomPayload(room) });
      } else {
        socket.disconnect(true);
      }
    } catch (err) {
      logger.warn({ err, code }, 'room ws initial snapshot failed');
    }

    socket.on('disconnect', (reason) => {
      logger.info({ code, socketId: socket.id, reason }, 'room ws disconnected');
    });
  }

  /** 同一个人在同一房间的连接超过上限时，从最旧的开始断开 */
  private evictOldest(channel: string, playerID: string): void {
    const ns = this.ns;
    const sids = ns?.adapter.rooms.get(channel);
    if (ns === null || sids === undefined) return;
    const mine = [...sids].filter(
      (sid) => (ns.sockets.get(sid)?.data as RoomSocketData | undefined)?.playerID === playerID,
    );
    const excess = mine.length - MAX_ROOM_CONNECTIONS_PER_PLAYER;
    for (const sid of mine.slice(0, Math.max(0, excess))) {
      ns.sockets.get(sid)?.disconnect(true);
    }
  }
}

export type { RoomPayload };
