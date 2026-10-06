// 房间推送连接：房间等待页订阅房间变化（成员增减、补 Bot、开始游戏），替代定时轮询
//
// 不依赖 React；socket 通过构造参数注入。连接挂在服务端的 /rooms 命名空间上，
// 握手带令牌与房间码，只有房间成员能连上；推送内容是房间本身的公开信息，不含对局内的任何状态。

import { io } from 'socket.io-client';
import { logger } from './logger';
import type { RoomState } from './roomApi';
import type { SocketLike } from '../match/matchSocket';

/** 推送是否可用：connected 时页面不需要轮询；其余状态由调用方退回低频轮询 */
export type RoomPushStatus = 'idle' | 'connecting' | 'connected' | 'down';

export const ROOM_EVENT = 'icg:room';
const ROOM_NAMESPACE = '/rooms';
/** 握手被拒的原因：重连也不会成功，不再重试 */
const HANDSHAKE_REJECTIONS = ['AUTH_REQUIRED', 'AUTH_INVALID', 'BANNED', 'NOT_IN_ROOM'];

export interface RoomSocketOptions {
  /** 协议 + 主机 + 端口，不含路径 */
  url: string;
  token: string;
  code: string;
  createSocket: (
    url: string,
    opts: { path: string; auth: { token: string; code: string }; transports: string[] },
  ) => SocketLike;
  /** 收到最新房间状态 */
  onRoom: (room: RoomState) => void;
  onStatus: (status: RoomPushStatus) => void;
  /** 服务端告知本人已不在这个房间里 */
  onRemoved?: () => void;
}

/** 用 socket.io-client 创建房间连接 */
export const createRoomIoSocket: RoomSocketOptions['createSocket'] = (url, opts): SocketLike =>
  io(`${url}${ROOM_NAMESPACE}`, {
    ...opts,
    autoConnect: false,
    reconnection: true,
    // 连不上时重连间隔拉到最长 15 秒：这期间页面靠低频轮询兜底，不必频繁重试
    reconnectionDelayMax: 15_000,
  });

/** 从推送消息里取出房间状态；形状不对返回 null */
export function parseRoomMessage(msg: unknown): RoomState | null {
  if (typeof msg !== 'object' || msg === null) return null;
  const room = (msg as { room?: unknown }).room;
  if (typeof room !== 'object' || room === null) return null;
  const r = room as Partial<RoomState>;
  if (typeof r.code !== 'string' || !Array.isArray(r.players)) return null;
  return r as RoomState;
}

export class RoomSocket {
  private socket: SocketLike | null = null;
  private closed = false;
  private status: RoomPushStatus = 'idle';

  constructor(private readonly options: RoomSocketOptions) {}

  getStatus(): RoomPushStatus {
    return this.status;
  }

  connect(): void {
    if (this.closed || this.socket !== null) return;
    const { url, token, code } = this.options;
    const socket = this.options.createSocket(url, {
      path: '/ws',
      auth: { token, code },
      transports: ['websocket', 'polling'],
    });
    this.socket = socket;
    socket.on('disconnect', (reason: unknown) => this.onDisconnect(String(reason)));
    socket.on('connect_error', (err: unknown) => this.onConnectError(err));
    socket.on(ROOM_EVENT, (msg: unknown) => this.onRoom(msg));
    socket.on('icg:error', (msg: { code?: string }) => this.onServerError(msg));
    this.setStatus('connecting');
    socket.connect();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.off?.('disconnect');
      socket.off?.('connect_error');
      socket.off?.(ROOM_EVENT);
      socket.off?.('icg:error');
      socket.disconnect();
    }
    this.status = 'idle';
  }

  private setStatus(status: RoomPushStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatus(status);
  }

  private onRoom(msg: unknown): void {
    if (this.closed) return;
    const room = parseRoomMessage(msg);
    if (room === null) {
      logger.warn('net/room', 'malformed room message');
      return;
    }
    // 服务端连上就补发一份最新状态，收到第一份才算推送可用
    this.setStatus('connected');
    this.options.onRoom(room);
  }

  private onDisconnect(reason: string): void {
    if (this.closed) return;
    logger.warn('net/room', 'room socket disconnected', { reason });
    this.setStatus('down');
    // 服务端主动断开时底层不会自动重连
    if (reason === 'io server disconnect') this.socket?.connect();
  }

  private onConnectError(err: unknown): void {
    if (this.closed) return;
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('net/room', 'room socket connect error', { message });
    this.setStatus('down');
    if (HANDSHAKE_REJECTIONS.includes(message)) {
      // 重连也不会通过握手；交给轮询兜底
      this.socket?.disconnect();
    }
  }

  private onServerError(msg: { code?: string }): void {
    if (this.closed) return;
    if (msg?.code === 'NOT_IN_ROOM') {
      logger.flow('room', 'removed from room', { code: this.options.code });
      this.options.onRemoved?.();
      this.setStatus('down');
      // 服务端随后会断开；不再自动重连
      this.closed = true;
      this.socket?.disconnect();
      return;
    }
    logger.warn('net/room', 'server error', { code: msg?.code });
  }
}
