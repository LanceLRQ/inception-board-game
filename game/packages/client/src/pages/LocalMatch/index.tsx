// LocalMatch · 人机对战页面
// 对照：plans/design/08-security-ai.md §8.5 / plans/tasks.md W9
//
// 交互流：
//   1. 选择人数 → Worker 创建本地 BGIO 对局
//   2. 人类玩家 0 的回合 → 显示可操作按钮
//   3. Bot 回合 → Worker 内 SimpleBot 自动执行
//   4. 游戏结束 → 显示胜负

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Comlink from 'comlink';
import { useTranslation } from 'react-i18next';
import type { LocalMatchWorker } from '../../workers/localMatch.worker';
import { cn } from '../../lib/utils';
import { Users, Play, ArrowRight, Skull, Trophy, RotateCcw } from 'lucide-react';

type BGIOState = {
  G: Record<string, unknown>;
  ctx: Record<string, unknown>;
};

export default function LocalMatch() {
  const { t } = useTranslation();
  const [playerCount, setPlayerCount] = useState(4);
  const [gameState, setGameState] = useState<BGIOState | null>(null);
  const [_isReady, setIsReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const apiRef = useRef<Comlink.Remote<LocalMatchWorker> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshState = useCallback(async () => {
    if (apiRef.current) {
      try {
        const state = await apiRef.current.getState();
        setGameState(state as BGIOState | null);
      } catch {
        // Worker 可能已关闭
      }
    }
  }, []);

  const startMatch = useCallback(async () => {
    setError(null);
    try {
      if (apiRef.current) {
        await apiRef.current.createLocalMatch(playerCount);
        setStarted(true);
        setIsReady(true);
        await refreshState();
      }
    } catch (e) {
      setError((e as Error).message);
    }
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

  const restartMatch = useCallback(async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    workerRef.current?.terminate();
    setStarted(false);
    setIsReady(false);
    setGameState(null);
    setError(null);

    const worker = new Worker(new URL('../../workers/localMatch.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    const api = Comlink.wrap<LocalMatchWorker>(worker);
    apiRef.current = api;
  }, []);

  // 初始化 Worker
  useEffect(() => {
    const worker = new Worker(new URL('../../workers/localMatch.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    const api = Comlink.wrap<LocalMatchWorker>(worker);
    apiRef.current = api;

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      worker.terminate();
    };
  }, []);

  // 轮询状态（Bot 自动执行后需要刷新）
  useEffect(() => {
    if (!started) return;
    pollRef.current = setInterval(refreshState, 500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [started, refreshState]);

  // === 游戏未开始：人数选择界面 ===
  if (!started) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-foreground">
        <h1 className="mb-6 text-2xl font-bold">
          <Users className="mr-2 inline-block h-6 w-6" />
          {t('localMatch.title', { defaultValue: '人机对战' })}
        </h1>

        <div className="mb-6 flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            {t('localMatch.playerCount', { defaultValue: '玩家人数' })}
          </span>
          {[4, 5, 6].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPlayerCount(n)}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-colors',
                playerCount === n
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70',
              )}
            >
              {n}
            </button>
          ))}
        </div>

        <p className="mb-4 text-xs text-muted-foreground">
          {t('localMatch.humanPlusBot', {
            count: playerCount - 1,
            defaultValue: `你 + ${playerCount - 1} 个 AI`,
          })}
        </p>

        <button
          type="button"
          onClick={startMatch}
          className="flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-95"
        >
          <Play className="h-4 w-4" />
          {t('localMatch.start', { defaultValue: '开始游戏' })}
        </button>

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  // === 游戏中/结束 ===
  const G = gameState?.G as Record<string, unknown> | undefined;
  const ctx = gameState?.ctx as Record<string, unknown> | undefined;
  const winner = G?.winner as string | null;
  const turnNumber = (G?.turnNumber as number) ?? 0;
  const turnPhase = (G?.turnPhase as string) ?? '';
  const currentPlayerID = (ctx?.currentPlayer as string) ?? '';
  const isHumanTurn = currentPlayerID === '0';
  const players = G?.players as Record<string, Record<string, unknown>> | undefined;
  const humanPlayer = players?.['0'];

  return (
    <div className="min-h-screen bg-background p-4 text-foreground">
      {/* 顶部状态栏 */}
      <div className="mb-4 flex items-center justify-between rounded-lg bg-card px-4 py-2 shadow-sm">
        <div className="text-sm">
          {t('localMatch.turn', { defaultValue: '回合' })} {turnNumber}
          <span className="ml-2 text-muted-foreground">
            {t(`localMatch.phase.${turnPhase}`, { defaultValue: turnPhase })}
          </span>
        </div>
        <div
          className={cn(
            'text-sm font-medium',
            isHumanTurn ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          {isHumanTurn
            ? t('localMatch.yourTurn', { defaultValue: '你的回合' })
            : t('localMatch.botTurn', { defaultValue: `AI ${currentPlayerID} 回合` })}
        </div>
      </div>

      {/* 胜负结果 */}
      {winner && (
        <div className="mb-4 rounded-lg bg-card p-6 text-center shadow-md">
          <Trophy className="mx-auto mb-2 h-8 w-8 text-yellow-500" />
          <h2 className="text-xl font-bold">
            {winner === 'thief'
              ? t('localMatch.thiefWins', { defaultValue: '盗梦者获胜！' })
              : t('localMatch.masterWins', { defaultValue: '梦主获胜！' })}
          </h2>
          <button
            type="button"
            onClick={restartMatch}
            className="mt-4 flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            <RotateCcw className="h-4 w-4" />
            {t('localMatch.restart', { defaultValue: '再来一局' })}
          </button>
        </div>
      )}

      {/* 人类玩家信息 */}
      {humanPlayer && (
        <div className="mb-4 rounded-lg border border-border bg-card p-4">
          <div className="mb-2 text-sm font-medium">
            {t('localMatch.yourInfo', { defaultValue: '你的状态' })}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>
              {t('localMatch.faction', { defaultValue: '阵营' })}：{String(humanPlayer.faction)}
            </span>
            <span>
              {t('localMatch.layer', { defaultValue: '层' })}：{String(humanPlayer.currentLayer)}
            </span>
            <span>
              {t('localMatch.alive', { defaultValue: '存活' })}：
              {humanPlayer.isAlive ? 'Yes' : 'No'}
            </span>
          </div>
          {Array.isArray(humanPlayer.hand) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {(humanPlayer.hand as string[]).map((card, i) => (
                <span
                  key={`${card}-${i}`}
                  className="rounded border border-border bg-muted px-2 py-0.5 text-xs"
                >
                  {card}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 操作区 */}
      {isHumanTurn && !winner && (
        <div className="mb-4 flex flex-wrap gap-2">
          {turnPhase === 'draw' && (
            <button
              type="button"
              onClick={() => makeMove('doDraw')}
              className="flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground"
            >
              {t('localMatch.draw', { defaultValue: '抽牌' })}
            </button>
          )}
          {turnPhase === 'action' && (
            <>
              <button
                type="button"
                onClick={() => makeMove('endActionPhase')}
                className="flex items-center gap-1 rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground"
              >
                <ArrowRight className="h-4 w-4" />
                {t('localMatch.endAction', { defaultValue: '结束行动' })}
              </button>
            </>
          )}
          {turnPhase === 'discard' && (
            <button
              type="button"
              onClick={() => makeMove('skipDiscard')}
              className="flex items-center gap-1 rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground"
            >
              {t('localMatch.skipDiscard', { defaultValue: '跳过弃牌' })}
            </button>
          )}
        </div>
      )}

      {/* 玩家列表 */}
      {players && (
        <div className="space-y-2">
          {Object.entries(players).map(([id, p]) => (
            <div
              key={id}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-3 py-2 text-sm',
                id === currentPlayerID ? 'border-primary bg-primary/5' : 'border-border bg-card',
                id === '0' && 'ring-1 ring-primary/30',
              )}
            >
              <span className="font-medium">
                {id === '0' ? t('localMatch.you', { defaultValue: '你' }) : `AI ${id}`}
              </span>
              <span className="text-xs text-muted-foreground">{String(p.faction)}</span>
              <span className="text-xs text-muted-foreground">L{String(p.currentLayer)}</span>
              {!p.isAlive && <Skull className="h-3 w-3 text-destructive" />}
              <span className="ml-auto text-xs text-muted-foreground">
                {t('localMatch.cards', { defaultValue: '牌' })}：
                {(p.hand as unknown[])?.length ?? 0}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 等待状态 */}
      {!gameState && started && (
        <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
          {t('localMatch.loading', { defaultValue: '加载中...' })}
        </div>
      )}
    </div>
  );
}
