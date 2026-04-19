// WSClient - socket.io-client 的薄封装
// 对照：plans/design/07-backend-network.md §7.4 WebSocket 协议
//
// 职责：
//   - 建立/关闭 socket.io 连接（携带 JWT + matchID 鉴权）
//   - 定时发送心跳（默认 10s）
//   - 断线自动重连（socket.io 内置指数退避，对外暴露状态）
//   - 订阅服务端消息，按 type 分发到监听器
//   - 对外透明的发送接口 send(type, payload)
//
// 设计：通过 factory 注入 io()（socket.io-client），便于单测 mock。

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed';

export interface WSClientOptions {
  readonly url: string;
  readonly path?: string;
  readonly token: string;
  readonly matchID: string;
  /** 心跳间隔毫秒（默认 10s） */
  readonly heartbeatIntervalMs?: number;
  /** 重连尝试次数上限（默认 10） */
  readonly reconnectionAttempts?: number;
  /** 初始重连延迟 ms（默认 500） */
  readonly reconnectionDelayMs?: number;
}

/** socket.io-client 的最小子集（便于 mock） */
export interface SocketLike {
  connected: boolean;
  id?: string;
  connect(): void;
  disconnect(): void;
  emit(event: string, ...args: unknown[]): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener?: (...args: unknown[]) => void): void;
  io?: {
    on(event: string, listener: (...args: unknown[]) => void): void;
  };
}

export type SocketFactory = (url: string, opts: Record<string, unknown>) => SocketLike;

export type StateListener = (state: ConnectionState) => void;
export type MessageListener = (payload: unknown) => void;

export interface WSClientTiming {
  /** 注入用于测试的定时器（默认 setInterval / clearInterval） */
  readonly setInterval?: typeof setInterval;
  readonly clearInterval?: typeof clearInterval;
}

/** 可预测的 WS 客户端。所有副作用通过构造函数依赖注入。 */
export class WSClient {
  private socket: SocketLike | null = null;
  private state: ConnectionState = 'idle';
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastEventSeq = 0;
  private readonly stateListeners = new Set<StateListener>();
  private readonly messageListeners = new Map<string, Set<MessageListener>>();

  private readonly setInt: typeof setInterval;
  private readonly clearInt: typeof clearInterval;

  constructor(
    private readonly opts: WSClientOptions,
    private readonly ioFactory: SocketFactory,
    timing: WSClientTiming = {},
  ) {
    this.setInt = timing.setInterval ?? setInterval;
    this.clearInt = timing.clearInterval ?? clearInterval;
  }

  getState(): ConnectionState {
    return this.state;
  }

  getLastEventSeq(): number {
    return this.lastEventSeq;
  }

  connect(): void {
    if (this.socket) return;
    this.setState('connecting');

    const socket = this.ioFactory(this.opts.url, {
      path: this.opts.path ?? '/ws',
      auth: { token: this.opts.token, matchID: this.opts.matchID },
      reconnection: true,
      reconnectionAttempts: this.opts.reconnectionAttempts ?? 10,
      reconnectionDelay: this.opts.reconnectionDelayMs ?? 500,
      reconnectionDelayMax: 5_000,
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    socket.on('connect', () => {
      this.setState('connected');
      this.startHeartbeat();
      // 重连后：请求增量同步
      this.sendReconnectIfNeeded();
    });

    socket.on('disconnect', (reason: unknown) => {
      this.stopHeartbeat();
      const normalized = String(reason);
      if (normalized === 'io client disconnect' || normalized === 'forced close') {
        this.setState('disconnected');
      } else {
        this.setState('reconnecting');
      }
    });

    socket.on('connect_error', () => {
      this.setState('reconnecting');
    });

    // socket.io 的重连事件（通过 manager）
    socket.io?.on('reconnect_failed', () => {
      this.setState('failed');
    });
    socket.io?.on('reconnect_attempt', () => {
      this.setState('reconnecting');
    });

    // 服务端事件序号维护（所有 icg:* 消息都自带 eventSeq）
    socket.on('icg:patch', (payload: unknown) => {
      const seq = (payload as { eventSeq?: number } | null)?.eventSeq;
      if (typeof seq === 'number' && seq > this.lastEventSeq) {
        this.lastEventSeq = seq;
      }
      this.fireMessage('icg:patch', payload);
    });

    // 通用消息分发
    for (const type of [
      'sync',
      'icg:event',
      'icg:pendingResponse',
      'icg:playerJoin',
      'icg:playerLeave',
      'icg:aiTakeover',
      'icg:chatMessage',
      'icg:error',
    ]) {
      socket.on(type, (payload: unknown) => this.fireMessage(type, payload));
    }

    this.socket = socket;
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.setState('disconnected');
  }

  send(type: string, payload?: unknown): void {
    if (!this.socket || !this.socket.connected) return;
    if (payload === undefined) {
      this.socket.emit(type);
    } else {
      this.socket.emit(type, payload);
    }
  }

  requestReconnectSync(): void {
    this.send('icg:reconnect', {
      type: 'icg:reconnect',
      lastEventSeq: this.lastEventSeq,
    });
  }

  /** 订阅连接状态变化，返回取消函数 */
  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** 订阅某类型消息 */
  onMessage(type: string, listener: MessageListener): () => void {
    let set = this.messageListeners.get(type);
    if (!set) {
      set = new Set();
      this.messageListeners.set(type, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  /** 手动触发心跳（测试用） */
  pulseHeartbeat(): void {
    if (this.socket?.connected) {
      this.socket.emit('icg:heartbeat', { type: 'icg:heartbeat', at: Date.now() });
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const interval = this.opts.heartbeatIntervalMs ?? 10_000;
    this.heartbeatTimer = this.setInt(() => this.pulseHeartbeat(), interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      this.clearInt(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private sendReconnectIfNeeded(): void {
    if (this.lastEventSeq > 0) {
      this.requestReconnectSync();
    }
  }

  private setState(next: ConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    for (const l of this.stateListeners) {
      try {
        l(next);
      } catch {
        // ignore listener errors
      }
    }
  }

  private fireMessage(type: string, payload: unknown): void {
    const set = this.messageListeners.get(type);
    if (!set) return;
    for (const l of set) {
      try {
        l(payload);
      } catch {
        // ignore listener errors
      }
    }
  }
}
