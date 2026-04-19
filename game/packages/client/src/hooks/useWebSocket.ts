// useWebSocket - React hook 包装 WSClient
// 职责：
//   - 构造/析构 WSClient，绑定到组件生命周期
//   - 暴露 state / send / 订阅消息的 React 友好接口
//   - token/matchID 变化时重建连接

import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { WSClient, type ConnectionState, type MessageListener } from '../lib/wsClient';

export interface UseWebSocketOptions {
  readonly url: string;
  readonly path?: string;
  readonly token: string | null;
  readonly matchID: string | null;
  readonly enabled?: boolean;
  readonly heartbeatIntervalMs?: number;
}

export interface UseWebSocketReturn {
  state: ConnectionState;
  lastEventSeq: number;
  send: (type: string, payload?: unknown) => void;
  subscribe: (type: string, listener: MessageListener) => () => void;
  requestReconnectSync: () => void;
}

export function useWebSocket(opts: UseWebSocketOptions): UseWebSocketReturn {
  const clientRef = useRef<WSClient | null>(null);
  const [state, setState] = useState<ConnectionState>('idle');
  const [lastEventSeq, setLastEventSeq] = useState(0);

  const { url, path, token, matchID, enabled = true, heartbeatIntervalMs } = opts;

  useEffect(() => {
    if (!enabled || !token || !matchID) {
      // 无 token/matchID 时不建立连接；上次的 cleanup 已处理析构
      return;
    }

    const client = new WSClient(
      { url, path, token, matchID, heartbeatIntervalMs },
      (u, o) => io(u, o) as never,
    );

    const unsub = client.onStateChange((next) => {
      setState(next);
      setLastEventSeq(client.getLastEventSeq());
    });

    client.connect();
    clientRef.current = client;

    return () => {
      // disconnect 会触发一次 'disconnected' 事件，先 unsub 避免过期 state 更新
      unsub();
      client.disconnect();
      clientRef.current = null;
    };
  }, [enabled, token, matchID, url, path, heartbeatIntervalMs]);

  const send = useCallback((type: string, payload?: unknown) => {
    clientRef.current?.send(type, payload);
  }, []);

  const subscribe = useCallback((type: string, listener: MessageListener) => {
    if (!clientRef.current) return () => {};
    return clientRef.current.onMessage(type, listener);
  }, []);

  const requestReconnectSync = useCallback(() => {
    clientRef.current?.requestReconnectSync();
  }, []);

  return { state, lastEventSeq, send, subscribe, requestReconnectSync };
}
