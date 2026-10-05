// 远程对局连接：不依赖 React。收发服务端消息，整理出可订阅的快照，并把每次 move 与结果配对

import {
  MATCH_PROTOCOL_VERSION,
  type MatchEvent,
  type MatchViewState,
  type SeatInfo,
  type ServerMatchMessage,
} from '@icgame/game-engine';
import { logger } from '@/lib/logger';
import type { ConnectionState, MoveOutcome } from './matchSource';

/** 连接所需的最小 socket 接口；socket.io-client 的 Socket 可直接赋给它 */
export interface SocketLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, handler: (...args: any[]) => void): unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off?(event: string, handler?: (...args: any[]) => void): unknown;
  emit(event: string, payload?: unknown): unknown;
  connect(): unknown;
  disconnect(): unknown;
  readonly connected: boolean;
}

export interface MatchSocketOptions {
  url: string;
  token: string;
  matchID: string;
  createSocket: (
    url: string,
    opts: {
      path: string;
      auth: { token: string; matchID: string };
      transports: string[];
    },
  ) => SocketLike;
  /** move 结果的等待上限，默认 10000 毫秒 */
  moveTimeoutMs?: number;
  now?: () => number;
  newIntentId?: () => string;
}

export interface MatchSocketSnapshot {
  view: MatchViewState | null;
  seat: string | null;
  seats: readonly SeatInfo[];
  deadlineAt: number | null;
  connection: ConnectionState;
  /** 无法继续的原因：握手被拒、协议版本不符，或连接被同座位的新连接替换 */
  fatal: string | null;
}

const HANDSHAKE_REJECTIONS = ['AUTH_REQUIRED', 'AUTH_INVALID', 'NOT_IN_MATCH'];
const DEFAULT_MOVE_TIMEOUT_MS = 10_000;

const INITIAL: MatchSocketSnapshot = {
  view: null,
  seat: null,
  seats: [],
  deadlineAt: null,
  connection: 'idle',
  fatal: null,
};

interface Pending {
  resolve: (outcome: MoveOutcome) => void;
  timer: ReturnType<typeof setTimeout>;
}

type EventsListener = (events: MatchEvent[], stateID: number) => void;

export class MatchSocket {
  private socket: SocketLike | null = null;
  private snapshot: MatchSocketSnapshot = INITIAL;
  private closed = false;
  private readonly listeners = new Set<() => void>();
  private readonly eventListeners = new Set<EventsListener>();
  private readonly pending = new Map<string, Pending>();
  /** 已交给事件监听的最大版本号 */
  private deliveredStateID = -1;
  private readonly moveTimeoutMs: number;
  private readonly newIntentId: () => string;

  constructor(private readonly options: MatchSocketOptions) {
    this.moveTimeoutMs = options.moveTimeoutMs ?? DEFAULT_MOVE_TIMEOUT_MS;
    this.newIntentId = options.newIntentId ?? (() => crypto.randomUUID());
  }

