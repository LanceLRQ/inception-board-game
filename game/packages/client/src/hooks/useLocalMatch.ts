import { useCallback, useEffect, useRef, useState } from 'react';
import * as Comlink from 'comlink';
import type { LocalMatchWorker } from '../workers/localMatch.worker';

export function useLocalMatch(playerCount: number) {
  const [gameState, setGameState] = useState<unknown>(null);
  const [isReady, setIsReady] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const apiRef = useRef<Comlink.Remote<LocalMatchWorker> | null>(null);

  const refreshState = useCallback(async () => {
    if (apiRef.current) {
      const state = await apiRef.current.getState();
      setGameState(state);
    }
  }, []);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/localMatch.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    const api = Comlink.wrap<LocalMatchWorker>(worker);
    apiRef.current = api;

    api
      .createLocalMatch(playerCount)
      .then(() => {
        setIsReady(true);
        refreshState();
      })
      .catch(console.error);

    return () => {
      worker.terminate();
    };
  }, [playerCount, refreshState]);

  const makeMove = useCallback(
    async (move: string, args: unknown[] = []) => {
      if (apiRef.current) {
        await apiRef.current.makeMove(move, args);
        await refreshState();
      }
    },
    [refreshState],
  );

  return { gameState, isReady, makeMove };
}
