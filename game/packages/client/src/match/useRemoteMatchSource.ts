// 远程对局来源：把 MatchSocket 的快照包成对局来源

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { usePageVisibility } from '../hooks/usePageVisibility';
import { submitMatchReport, type ReportChannel } from '../lib/reportApi';
import { createIoSocket } from './createIoSocket';
import { MatchSocket, type MatchSocketSnapshot } from './matchSocket';
import { isSelfTakenOver, type MatchSource, type MoveOutcome } from './matchSource';
import { NO_EVENTS, type EventFeed } from './eventFeed';

export interface RemoteMatchParams {
  url: string;
  token: string;
  matchID: string;
}

/** 连接快照 → 对局来源（纯函数） */
export function toMatchSource(
  snapshot: MatchSocketSnapshot,
  sendMove: (move: string, args?: unknown[]) => Promise<MoveOutcome>,
  resume: () => void,
  sendChat: (presetId: string) => boolean = () => false,
  report: ReportChannel | null = null,
  events: EventFeed = NO_EVENTS,
): MatchSource {
  return {
    kind: 'remote',
    view: snapshot.view,
    seat: snapshot.seat,
    seats: snapshot.seats,
    deadlineAt: snapshot.deadlineAt,
    connection: snapshot.connection,
    storageDegraded: snapshot.storageDegraded,
    error: snapshot.fatal === null ? null : `match.fatal.${snapshot.fatal}`,
    selfTakenOver: isSelfTakenOver(snapshot.seats, snapshot.seat),
    chat: {
      available: snapshot.connection === 'connected',
      messages: snapshot.chat,
      send: sendChat,
    },
    report,
    events,
    makeMove: sendMove,
    resume,
  };
}

/** 连接上的逐步事件 → 事件通道；还没连上时没有事件 */
export function eventFeedOf(socket: Pick<MatchSocket, 'onEvents'> | null): EventFeed {
  if (socket === null) return NO_EVENTS;
  return {
    subscribe: (listener) => socket.onEvents((events, stateID) => listener({ stateID, events })),
  };
}

const NOT_READY: MoveOutcome = { ok: false, code: 'not_ready' };

const EMPTY_SNAPSHOT: MatchSocketSnapshot = {
  view: null,
  seat: null,
  seats: [],
  deadlineAt: null,
  connection: 'connecting',
  storageDegraded: false,
  fatal: null,
  chat: [],
};

const noopUnsubscribe = (): void => {};

export function useRemoteMatchSource({ url, token, matchID }: RemoteMatchParams): MatchSource {
  // 连接实例的创建与关闭成对放在 effect 里；严格模式下 effect 跑两遍也各自配对
  const [socket, setSocket] = useState<MatchSocket | null>(null);
  useEffect(() => {
    const created = new MatchSocket({ url, token, matchID, createSocket: createIoSocket });
    created.connect();
    let live = true;
    queueMicrotask(() => {
      if (live) setSocket(created);
    });
    return () => {
      live = false;
      created.close();
      setSocket(null);
    };
  }, [url, token, matchID]);

  const subscribe = useCallback(
    (listener: () => void) => (socket ? socket.subscribe(listener) : noopUnsubscribe),
    [socket],
  );
  const getSnapshot = useCallback(() => (socket ? socket.getSnapshot() : EMPTY_SNAPSHOT), [socket]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const sendMove = useCallback(
    (move: string, args: unknown[] = []) =>
      socket ? socket.sendMove(move, args) : Promise.resolve(NOT_READY),
    [socket],
  );

  // 页面从后台回到前台：还连着就补一份最新状态，断线中就立即重连
  const visibility = useMemo(() => ({ onReturn: () => socket?.returnToForeground() }), [socket]);
  usePageVisibility(visibility);

  const resume = useCallback(() => socket?.resume(), [socket]);
  const sendChat = useCallback(
    (presetId: string) => (socket ? socket.sendChat(presetId) : false),
    [socket],
  );

  // 举报走 HTTP 接口，与连接状态无关；座位号换成数字，服务端按座位找到对应账号
  const report = useMemo<ReportChannel>(
    () => ({
      submit: (seat, reason, description) =>
        submitMatchReport(matchID, Number(seat), reason, description),
    }),
    [matchID],
  );

  const events = useMemo(() => eventFeedOf(socket), [socket]);

  return useMemo(
    () => toMatchSource(snapshot, sendMove, resume, sendChat, report, events),
    [snapshot, sendMove, resume, sendChat, report, events],
  );
}