  connect(): void {
    if (this.closed || this.socket !== null) return;
    const { url, token, matchID } = this.options;
    const socket = this.options.createSocket(url, {
      path: '/ws',
      auth: { token, matchID },
      transports: ['websocket', 'polling'],
    });
    this.socket = socket;
    socket.on('connect', () => this.onConnect());
    socket.on('disconnect', (reason: unknown) => this.onDisconnect(String(reason)));
    socket.on('connect_error', (err: unknown) => this.onConnectError(err));
    socket.on('icg:state', (msg: ServerMatchMessage) => this.onState(msg));
    socket.on('icg:step', (msg: ServerMatchMessage) => this.onStep(msg));
    socket.on('icg:seats', (msg: ServerMatchMessage) => this.onSeats(msg));
    socket.on('icg:moveResult', (msg: ServerMatchMessage) => this.onMoveResult(msg));
    socket.on('icg:error', (msg: { code?: string }) => this.onServerError(msg));
    this.update({ connection: 'connecting' });
    socket.connect();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.listeners.clear();
    this.eventListeners.clear();
    this.settleAll({ ok: false, code: 'not_ready' });
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.off?.('connect');
      socket.off?.('disconnect');
      socket.off?.('connect_error');
      socket.off?.('icg:state');
      socket.off?.('icg:step');
      socket.off?.('icg:seats');
      socket.off?.('icg:moveResult');
      socket.off?.('icg:error');
      socket.disconnect();
    }
    this.snapshot = { ...this.snapshot, connection: 'disconnected' };
  }

  getSnapshot(): MatchSocketSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onEvents(listener: EventsListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  sendMove(move: string, args: unknown[] = []): Promise<MoveOutcome> {
    const socket = this.socket;
    const { view, connection } = this.snapshot;
    if (this.closed || socket === null || view === null || connection !== 'connected') {
      return Promise.resolve({ ok: false, code: 'not_ready' });
    }
    const intentId = this.newIntentId();
    return new Promise<MoveOutcome>((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(intentId)) {
          logger.warn('game/move', 'move timed out', { move });
          resolve({ ok: false, code: 'timeout' });
          this.requestSync();
        }
      }, this.moveTimeoutMs);
      this.pending.set(intentId, { resolve, timer });
      socket.emit('icg:move', {
        type: 'icg:move',
        move,
        args,
        intentId,
        stateID: view.stateID,
      });
    });
  }

  /** 向服务端要一份最新状态；只发一次，服务端限流时不重试 */
  requestSync(): void {
    if (this.closed || this.socket === null) return;
    this.socket.emit('icg:sync', { type: 'icg:sync' });
  }

  private onConnect(): void {
    if (this.snapshot.fatal !== null) return;
    // 真正可用要等服务端发来 icg:state
    logger.flow('net/ws', 'socket connected', { matchID: this.options.matchID });
  }

  private onDisconnect(reason: string): void {
    if (this.closed) return;
    this.settleAll({ ok: false, code: 'timeout' });
    if (this.snapshot.fatal !== null) return;
    if (reason === 'io client disconnect') {
      this.update({ connection: 'disconnected' });
      return;
    }
    this.update({ connection: 'reconnecting' });
    // 服务端主动断开时底层不会自动重连
    if (reason === 'io server disconnect') this.socket?.connect();
  }

  private onConnectError(err: unknown): void {
    if (this.closed) return;
    const message = err instanceof Error ? err.message : String(err);
    if (HANDSHAKE_REJECTIONS.includes(message)) {
      this.fail(message);
      return;
    }
    logger.warn('net/ws', 'connect error', { message });
    // 已连上后的掉线与首次就连不上，都进入重连状态
    const { connection } = this.snapshot;
    if (connection === 'connected' || connection === 'connecting') {
      this.update({ connection: 'reconnecting' });
    }
  }

  private onServerError(msg: { code?: string }): void {
    if (this.closed) return;
    if (msg?.code === 'REPLACED') {
      this.fail('REPLACED');
      return;
    }
    logger.warn('net/ws', 'server error', { code: msg?.code });
  }

  private onState(msg: ServerMatchMessage): void {
    if (this.closed || msg.type !== 'icg:state') return;
    if (msg.protocol !== MATCH_PROTOCOL_VERSION) {
      this.fail('PROTOCOL_MISMATCH');
      return;
    }
    const current = this.snapshot.view;
    if (current !== null && msg.view.stateID < current.stateID) return;
    if (current !== null && msg.view.stateID === current.stateID) {
      // 同一版本：视图不动，只更新座位表与截止时间
      this.update({
        seat: msg.seat,
        seats: msg.seats,
        deadlineAt: msg.deadlineAt,
        connection: 'connected',
      });
      return;
    }
    this.update({
      view: msg.view,
      seat: msg.seat,
      seats: msg.seats,
      deadlineAt: msg.deadlineAt,
      connection: 'connected',
    });
  }

  private onStep(msg: ServerMatchMessage): void {
    if (this.closed || msg.type !== 'icg:step') return;
    const current = this.snapshot.view;
    const stateID = msg.view.stateID;
    if (current !== null && stateID <= current.stateID) {
      // 同一版本的视图已经由 icg:state 带来，但这一步的事件还没交出去
      if (stateID === current.stateID && stateID > this.deliveredStateID) {
        this.deliverEvents(msg.events, stateID);
      }
      return;
    }
    this.update({
      view: msg.view,
      seat: msg.seat,
      seats: msg.seats,
      deadlineAt: msg.deadlineAt,
    });
    this.deliverEvents(msg.events, stateID);
  }

  private onSeats(msg: ServerMatchMessage): void {
    if (this.closed || msg.type !== 'icg:seats') return;
    this.update({ seats: msg.seats });
  }

  private onMoveResult(msg: ServerMatchMessage): void {
    if (this.closed || msg.type !== 'icg:moveResult') return;
    const entry = this.pending.get(msg.intentId);
    if (!entry) return;
    this.pending.delete(msg.intentId);
    clearTimeout(entry.timer);
    if (msg.ok) {
      entry.resolve({ ok: true });
    } else {
      logger.warn('game/move', 'move rejected', { code: msg.code });
      entry.resolve({ ok: false, code: msg.code });
    }
  }

  private deliverEvents(events: MatchEvent[], stateID: number): void {
    this.deliveredStateID = Math.max(this.deliveredStateID, stateID);
    for (const l of [...this.eventListeners]) l(events, stateID);
  }

  /** 无法继续：记下原因、断开，并关掉底层的自动重连 */
  private fail(reason: string): void {
    logger.flow('net/ws', 'connection failed', { reason });
    this.settleAll({ ok: false, code: 'timeout' });
    this.update({ fatal: reason, connection: 'failed' });
    this.socket?.disconnect();
  }

  private settleAll(outcome: MoveOutcome): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      this.pending.delete(id);
      entry.resolve(outcome);
    }
  }

  private update(patch: Partial<MatchSocketSnapshot>): void {
    const prev = this.snapshot;
    const next = { ...prev, ...patch };
    const keys = Object.keys(next) as Array<keyof MatchSocketSnapshot>;
    if (keys.every((k) => prev[k] === next[k])) return;
    this.snapshot = next;
    if (prev.connection !== next.connection) {
      logger.flow('net/ws', `connection ${prev.connection} -> ${next.connection}`);
    }
    for (const l of [...this.listeners]) l();
  }
}
