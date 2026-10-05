// 本地人机对局来源：Worker 的创建、定时取状态与发 move 都收在这里

import { useEffect, useState } from 'react';
import * as Comlink from 'comlink';
import type { MatchViewState, SeatInfo } from '@icgame/game-engine';
import type { RejectReason } from '@icgame/game-engine/runner';
import type { LocalMatchWorker } from '../workers/localMatch.worker';
import { LOCAL_HUMAN_SEAT } from '../workers/localSeat';
import { logger } from '../lib/logger';
import type { ConnectionState, MatchSource, MoveOutcome } from './matchSource';

/** 取状态的间隔（毫秒） */
export const LOCAL_POLL_INTERVAL_MS = 500;

/** 控制器依赖的 Worker 接口（Comlink 代理与测试里的假实现都满足） */
export interface LocalMatchApi {
  getState(): Promise<unknown>;
  makeMove(
    move: string,
    args: unknown[],
  ): Promise<{ ok: true } | { ok: false; reason: RejectReason } | null>;
}

export interface LocalSourceController {
  getSnapshot(): MatchSource;
  /** 重新取一次状态；失败时保留旧快照 */
  refresh(): Promise<void>;
  /** 记录建局失败 */
  fail(message: string): void;
  subscribe(listener: () => void): () => void;
}

/** 从视图里读玩家昵称；视图里没有就退回座位号 */
function nicknameIn(view: MatchViewState, seat: string): string {
  const players = (view.G as { players?: Record<string, { nickname?: unknown }> } | null)?.players;
  const nick = players?.[seat]?.nickname;
  return typeof nick === 'string' && nick ? nick : seat;
}

/** 本地来源的座位表：除本人外都是 Bot，都在线 */
function buildSeats(view: MatchViewState): SeatInfo[] {
  return view.ctx.playOrder.map((seat) => ({
    seat,
    nickname: nicknameIn(view, seat),
    isBot: seat !== LOCAL_HUMAN_SEAT,
    connected: true,
    takenOver: false,
  }));
}

/** 与 React 无关的来源控制器，便于直接测试 */
export function createLocalSourceController(api: LocalMatchApi): LocalSourceController {
  const listeners = new Set<() => void>();
  let view: MatchViewState | null = null;
  let seats: SeatInfo[] = [];
  let connection: ConnectionState = 'connecting';
  let error: string | null = null;
  let snapshot: MatchSource;

  const notify = (): void => {
    snapshot = build();
    listeners.forEach((l) => l());
  };

  const refresh = async (): Promise<void> => {
    try {
      const state = (await api.getState()) as MatchViewState | null;
      if (state === null) return;
      view = state;
      seats = buildSeats(state);
      connection = 'connected';
      notify();
    } catch {
      /* worker 可能已关闭 */
    }
  };

  const makeMove = async (move: string, args: unknown[] = []): Promise<MoveOutcome> => {
    const result = await api.makeMove(move, args);
    await refresh();
    if (result === null) return { ok: false, code: 'not_ready' };
    return result.ok ? { ok: true } : { ok: false, code: result.reason };
  };

  function build(): MatchSource {
    return {
      kind: 'local',
      view,
      seat: view === null ? null : LOCAL_HUMAN_SEAT,
      seats,
      deadlineAt: null,
      connection,
      error,
      makeMove,
    };
  }
  snapshot = build();

  return {
    getSnapshot: () => snapshot,
    refresh,
    fail(message) {
      error = message;
      connection = 'failed';
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export interface UseLocalMatchSourceOptions {
  playerCount: number;
  matchId?: string;
  /** 递增后丢弃当前对局，重新建一局 */
  restartKey?: number;
}

/** 起一个本机 Worker 跑人机对局，返回对局来源 */
export function useLocalMatchSource({
  playerCount,
  matchId,
  restartKey = 0,
}: UseLocalMatchSourceOptions): MatchSource {
  const [source, setSource] = useState<MatchSource | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/localMatch.worker.ts', import.meta.url), {
      type: 'module',
    });
    const api = Comlink.wrap<LocalMatchWorker>(worker);
    const controller = createLocalSourceController(api);
    const off = controller.subscribe(() => setSource(controller.getSnapshot()));

    void api
      .createLocalMatch(playerCount, matchId)
      .then(() => controller.refresh())
      .catch((e) => {
        logger.error('game', 'createLocalMatch failed', e);
        controller.fail((e as Error).message);
      });
    const poll = setInterval(() => void controller.refresh(), LOCAL_POLL_INTERVAL_MS);

    return () => {
      clearInterval(poll);
      off();
      worker.terminate();
    };
  }, [playerCount, matchId, restartKey]);

  return source ?? IDLE_SOURCE;
}

/** 首次渲染、Worker 还没建好时的占位来源 */
const IDLE_SOURCE: MatchSource = {
  kind: 'local',
  view: null,
  seat: null,
  seats: [],
  deadlineAt: null,
  connection: 'idle',
  error: null,
  makeMove: async () => ({ ok: false, code: 'not_ready' }),
};
