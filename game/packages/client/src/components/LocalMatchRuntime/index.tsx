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
import { getCardImageUrl, GENERIC_BACK_IMAGES, preloadAllCardImages } from '../../lib/cardImages';
import { LayerMap } from '../LayerMap';
import { ActiveSkillPanel } from '../ActiveSkillPanel';
import { CardDetailModal } from '../CardDetailModal';
import { CopyrightNotice } from '../CopyrightNotice';
import type { ActiveSkillContext, ActiveSkillDescriptor } from '../../lib/activeSkills';

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
  const imgUrl = getCardImageUrl(characterId);
  return (
    <div
      className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-1 text-xs"
      title={summary.skills.map((s) => `${s.name}：${s.description}`).join('\n')}
      data-testid="human-character"
    >
      {imgUrl && (
        <img
          src={imgUrl}
          alt={summary.name}
          loading="lazy"
          className="h-16 w-[44px] rounded-sm object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      <div className="flex flex-col">
        <span className="font-semibold text-primary">{summary.name}</span>
        {summary.skills[0] && (
          <span className="text-[10px] text-muted-foreground">· {summary.skills[0].name}</span>
        )}
      </div>
    </div>
  );
}

/** 其他玩家列表行内的角色小缩略图。
 *  - characterId 已揭示 → 显示角色图
 *  - characterId 被过滤（空字符串）→ 用阵营对应的通用"背面"图
 *    （梦主用梦主背，盗梦者用盗梦者背，让玩家至少能看到阵营轮廓）
 */
function PlayerMiniAvatar({ characterId, isMaster }: { characterId: string; isMaster: boolean }) {
  const revealedUrl = getCardImageUrl(characterId);
  const imgUrl = revealedUrl ?? (isMaster ? GENERIC_BACK_IMAGES.master : GENERIC_BACK_IMAGES.thief);
  const summary = getCharacterSkillSummary(characterId);
  const label = summary?.name ?? (isMaster ? '梦主（未揭示）' : '盗梦者（未揭示）');
  return (
    <img
      src={imgUrl}
      alt={label}
      title={label}
      loading="lazy"
      className="h-10 w-[28px] flex-shrink-0 rounded-sm object-cover"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = 'none';
      }}
    />
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
  // 长按 / 双击预览的卡牌 ID
  const [previewCard, setPreviewCard] = useState<string | null>(null);
  // 卡图预载进度
  const [preloadProgress, setPreloadProgress] = useState<{
    loaded: number;
    total: number;
    failed: number;
  } | null>(null);
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

    // 后台预加载所有卡图（不阻塞对局启动）· 浏览器 HTTP cache 接管后续 <img> 秒出
    void preloadAllCardImages({
      onProgress: (loaded, total, failed) => {
        setPreloadProgress({ loaded, total, failed: failed.length });
        if (loaded === total) {
          logger.flow('game/assets', 'card images preloaded', {
            loaded,
            total,
            failed: failed.length,
          });
          // 完成 800ms 后清空 state，进度条淡出
          setTimeout(() => setPreloadProgress(null), 800);
        }
      },
    });

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
        openedVaults:
          vaultsRaw
            ?.filter((v) => (v.layer as number) === (l.layer as number) && (v.isOpened as boolean))
            .map((v) => ({
              contentType: v.contentType as 'secret' | 'coin' | 'empty',
            })) ?? [],
        nightmareRevealed: !!(l.nightmareRevealed as boolean),
        nightmareCardId: (l.nightmareId as string | null) ?? null,
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
    argOrder?: 'target_first' | 'card_first';
    // SHOOT·梦境穿梭剂 专用：shoot | transit 模式（非空时 move 签名为 (cardId, mode, target)）
    dreamMode?: 'shoot' | 'transit';
  } | null>(null);

  // SHOOT·梦境穿梭剂：选 mode 的中间态
  const [dreamTransitPicker, setDreamTransitPicker] = useState<string | null>(null);

  // 死亡宣言可选展示（SHOOT 目标选择前切换）
  const [decreePick, setDecreePick] = useState<string | null>(null);
  const toggleDecree = useCallback(
    (cardId: string) => setDecreePick((prev) => (prev === cardId ? null : cardId)),
    [setDecreePick],
  );

  // 万有引力：1-2 目标的选择中间态
  const [gravityPicker, setGravityPicker] = useState<{
    card: string;
    targets: string[];
  } | null>(null);
  const toggleGravityTarget = useCallback(
    (pid: string) => {
      setGravityPicker((prev) => {
        if (!prev) return prev;
        const idx = prev.targets.indexOf(pid);
        if (idx >= 0) {
          const next = [...prev.targets];
          next.splice(idx, 1);
          return { ...prev, targets: next };
        }
        if (prev.targets.length >= 2) return prev;
        return { ...prev, targets: [...prev.targets, pid] };
      });
    },
    [setGravityPicker],
  );
  const confirmGravity = useCallback(async () => {
    if (!gravityPicker || gravityPicker.targets.length < 1) return;
    await makeMove('playGravity', [gravityPicker.card, [...gravityPicker.targets]]);
    setGravityPicker(null);
  }, [gravityPicker, makeMove, setGravityPicker]);

  // 棋局·易位：选中的 2 个金库索引
  const [chessPick, setChessPick] = useState<number[]>([]);
  const humanCharacterId = (humanPlayer?.characterId as string) ?? '';
  const isChessMaster =
    humanCharacterId === 'dm_chess' && currentPlayerID === '0' && turnPhase === 'action';

  const toggleChessPick = useCallback((idx: number) => {
    setChessPick((prev) => {
      if (prev.includes(idx)) return prev.filter((i) => i !== idx);
      if (prev.length >= 2) return [prev[1]!, idx]; // 保留最后 2 个
      return [...prev, idx];
    });
  }, []);

  const confirmChessTranspose = useCallback(async () => {
    if (chessPick.length !== 2) return;
    await makeMove('useChessTranspose', [chessPick[0], chessPick[1]]);
    setChessPick([]);
  }, [chessPick, makeMove]);

  // 贿赂派发：梦主行动阶段可选目标
  const bribePool = G?.bribePool as Array<Record<string, unknown>> | undefined;
  const bribePoolRemaining = bribePool?.filter((b) => b.status === 'inPool').length ?? 0;
  const humanFaction = (humanPlayer?.faction as string) ?? 'thief';
  const canDealBribe =
    isHumanTurn && turnPhase === 'action' && humanFaction === 'master' && bribePoolRemaining > 0;
  const [bribeTargetOpen, setBribeTargetOpen] = useState(false);
  const dealBribeTo = useCallback(
    async (targetId: string) => {
      await makeMove('masterDealBribe', [targetId]);
      setBribeTargetOpen(false);
    },
    [makeMove],
  );

  // 有效的 pendingPlay：card 必须在当前手牌且仍是 action 阶段
  const effectivePending =
    pendingPlay && turnPhase === 'action' && isHumanTurn && humanHand.includes(pendingPlay.card)
      ? pendingPlay
      : null;

  const startPlay = useCallback(
    (card: string) => {
      // SHOOT·梦境穿梭剂：进入 mode 选择
      if (card === 'action_shoot_dream_transit') {
        setDreamTransitPicker(card);
        return;
      }
      // 万有引力：进入多目标选择
      if (card === 'action_gravity') {
        setGravityPicker({ card, targets: [] });
        return;
      }
      const action = actionMoveFor(card);
      if (!action) return;
      setPendingPlay({
        card,
        move: action.move,
        needsTarget: action.needsTarget,
        argOrder: action.argOrder,
      });
    },
    [setDreamTransitPicker, setGravityPicker, setPendingPlay],
  );

  const chooseDreamMode = useCallback(
    (mode: 'shoot' | 'transit') => {
      if (!dreamTransitPicker) return;
      setPendingPlay({
        card: dreamTransitPicker,
        move: 'playShootDreamTransit',
        needsTarget: mode === 'shoot' ? 'player' : 'layer',
        argOrder: 'card_first',
        dreamMode: mode,
      });
      setDreamTransitPicker(null);
    },
    [dreamTransitPicker, setDreamTransitPicker, setPendingPlay],
  );

  const confirmPlayNoTarget = useCallback(async () => {
    if (!effectivePending || effectivePending.needsTarget !== 'none') return;
    // playUnlock / playCreation 需要 cardId 参数
    await makeMove(effectivePending.move, [effectivePending.card]);
    setPendingPlay(null);
  }, [effectivePending, makeMove]);

  const confirmPlayTargetPlayer = useCallback(
    async (targetPlayerID: string) => {
      if (!effectivePending || effectivePending.needsTarget !== 'player') return;
      let args: unknown[];
      if (effectivePending.dreamMode) {
        // playShootDreamTransit(cardId, mode, target, decree?)
        args = [effectivePending.card, effectivePending.dreamMode, targetPlayerID];
        if (decreePick && effectivePending.dreamMode === 'shoot') args = [...args, decreePick];
      } else if (effectivePending.argOrder === 'card_first') {
        args = [effectivePending.card, targetPlayerID];
      } else {
        // SHOOT 系列：末位可附 decree
        args = [targetPlayerID, effectivePending.card];
        const isShootMove =
          effectivePending.move === 'playShoot' ||
          effectivePending.move === 'playShootKing' ||
          effectivePending.move === 'playShootArmor' ||
          effectivePending.move === 'playShootBurst';
        if (decreePick && isShootMove) args = [...args, decreePick];
      }
      await makeMove(effectivePending.move, args);
      setPendingPlay(null);
      setDecreePick(null);
    },
    [effectivePending, makeMove, decreePick, setDecreePick],
  );

  const confirmPlayTargetLayer = useCallback(
    async (targetLayer: number) => {
      if (!effectivePending || effectivePending.needsTarget !== 'layer') return;
      const args = effectivePending.dreamMode
        ? [effectivePending.card, effectivePending.dreamMode, targetLayer]
        : [effectivePending.card, targetLayer];
      await makeMove(effectivePending.move, args);
      setPendingPlay(null);
    },
    [effectivePending, makeMove],
  );

  const cancelPlay = useCallback(() => setPendingPlay(null), []);

  // 嫁接 pending resolver：抽 3 后选 2 张返牌库顶
  const pendingGraft = G?.pendingGraft as { playerID: string } | null | undefined;
  const isHumanGraftPending = pendingGraft?.playerID === '0' && isHumanTurn;
  const [graftPick, setGraftPick] = useState<string[]>([]);
  const toggleGraftPick = useCallback((card: string) => {
    setGraftPick((prev) => {
      const idx = prev.indexOf(card);
      if (idx >= 0) {
        const next = [...prev];
        next.splice(idx, 1);
        return next;
      }
      if (prev.length >= 2) return [prev[1]!, card];
      return [...prev, card];
    });
  }, []);
  // 派生：只保留仍在手牌中且处于 pending 时的选择
  const effectiveGraftPick = isHumanGraftPending
    ? graftPick.filter((c) => humanHand.includes(c))
    : [];

  // pendingGravity 人类 bonder 驱动池挑选
  const pendingGravity = G?.pendingGravity as
    | { bonderPlayerID: string; pool: string[]; pickOrder: string[]; pickCursor: number }
    | null
    | undefined;
  const isHumanGravityBonder = pendingGravity?.bonderPlayerID === '0';
  const pickGravityCard = useCallback(
    async (cardId: string) => {
      await makeMove('resolveGravityPick', [cardId]);
    },
    [makeMove],
  );
  const confirmGraft = useCallback(async () => {
    if (effectiveGraftPick.length !== 2) return;
    await makeMove('resolveGraft', [[...effectiveGraftPick]]);
    setGraftPick([]);
  }, [effectiveGraftPick, makeMove]);

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
      {/* 卡图预载进度条（对局启动时后台拉取；完成后 800ms 淡出） */}
      {preloadProgress && preloadProgress.total > 0 && (
        <div
          className={cn(
            'mb-3 flex items-center gap-3 rounded-md border border-border bg-card/60 px-3 py-1.5 text-[11px] transition-opacity duration-500',
            preloadProgress.loaded === preloadProgress.total ? 'opacity-40' : 'opacity-100',
          )}
          role="status"
          aria-live="polite"
          data-testid="asset-preload-progress"
        >
          <span className="text-muted-foreground">
            {preloadProgress.loaded === preloadProgress.total ? '卡图就绪 ✓' : '卡图加载中'}
          </span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-200"
              style={{
                width: `${Math.round((preloadProgress.loaded / preloadProgress.total) * 100)}%`,
              }}
            />
          </div>
          <span className="font-mono text-muted-foreground">
            {preloadProgress.loaded}/{preloadProgress.total}
            {preloadProgress.failed > 0 && (
              <span className="ml-1 text-destructive">· {preloadProgress.failed} 失败</span>
            )}
          </span>
        </div>
      )}

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
          {typeof G?.winReason === 'string' && G.winReason && (
            <p className="mt-1 text-xs text-muted-foreground" data-testid="win-reason">
              {t(`localMatch.winReason.${G.winReason as string}`, {
                defaultValue: G.winReason as string,
              })}
            </p>
          )}
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
          onCardPreview={setPreviewCard}
        />
      )}

      {humanPlayer && (
        <div className="mb-4 rounded-lg border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">{t('localMatch.yourInfo')}</span>
            {typeof humanPlayer.characterId === 'string' && humanPlayer.characterId && (
              <button
                type="button"
                onClick={() => setPreviewCard(humanPlayer.characterId as string)}
                className="inline-block transition-transform hover:scale-[1.02]"
                aria-label="查看自己角色详情"
                data-testid="human-character-preview"
              >
                <CharacterSummary characterId={humanPlayer.characterId as string} />
              </button>
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
            {typeof humanPlayer.bribeReceived === 'number' &&
              (humanPlayer.bribeReceived as number) > 0 && (
                <span
                  className="rounded bg-purple-500/20 px-1.5 py-0.5 text-purple-300"
                  data-testid="human-bribe-received"
                >
                  {t('localMatch.bribeReceived', { n: humanPlayer.bribeReceived })}
                </span>
              )}
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
                  const imgUrl = getCardImageUrl(card);
                  // 长按 500ms / 双击 → 打开预览
                  let pressTimer: ReturnType<typeof setTimeout> | null = null;
                  const startPress = () => {
                    pressTimer = setTimeout(() => {
                      setPreviewCard(card);
                      pressTimer = null;
                    }, 500);
                  };
                  const cancelPress = () => {
                    if (pressTimer) {
                      clearTimeout(pressTimer);
                      pressTimer = null;
                    }
                  };
                  return (
                    <button
                      key={`${card}-${i}`}
                      type="button"
                      onPointerDown={startPress}
                      onPointerUp={cancelPress}
                      onPointerLeave={cancelPress}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        setPreviewCard(card);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setPreviewCard(card);
                      }}
                      onClick={onClickHand}
                      className={cn(
                        'relative flex h-[108px] w-[76px] flex-col items-center justify-end overflow-hidden rounded-md border-2 transition-all',
                        selected && 'border-destructive ring-2 ring-destructive/40',
                        isPending && 'border-primary ring-2 ring-primary/40 scale-[1.03]',
                        !selected && !isPending && 'border-border bg-muted',
                        (isDiscardSelect || isActionPlayable) &&
                          !selected &&
                          !isPending &&
                          'hover:border-primary/60 hover:scale-[1.02]',
                        !isDiscardSelect && !isActionPlayable && 'opacity-60',
                      )}
                      data-testid={`card-${i}`}
                      title={getCardName(card)}
                    >
                      {imgUrl && (
                        <img
                          src={imgUrl}
                          alt={getCardName(card)}
                          loading="lazy"
                          className="absolute inset-0 h-full w-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      )}
                      <span className="relative z-10 w-full bg-black/70 px-1 py-0.5 text-center text-[10px] leading-tight text-white">
                        {getCardName(card)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* 角色主动技能面板（R7：影子·潜伏 / 阿波罗·崇拜） */}
      {(() => {
        if (!isHumanTurn || winner) return null;
        const masterPlayer = players?.[dreamMasterID];
        const masterLayer =
          typeof masterPlayer?.currentLayer === 'number'
            ? (masterPlayer.currentLayer as number)
            : 0;
        const hasPending =
          !!G?.pendingUnlock ||
          !!G?.pendingGraft ||
          !!G?.pendingGravity ||
          !!G?.pendingLibra ||
          !!G?.pendingResponseWindow;
        const skillCtx: ActiveSkillContext = {
          characterId: humanCharacterId,
          turnPhase,
          isHumanTurn,
          isAlive: !!humanPlayer?.isAlive,
          humanLayer: (humanPlayer?.currentLayer as number) ?? 1,
          masterLayer,
          hasPending,
          skillUsedThisTurn: (humanPlayer?.skillUsedThisTurn as Record<string, number>) ?? {},
          hand: humanHand,
          faction: humanFaction === 'master' ? 'master' : 'thief',
          hasBribe:
            typeof humanPlayer?.bribeReceived === 'number' &&
            (humanPlayer.bribeReceived as number) > 0,
          successfulUnlocksThisTurn:
            typeof humanPlayer?.successfulUnlocksThisTurn === 'number'
              ? (humanPlayer.successfulUnlocksThisTurn as number)
              : 0,
          bribePoolAvailable: Array.isArray(G?.bribePool)
            ? (G.bribePool as Array<Record<string, unknown>>).some((b) => b.status === 'inPool')
            : false,
          sameLayerPlayerIds: players
            ? Object.entries(players)
                .filter(
                  ([pid, p]) =>
                    pid !== '0' &&
                    !!p.isAlive &&
                    (p.currentLayer as number) === ((humanPlayer?.currentLayer as number) ?? 1),
                )
                .map(([pid]) => pid)
            : [],
          discardPile: Array.isArray((G?.deck as Record<string, unknown> | undefined)?.discardPile)
            ? ((G!.deck as Record<string, unknown>).discardPile as string[])
            : [],
          bribePoolItems: Array.isArray(G?.bribePool)
            ? (G!.bribePool as Array<Record<string, unknown>>)
                .map((b, i) => ({ index: i, id: b.id as string, status: b.status as string }))
                .filter((b) => b.status === 'inPool')
                .map(({ index, id }) => ({ index, id }))
            : [],
          marsBattlefieldActive:
            !!players &&
            !!dreamMasterID &&
            (players[dreamMasterID]?.characterId as string) === 'dm_mars_battlefield',
        };
        // 主动技能目标列表：其他存活玩家
        const targetIds = players
          ? Object.entries(players)
              .filter(([pid, p]) => pid !== '0' && !!p.isAlive)
              .map(([pid]) => pid)
          : [];
        const nickMap = players
          ? Object.fromEntries(
              Object.entries(players).map(([pid, p]) => [pid, (p.nickname as string) ?? pid]),
            )
          : {};
        const handleInvoke = (skill: ActiveSkillDescriptor, args: unknown[]) => {
          void makeMove(skill.move, args);
        };
        return (
          <ActiveSkillPanel
            context={skillCtx}
            availableTargetIds={targetIds}
            playerNicknames={nickMap}
            onInvoke={handleInvoke}
          />
        );
      })()}

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

              {/* 死亡宣言可选展示（仅 SHOOT 系列）*/}
              {(() => {
                const isShoot =
                  effectivePending.move === 'playShoot' ||
                  effectivePending.move === 'playShootKing' ||
                  effectivePending.move === 'playShootArmor' ||
                  effectivePending.move === 'playShootBurst' ||
                  (effectivePending.dreamMode === 'shoot' &&
                    effectivePending.move === 'playShootDreamTransit');
                const decrees = humanHand.filter((c) => c.startsWith('action_death_decree_'));
                if (!isShoot || decrees.length === 0) return null;
                return (
                  <div
                    className="mb-2 flex flex-wrap items-center gap-2 text-[11px]"
                    data-testid="decree-picker"
                  >
                    <span className="text-muted-foreground">
                      {t('localMatch.decreeLabel', { defaultValue: '附加死亡宣言：' })}
                    </span>
                    {decrees.map((c) => (
                      <button
                        key={`decree-${c}`}
                        type="button"
                        onClick={() => toggleDecree(c)}
                        className={cn(
                          'rounded-full border px-2 py-0.5',
                          decreePick === c
                            ? 'border-amber-400 bg-amber-500/30 text-amber-400'
                            : 'border-border bg-card hover:border-amber-400/60',
                        )}
                        data-testid={`decree-${c}`}
                      >
                        {getCardName(c)}
                      </button>
                    ))}
                    {decreePick && (
                      <button
                        type="button"
                        onClick={() => setDecreePick(null)}
                        className="rounded-full border border-muted px-2 py-0.5 text-muted-foreground"
                      >
                        {t('localMatch.decreeClear', { defaultValue: '取消宣言' })}
                      </button>
                    )}
                  </div>
                );
              })()}

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
                  onClick={() => {
                    cancelPlay();
                    setDecreePick(null);
                  }}
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

      {/* 贿赂派发：梦主限定 */}
      {canDealBribe && (
        <div
          className="mb-4 rounded-md border border-purple-500/40 bg-purple-500/5 p-3 text-xs"
          data-testid="bribe-panel"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium text-purple-400">
              {t('localMatch.bribeTitle', { defaultValue: '派发贿赂牌' })}
            </span>
            <span className="text-muted-foreground">
              {t('localMatch.bribeRemaining', {
                n: bribePoolRemaining,
                defaultValue: `池剩 ${bribePoolRemaining}`,
              })}
            </span>
          </div>
          {!bribeTargetOpen ? (
            <button
              type="button"
              onClick={() => setBribeTargetOpen(true)}
              className="rounded-full bg-purple-500 px-3 py-1 text-[11px] text-white"
              data-testid="bribe-open"
            >
              {t('localMatch.bribePickTarget', { defaultValue: '选择盗梦者' })}
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              {Object.entries(players ?? {})
                .filter(
                  ([id, p]) =>
                    (p.isAlive as boolean) && (p.faction as string) === 'thief' && id !== '0',
                )
                .map(([id]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => void dealBribeTo(id)}
                    className="rounded-full bg-purple-500 px-3 py-1 text-[11px] text-white"
                    data-testid={`bribe-target-${id}`}
                  >
                    AI {id}
                  </button>
                ))}
              <button
                type="button"
                onClick={() => setBribeTargetOpen(false)}
                className="rounded-full border border-muted px-3 py-1 text-[11px] text-muted-foreground"
              >
                {t('common.cancel')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 棋局·易位：梦主专属主动技能 */}
      {isChessMaster && !effectivePending && vaultsRaw && (
        <div
          className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs"
          data-testid="chess-transpose-panel"
        >
          <div className="mb-2 font-medium text-amber-400">
            {t('localMatch.chessTranspose', { defaultValue: '棋局·易位：选择 2 个金库交换' })}
          </div>
          <div className="mb-2 flex flex-wrap gap-2">
            {vaultsRaw.map((v, idx) => {
              const opened = v.isOpened as boolean;
              const layer = v.layer as number;
              const picked = chessPick.includes(idx);
              return (
                <button
                  key={`${v.id as string}`}
                  type="button"
                  disabled={opened}
                  onClick={() => toggleChessPick(idx)}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[11px]',
                    opened
                      ? 'border-muted bg-muted text-muted-foreground opacity-50'
                      : picked
                        ? 'border-amber-400 bg-amber-500/30 text-amber-400'
                        : 'border-border bg-card hover:border-amber-400/60',
                  )}
                  data-testid={`vault-${idx}`}
                >
                  {opened ? '已开' : `金库 L${layer}`}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={chessPick.length !== 2}
            onClick={() => void confirmChessTranspose()}
            className="rounded-full bg-amber-500 px-3 py-1 text-[11px] text-black disabled:opacity-50"
            data-testid="chess-confirm"
          >
            {t('localMatch.chessConfirm', { defaultValue: '确认交换' })}
          </button>
        </div>
      )}

      {/* SHOOT·梦境穿梭剂 mode 选择 */}
      {dreamTransitPicker && (
        <div
          className="mb-4 rounded-md border border-indigo-500/40 bg-indigo-500/5 p-3 text-xs"
          data-testid="dream-transit-mode-picker"
        >
          <div className="mb-2 font-medium text-indigo-400">
            {t('localMatch.dreamTransitPick', {
              defaultValue: 'SHOOT·梦境穿梭剂：选择结算方式',
            })}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => chooseDreamMode('shoot')}
              className="rounded-full bg-indigo-500 px-3 py-1 text-[11px] text-white"
              data-testid="dream-mode-shoot"
            >
              {t('localMatch.dreamModeShoot', { defaultValue: '以 SHOOT 结算' })}
            </button>
            <button
              type="button"
              onClick={() => chooseDreamMode('transit')}
              className="rounded-full bg-indigo-400 px-3 py-1 text-[11px] text-white"
              data-testid="dream-mode-transit"
            >
              {t('localMatch.dreamModeTransit', { defaultValue: '以 穿梭剂 结算' })}
            </button>
            <button
              type="button"
              onClick={() => setDreamTransitPicker(null)}
              className="rounded-full border border-muted px-3 py-1 text-[11px] text-muted-foreground"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* 万有引力：多目标选择 */}
      {gravityPicker && players && (
        <div
          className="mb-4 rounded-md border border-violet-500/40 bg-violet-500/5 p-3 text-xs"
          data-testid="gravity-targets-picker"
        >
          <div className="mb-2 font-medium text-violet-400">
            {t('localMatch.gravityPickTargets', {
              defaultValue: '万有引力：选 1-2 名玩家（不含自己）',
            })}
          </div>
          <div className="mb-2 flex flex-wrap gap-2">
            {Object.entries(players)
              .filter(([id, p]) => id !== '0' && (p.isAlive as boolean))
              .map(([id]) => {
                const picked = gravityPicker.targets.includes(id);
                return (
                  <button
                    key={`grav-tgt-${id}`}
                    type="button"
                    onClick={() => toggleGravityTarget(id)}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[11px]',
                      picked
                        ? 'border-violet-400 bg-violet-500/30 text-violet-400'
                        : 'border-border bg-card hover:border-violet-400/60',
                    )}
                    data-testid={`grav-target-${id}`}
                  >
                    AI {id}
                  </button>
                );
              })}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={gravityPicker.targets.length < 1}
              onClick={() => void confirmGravity()}
              className="rounded-full bg-violet-500 px-3 py-1 text-[11px] text-black disabled:opacity-50"
              data-testid="gravity-confirm"
            >
              {t('localMatch.gravityConfirm', { defaultValue: '确认打出' })}
            </button>
            <button
              type="button"
              onClick={() => setGravityPicker(null)}
              className="rounded-full border border-muted px-3 py-1 text-[11px] text-muted-foreground"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* 万有引力：人类 bonder 的池挑选器 */}
      {isHumanGravityBonder && pendingGravity && (
        <div
          className="mb-4 rounded-md border border-violet-500/40 bg-violet-500/5 p-3 text-xs"
          data-testid="gravity-pool-picker"
        >
          <div className="mb-2 font-medium text-violet-400">
            {t('localMatch.gravityPoolPick', {
              defaultValue: '万有引力：轮流挑选',
              picker:
                pendingGravity.pickOrder[
                  pendingGravity.pickCursor % pendingGravity.pickOrder.length
                ],
            })}{' '}
            ·{' '}
            {(() => {
              const picker =
                pendingGravity.pickOrder[
                  pendingGravity.pickCursor % pendingGravity.pickOrder.length
                ];
              return picker === '0' ? t('localMatch.you') : `AI ${picker}`;
            })()}
          </div>
          <div className="flex flex-wrap gap-2">
            {pendingGravity.pool.map((c, idx) => (
              <button
                key={`grav-pool-${idx}-${c}`}
                type="button"
                onClick={() => void pickGravityCard(c)}
                className="rounded-full border border-violet-400/60 bg-card px-2 py-0.5 text-[11px] hover:bg-violet-500/10"
                data-testid={`grav-pool-${idx}`}
              >
                {getCardName(c)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 嫁接结算：选 2 张返牌库顶 */}
      {isHumanGraftPending && (
        <div
          className="mb-4 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs"
          data-testid="graft-resolver"
        >
          <div className="mb-2 font-medium text-emerald-400">
            {t('localMatch.graftTitle', {
              defaultValue: '嫁接：选 2 张手牌放回牌库顶（第 1 张位于最顶）',
            })}
          </div>
          <div className="mb-2 flex flex-wrap gap-2">
            {humanHand.map((card, idx) => {
              const picked = effectiveGraftPick.includes(card);
              const order = effectiveGraftPick.indexOf(card) + 1;
              return (
                <button
                  key={`graft-pick-${idx}-${card}`}
                  type="button"
                  onClick={() => toggleGraftPick(card)}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[11px]',
                    picked
                      ? 'border-emerald-400 bg-emerald-500/30 text-emerald-400'
                      : 'border-border bg-card hover:border-emerald-400/60',
                  )}
                  data-testid={`graft-card-${idx}`}
                >
                  {picked && <span className="mr-1 text-[10px]">#{order}</span>}
                  {getCardName(card)}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={effectiveGraftPick.length !== 2}
            onClick={() => void confirmGraft()}
            className="rounded-full bg-emerald-500 px-3 py-1 text-[11px] text-black disabled:opacity-50"
            data-testid="graft-confirm"
          >
            {t('localMatch.graftConfirm', { defaultValue: '确认放回' })}
          </button>
        </div>
      )}

      {players && (
        <div className="space-y-2">
          {Object.entries(players).map(([id, p]) => {
            const cid = typeof p.characterId === 'string' ? p.characterId : '';
            const isMaster = id === dreamMasterID;
            // 任何玩家都值得一个头像占位：已揭示用真实图，未揭示用阵营对应背面图
            return (
              <div
                key={id}
                className={cn(
                  'flex items-center gap-3 rounded-lg border px-3 py-2 text-sm',
                  id === currentPlayerID ? 'border-primary bg-primary/5' : 'border-border bg-card',
                  id === '0' && 'ring-1 ring-primary/30',
                )}
              >
                <button
                  type="button"
                  onClick={() => cid && setPreviewCard(cid)}
                  className="flex-shrink-0 transition-transform hover:scale-110 disabled:cursor-default"
                  aria-label={`查看 ${cid || '未揭示角色'}`}
                  data-testid={`player-avatar-${id}`}
                  disabled={!cid}
                >
                  <PlayerMiniAvatar characterId={cid} isMaster={isMaster} />
                </button>
                <span className="font-medium">{id === '0' ? t('localMatch.you') : `AI ${id}`}</span>
                <span className="text-xs text-muted-foreground">{String(p.faction)}</span>
                <span className="text-xs text-muted-foreground">L{String(p.currentLayer)}</span>
                {!p.isAlive && <Skull className="h-3 w-3 text-destructive" />}
                <span className="ml-auto text-xs text-muted-foreground">
                  {t('localMatch.cards')}：{(p.hand as unknown[])?.length ?? 0}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!gameState && (
        <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
          {t('localMatch.loading')}
        </div>
      )}

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {/* 长按/双击/右键手牌 或 点击玩家头像 → 卡牌详情预览（双面角色支持翻面） */}
      <CardDetailModal cardId={previewCard} onClose={() => setPreviewCard(null)} />

      {/* 版权 footer · 对局内常驻，满足 CC-BY-NC 四重展示约束 */}
      <CopyrightNotice
        variant="footer"
        className="mt-6 border-t border-border/40 bg-background/70 py-2 backdrop-blur-sm"
      />
    </div>
  );
}
