// 本地对局运行时 · 抽离自 /local 页，可复用于好友房 1 人类+N AI 模式
// 对照：plans/design/08-security-ai.md §8.5 L0 Bot

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Comlink from 'comlink';
import { useTranslation } from 'react-i18next';
import { ArrowRight, RotateCcw, Skull, Trophy } from 'lucide-react';
import type { LocalMatchWorker } from '../../workers/localMatch.worker';
import { cn } from '../../lib/utils';
import { logger } from '../../lib/logger';

export type BGIOState = {
  G: Record<string, unknown>;
  ctx: Record<string, unknown>;
};

interface LocalMatchRuntimeProps {
  readonly playerCount: number;
  /** 可选外部 matchID（好友房从服务端拿到） */
  readonly matchId?: string;
  /** 顶部状态栏右上角补充文字（好友房可显示房间码） */
  readonly topRight?: React.ReactNode;
  /** 结束/重开回调；未传则显示内置"再来一局"按钮 */
  readonly onRestart?: () => void;
}

export function LocalMatchRuntime({
  playerCount,
  matchId,
  topRight,
  onRestart,
}: LocalMatchRuntimeProps) {
  const { t } = useTranslation();
  const [gameState, setGameState] = useState<BGIOState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const apiRef = useRef<Comlink.Remote<LocalMatchWorker> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [restartTick, setRestartTick] = useState(0);

  const refreshState = useCallback(async () => {
    if (!apiRef.current) return;
    try {
      const state = await apiRef.current.getState();
      setGameState(state as BGIOState | null);
    } catch {
      /* worker 可能关闭 */
    }
  }, []);

  // 初始化 + 启动
  useEffect(() => {
    const worker = new Worker(new URL('../../workers/localMatch.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    const api = Comlink.wrap<LocalMatchWorker>(worker);
    apiRef.current = api;

    logger.flow('game', 'runtime mount', { playerCount, matchId });
    void api
      .createLocalMatch(playerCount, matchId)
      .then(() => refreshState())
      .catch((e) => {
        logger.error('game', 'createLocalMatch failed', e);
        setError((e as Error).message);
      });

    pollRef.current = setInterval(() => void refreshState(), 500);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      worker.terminate();
    };
  }, [playerCount, matchId, refreshState, restartTick]);

  const makeMove = useCallback(
    async (move: string, args: unknown[] = []) => {
      if (!apiRef.current) return;
      await apiRef.current.makeMove(move, args);
      await refreshState();
    },
    [refreshState],
  );

  const handleRestart = useCallback(() => {
    if (onRestart) onRestart();
    else setRestartTick((n) => n + 1);
  }, [onRestart]);

  const G = gameState?.G as Record<string, unknown> | undefined;
  const ctx = gameState?.ctx as Record<string, unknown> | undefined;
  const winner = G?.winner as string | null;

  // 胜负一旦产生，打一次 INFO
  useEffect(() => {
    if (winner) logger.flow('game', 'match ended', { winner });
  }, [winner]);
  const turnNumber = (G?.turnNumber as number) ?? 0;
  const turnPhase = (G?.turnPhase as string) ?? '';
  const currentPlayerID = (ctx?.currentPlayer as string) ?? '';
  const isHumanTurn = currentPlayerID === '0';
  const players = G?.players as Record<string, Record<string, unknown>> | undefined;
  const humanPlayer = players?.['0'];

  // 人类弃牌交互：超过手牌上限（5）时必须选择要弃的牌
  const HAND_LIMIT = 5;
  const humanHand = (humanPlayer?.hand as string[]) ?? [];
  const overHand = Math.max(0, humanHand.length - HAND_LIMIT);
  const [selectedDiscard, setSelectedDiscard] = useState<string[]>([]);

  // 仅保留仍在手牌 + 当前确实在 discard 阶段的选中，避免 stale 残留
  const effectiveSelected =
    turnPhase === 'discard' && isHumanTurn
      ? selectedDiscard.filter((c) => humanHand.includes(c))
      : [];

  const toggleDiscard = useCallback(
    (card: string) => {
      setSelectedDiscard((prev) => {
        const idx = prev.indexOf(card);
        if (idx >= 0) {
          const next = [...prev];
          next.splice(idx, 1);
          return next;
        }
        if (prev.length >= overHand) return prev; // 不能超过要弃数量
        return [...prev, card];
      });
    },
    [overHand],
  );

  return (
    <div className="min-h-screen bg-background p-4 text-foreground" data-testid="local-runtime">
      <div className="mb-4 flex items-center justify-between rounded-lg bg-card px-4 py-2 shadow-sm">
        <div className="text-sm">
          {t('localMatch.turn')} {turnNumber}
          <span className="ml-2 text-muted-foreground">{t(`localMatch.phase.${turnPhase}`)}</span>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'text-sm font-medium',
              isHumanTurn ? 'text-primary' : 'text-muted-foreground',
            )}
            data-testid="turn-indicator"
          >
            {isHumanTurn
              ? t('localMatch.yourTurn')
              : t('localMatch.botTurn', { id: currentPlayerID })}
          </div>
          {topRight}
        </div>
      </div>

      {winner && (
        <div
          className="mb-4 rounded-lg bg-card p-6 text-center shadow-md"
          data-testid="winner-banner"
        >
          <Trophy className="mx-auto mb-2 h-8 w-8 text-yellow-500" />
          <h2 className="text-xl font-bold">
            {winner === 'thief' ? t('localMatch.thiefWins') : t('localMatch.masterWins')}
          </h2>
          <button
            type="button"
            onClick={handleRestart}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground"
            data-testid="restart-button"
          >
            <RotateCcw className="h-4 w-4" />
            {t('localMatch.restart')}
          </button>
        </div>
      )}

      {humanPlayer && (
        <div className="mb-4 rounded-lg border border-border bg-card p-4">
          <div className="mb-2 text-sm font-medium">{t('localMatch.yourInfo')}</div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>
              {t('localMatch.faction')}：{String(humanPlayer.faction)}
            </span>
            <span>
              {t('localMatch.layer')}：{String(humanPlayer.currentLayer)}
            </span>
            <span>
              {t('localMatch.alive')}：{humanPlayer.isAlive ? 'Yes' : 'No'}
            </span>
          </div>
          {Array.isArray(humanPlayer.hand) && (
            <>
              {turnPhase === 'discard' && overHand > 0 && isHumanTurn && (
                <div className="mt-2 text-xs text-amber-500">
                  {t('localMatch.mustDiscard', { n: overHand })}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1" data-testid="human-hand">
                {(humanPlayer.hand as string[]).map((card, i) => {
                  const selectable =
                    turnPhase === 'discard' && overHand > 0 && isHumanTurn && !winner;
                  const selected = effectiveSelected.includes(card);
                  return (
                    <button
                      key={`${card}-${i}`}
                      type="button"
                      disabled={!selectable}
                      onClick={() => selectable && toggleDiscard(card)}
                      className={cn(
                        'rounded border px-2 py-0.5 text-xs transition-colors',
                        selected
                          ? 'border-destructive bg-destructive/20 text-destructive'
                          : 'border-border bg-muted',
                        selectable && !selected && 'hover:border-primary/60',
                      )}
                      data-testid={`card-${i}`}
                    >
                      {card}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {isHumanTurn && !winner && (
        <div className="mb-4 flex flex-wrap gap-2">
          {turnPhase === 'draw' && (
            <button
              type="button"
              onClick={() => void makeMove('doDraw')}
              className="flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground"
              data-testid="action-draw"
            >
              {t('localMatch.draw')}
            </button>
          )}
          {turnPhase === 'action' && (
            <button
              type="button"
              onClick={() => void makeMove('endActionPhase')}
              className="flex items-center gap-1 rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground"
              data-testid="action-end"
            >
              <ArrowRight className="h-4 w-4" />
              {t('localMatch.endAction')}
            </button>
          )}
          {turnPhase === 'discard' && overHand === 0 && (
            <button
              type="button"
              onClick={() => void makeMove('skipDiscard')}
              className="flex items-center gap-1 rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground"
              data-testid="action-skip-discard"
            >
              {t('localMatch.skipDiscard')}
            </button>
          )}
          {turnPhase === 'discard' && overHand > 0 && (
            <button
              type="button"
              disabled={effectiveSelected.length !== overHand}
              onClick={() => {
                void makeMove('doDiscard', [effectiveSelected]);
                setSelectedDiscard([]);
              }}
              className="flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
              data-testid="action-confirm-discard"
            >
              {t('localMatch.confirmDiscard', {
                selected: effectiveSelected.length,
                required: overHand,
              })}
            </button>
          )}
        </div>
      )}

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
              <span className="font-medium">{id === '0' ? t('localMatch.you') : `AI ${id}`}</span>
              <span className="text-xs text-muted-foreground">{String(p.faction)}</span>
              <span className="text-xs text-muted-foreground">L{String(p.currentLayer)}</span>
              {!p.isAlive && <Skull className="h-3 w-3 text-destructive" />}
              <span className="ml-auto text-xs text-muted-foreground">
                {t('localMatch.cards')}：{(p.hand as unknown[])?.length ?? 0}
              </span>
            </div>
          ))}
        </div>
      )}

      {!gameState && (
        <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
          {t('localMatch.loading')}
        </div>
      )}

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </div>
  );
}
