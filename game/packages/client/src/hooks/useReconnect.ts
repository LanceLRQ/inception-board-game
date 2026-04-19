// useReconnect - 重连状态机 + 用户可见状态标签
// 对照：plans/design/07-backend-network.md §7.4.5 / 08-security-ai.md §8.5.3
//
// 状态：
//   - healthy:      连接正常
//   - reconnecting: 正在重连（socket.io 自动退避）
//   - stale:        长时间未恢复（超过 warnAfterMs），展示提示横幅
//   - dead:         超过 hardCutoffMs，建议退出对局
//
// 逻辑拆分：reconnectReducer 纯函数可单测

import { useEffect, useMemo, useReducer } from 'react';
import type { ConnectionState } from '../lib/wsClient';

export type ReconnectStatus = 'healthy' | 'reconnecting' | 'stale' | 'dead';

export interface ReconnectState {
  readonly status: ReconnectStatus;
  readonly disconnectedAt: number | null;
  readonly attempts: number;
  readonly lastTick: number;
}

export type ReconnectAction =
  | { type: 'connection'; state: ConnectionState; at: number }
  | { type: 'tick'; at: number; warnAfterMs: number; hardCutoffMs: number }
  | { type: 'reset' };

const INITIAL: ReconnectState = {
  status: 'healthy',
  disconnectedAt: null,
  attempts: 0,
  lastTick: 0,
};

/** 状态机转换函数（纯，可测） */
export function reconnectReducer(state: ReconnectState, action: ReconnectAction): ReconnectState {
  switch (action.type) {
    case 'connection': {
      if (action.state === 'connected') {
        return { ...INITIAL, lastTick: action.at };
      }
      if (action.state === 'reconnecting') {
        return {
          ...state,
          status: 'reconnecting',
          disconnectedAt: state.disconnectedAt ?? action.at,
          attempts: state.attempts + 1,
          lastTick: action.at,
        };
      }
      if (action.state === 'disconnected' || action.state === 'failed') {
        return {
          ...state,
          status: action.state === 'failed' ? 'dead' : 'reconnecting',
          disconnectedAt: state.disconnectedAt ?? action.at,
          lastTick: action.at,
        };
      }
      return state;
    }
    case 'tick': {
      if (state.status === 'healthy' || !state.disconnectedAt) return state;
      const elapsed = action.at - state.disconnectedAt;
      if (elapsed >= action.hardCutoffMs) {
        return { ...state, status: 'dead', lastTick: action.at };
      }
      if (elapsed >= action.warnAfterMs) {
        return { ...state, status: 'stale', lastTick: action.at };
      }
      return { ...state, lastTick: action.at };
    }
    case 'reset':
      return INITIAL;
  }
}

export interface UseReconnectOptions {
  readonly connectionState: ConnectionState;
  /** 展示"网络不稳"横幅的时长阈值，默认 3s */
  readonly warnAfterMs?: number;
  /** 硬关阈值，默认 3min */
  readonly hardCutoffMs?: number;
  /** tick 间隔（内部 setInterval 频率），默认 1s */
  readonly tickIntervalMs?: number;
}

export function useReconnect(opts: UseReconnectOptions): ReconnectState {
  const {
    connectionState,
    warnAfterMs = 3_000,
    hardCutoffMs = 180_000,
    tickIntervalMs = 1_000,
  } = opts;
  const [state, dispatch] = useReducer(reconnectReducer, INITIAL);

  // 连接状态驱动的状态机
  useEffect(() => {
    dispatch({ type: 'connection', state: connectionState, at: Date.now() });
  }, [connectionState]);

  // 心跳 tick，推动 reconnecting → stale → dead
  useEffect(() => {
    if (state.status === 'healthy' || state.status === 'dead') return;
    const timer = setInterval(() => {
      dispatch({ type: 'tick', at: Date.now(), warnAfterMs, hardCutoffMs });
    }, tickIntervalMs);
    return () => clearInterval(timer);
  }, [state.status, warnAfterMs, hardCutoffMs, tickIntervalMs]);

  return useMemo(() => state, [state]);
}
