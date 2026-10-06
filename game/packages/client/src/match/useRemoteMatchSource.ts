// 远程对局来源：把 MatchSocket 的快照包成对局来源

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createIoSocket } from './createIoSocket';
import { MatchSocket, type MatchSocketSnapshot } from './matchSocket';
import { isSelfTakenOver, type MatchSource, type MoveOutcome } from './matchSource';

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
    makeMove: sendMove,
    resume,
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

  const resume = useCallback(() => socket?.resume(), [socket]);

  return useMemo(() => toMatchSource(snapshot, sendMove, resume), [snapshot, sendMove, resume]);
}
