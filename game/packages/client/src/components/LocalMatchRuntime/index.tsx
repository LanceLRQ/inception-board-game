// 本地对局运行时 · 抽离自 /local 页，可复用于好友房 1 人类+N AI 模式
// 对照：plans/design/08-security-ai.md §8.5 L0 Bot

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Comlink from 'comlink';
import { useTranslation } from 'react-i18next';
import { ArrowRight, RotateCcw, Skull, Trophy } from 'lucide-react';
import type { LocalMatchWorker } from '../../workers/localMatch.worker';
import { cn } from '../../lib/utils';
import { logger } from '../../lib/logger';
import { actionMoveFor, getCardName, getCharacterSkillSummary } from '../../lib/cards';
import { LayerMap } from '../LayerMap';

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

function CharacterSummary({ characterId }: { characterId: string }) {
  const summary = getCharacterSkillSummary(characterId);
  if (!summary) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs text-primary"
      title={summary.skills.map((s) => `${s.name}：${s.description}`).join('\n')}
      data-testid="human-character"
    >
      <span className="font-medium">{summary.name}</span>
      {summary.skills[0] && (
        <span className="text-muted-foreground">· {summary.skills[0].name}</span>
      )}
    </span>
  );
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
  const layersRaw = G?.layers as Record<number, Record<string, unknown>> | undefined;
  const vaultsRaw = G?.vaults as Array<Record<string, unknown>> | undefined;
  const dreamMasterID = (G?.dreamMasterID as string) ?? '';

  // 衍生 LayerMap 所需视图
  const layerViews = layersRaw
    ? Object.values(layersRaw).map((l) => ({
        layer: l.layer as number,
        heartLockValue: (l.heartLockValue as number) ?? 0,
        vaultCount:
          vaultsRaw?.filter(
            (v) => (v.layer as number) === (l.layer as number) && !(v.isOpened as boolean),
          ).length ?? 0,
        nightmareRevealed: !!(l.nightmareRevealed as boolean),
        playerIds: (l.playersInLayer as string[]) ?? [],
      }))
    : [];
  const playerViews = players
    ? Object.fromEntries(
        Object.entries(players).map(([id, p]) => [
          id,
          {
            id,
            nickname: (p.nickname as string) ?? id,
            faction: (p.faction as string) ?? 'thief',
            currentLayer: (p.currentLayer as number) ?? 1,
            isAlive: !!p.isAlive,
          },
        ]),
      )
    : {};

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

  // 出牌意图：action 阶段选中一张需要目标的牌后进入选目标模式
  const [pendingPlay, setPendingPlay] = useState<{
    card: string;
    move: string;
    needsTarget: 'player' | 'layer' | 'none';
  } | null>(null);

  // 有效的 pendingPlay：card 必须在当前手牌且仍是 action 阶段
  const effectivePending =
    pendingPlay && turnPhase === 'action' && isHumanTurn && humanHand.includes(pendingPlay.card)
      ? pendingPlay
      : null;

  const startPlay = useCallback((card: string) => {
    const action = actionMoveFor(card);
    if (!action) return;
    if (action.needsTarget === 'none') {
      setPendingPlay({ card, move: action.move, needsTarget: 'none' });
    } else {
      setPendingPlay({ card, move: action.move, needsTarget: action.needsTarget });
    }
  }, []);

  const confirmPlayNoTarget = useCallback(async () => {
    if (!effectivePending || effectivePending.needsTarget !== 'none') return;
    // playUnlock / playCreation 需要 cardId 参数
    await makeMove(effectivePending.move, [effectivePending.card]);
    setPendingPlay(null);
  }, [effectivePending, makeMove]);

  const confirmPlayTargetPlayer = useCallback(
    async (targetPlayerID: string) => {
      if (!effectivePending || effectivePending.needsTarget !== 'player') return;
      // playShoot(targetPlayerID, cardId)
      await makeMove(effectivePending.move, [targetPlayerID, effectivePending.card]);
      setPendingPlay(null);
    },
    [effectivePending, makeMove],
  );

  const confirmPlayTargetLayer = useCallback(
    async (targetLayer: number) => {
      if (!effectivePending || effectivePending.needsTarget !== 'layer') return;
      // playDreamTransit(cardId, targetLayer)
      await makeMove(effectivePending.move, [effectivePending.card, targetLayer]);
      setPendingPlay(null);
    },
    [effectivePending, makeMove],
  );

  const cancelPlay = useCallback(() => setPendingPlay(null), []);

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

      {layerViews.length > 0 && (
        <LayerMap
          layers={layerViews}
          players={playerViews}
          humanPlayerId="0"
          dreamMasterId={dreamMasterID}
          currentPlayerId={currentPlayerID}
        />
      )}

      {humanPlayer && (
        <div className="mb-4 rounded-lg border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">{t('localMatch.yourInfo')}</span>
            {typeof humanPlayer.characterId === 'string' && humanPlayer.characterId && (
              <CharacterSummary characterId={humanPlayer.characterId as string} />
            )}
          </div>
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
                  const isDiscardSelect =
                    turnPhase === 'discard' && overHand > 0 && isHumanTurn && !winner;
                  const isActionPlayable =
                    turnPhase === 'action' && isHumanTurn && !winner && !!actionMoveFor(card);
                  const selected = isDiscardSelect && effectiveSelected.includes(card);
                  const isPending = effectivePending?.card === card;
                  const onClickHand = () => {
                    if (isDiscardSelect) toggleDiscard(card);
                    else if (isActionPlayable) startPlay(card);
                  };
                  return (
                    <button
                      key={`${card}-${i}`}
                      type="button"
                      disabled={!isDiscardSelect && !isActionPlayable}
                      onClick={onClickHand}
                      className={cn(
                        'rounded border px-2 py-0.5 text-xs transition-colors',
                        selected && 'border-destructive bg-destructive/20 text-destructive',
                        isPending && 'border-primary bg-primary/20 text-primary',
                        !selected && !isPending && 'border-border bg-muted',
                        (isDiscardSelect || isActionPlayable) &&
                          !selected &&
                          !isPending &&
                          'hover:border-primary/60',
                      )}
                      data-testid={`card-${i}`}
                      title={card}
                    >
                      {getCardName(card)}
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
          {turnPhase === 'action' && !effectivePending && (
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

          {/* 无目标出牌（解封 / 造物）：显示确认按钮 */}
          {turnPhase === 'action' && effectivePending?.needsTarget === 'none' && (
            <>
              <button
                type="button"
                onClick={() => void confirmPlayNoTarget()}
                className="flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground"
                data-testid="action-confirm-play"
              >
                {t('localMatch.confirmPlay', { card: getCardName(effectivePending.card) })}
              </button>
              <button
                type="button"
                onClick={cancelPlay}
                className="flex items-center gap-1 rounded-full border border-muted px-4 py-2 text-sm text-muted-foreground"
                data-testid="action-cancel-play"
              >
                {t('common.cancel')}
              </button>
            </>
          )}

          {/* 需选目标玩家：SHOOT 等 */}
          {turnPhase === 'action' && effectivePending?.needsTarget === 'player' && (
            <div className="w-full rounded-md border border-primary/40 bg-primary/10 p-3">
              <div className="mb-2 text-sm text-primary">
                {t('localMatch.pickPlayerTarget', {
                  card: getCardName(effectivePending.card),
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(players ?? {})
                  .filter(([id, p]) => id !== '0' && (p.isAlive as boolean))
                  .map(([id]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => void confirmPlayTargetPlayer(id)}
                      className="rounded-full bg-destructive px-3 py-1 text-xs text-destructive-foreground"
                      data-testid={`target-player-${id}`}
                    >
                      AI {id}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={cancelPlay}
                  className="rounded-full border border-muted px-3 py-1 text-xs text-muted-foreground"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}

          {/* 需选目标层：穿梭剂 */}
          {turnPhase === 'action' && effectivePending?.needsTarget === 'layer' && (
            <div className="w-full rounded-md border border-primary/40 bg-primary/10 p-3">
              <div className="mb-2 text-sm text-primary">
                {t('localMatch.pickLayerTarget', {
                  card: getCardName(effectivePending.card),
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4].map((layer) => (
                  <button
                    key={layer}
                    type="button"
                    onClick={() => void confirmPlayTargetLayer(layer)}
                    className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground"
                    data-testid={`target-layer-${layer}`}
                  >
                    L{layer}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={cancelPlay}
                  className="rounded-full border border-muted px-3 py-1 text-xs text-muted-foreground"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
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
