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
import { MasterNightmareDecisionDialog } from '../MasterNightmareDecisionDialog';
import { UnlockResponseDialog } from '../UnlockResponseDialog';
import { MasterPeekBribeDialog } from '../MasterPeekBribeDialog';
import { ShooterLayerPickerDialog } from '../ShooterLayerPickerDialog';
import { PeekerVaultRevealDialog } from '../PeekerVaultRevealDialog';
import { MasterBribeInspectDialog } from '../MasterBribeInspectDialog';
import { TargetPlayerPickerDialog } from '../TargetPlayerPickerDialog';
import { TargetLayerPickerDialog } from '../TargetLayerPickerDialog';
import { DreamTransitModeDialog } from '../DreamTransitModeDialog';
import { ChessTransposeDialog } from '../ChessTransposeDialog';
import { GravityTargetPickerDialog } from '../GravityTargetPickerDialog';
import { GravityPoolPickerDialog } from '../GravityPoolPickerDialog';
import { GraftResolverDialog } from '../GraftResolverDialog';
import { ShootDiceOverlay } from '../ShootDiceOverlay';
import { toast } from '@/lib/toast';
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
  // 胜负优先读 BGIO ctx.gameover（engine endIf 返回时由框架写入），再回退 G.winner。
  // 对照：game-engine/src/game.ts endIf({ winner, reason }) —— endIf 不改 G，
  // 仅设置 ctx.gameover；UI 原先只看 G.winner 会导致 gameover 后按钮仍可点击
  // → move 派发 → BGIO 拒绝（ERROR: disallowed move / game over）。
  const ctxGameover = ctx?.gameover as { winner?: string; reason?: string } | undefined;
  const winner = (ctxGameover?.winner ?? (G?.winner as string | null)) || null;
  const winReason = (ctxGameover?.reason ?? (G?.winReason as string | undefined)) || null;

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

  const toggleChessPick = useCallback(
    (idx: number) => {
      setChessPick((prev) => {
        if (prev.includes(idx)) return prev.filter((i) => i !== idx);
        if (prev.length >= 2) return [prev[1]!, idx]; // 保留最后 2 个
        return [...prev, idx];
      });
    },
    [setChessPick],
  );

  const confirmChessTranspose = useCallback(async () => {
    if (chessPick.length !== 2) return;
    await makeMove('useChessTranspose', [chessPick[0], chessPick[1]]);
    setChessPick([]);
  }, [chessPick, makeMove, setChessPick]);

  // 贿赂派发：移除常驻主动 UI（违反规则）。
  // 规则：仅在盗梦者使用【梦境窥视】或打开金币金库时，梦主通过响应窗口决策派发。
  // 对照：docs/manual/03-game-flow.md §贿赂&背叛者 + MasterPeekBribeBanner
  const humanFaction = (humanPlayer?.faction as string) ?? 'thief';
  const playerLayer = (humanPlayer?.currentLayer as number) ?? 1;

  // SHOOT 结算 → 骰子动画 + Toast（按结果分级）
  //   流程：检测到 SHOOT 牌打出 + lastShootRoll 有值 → 显示 ShootDiceOverlay
  //   骰子动画完成后 → Toast 通知结果
  //   判定（对照 plans/2-1-3-1-2-ui-cozy-wave.md SHOOT Toast 分级表）：
  //     - pendingShootMove != null → L2/L3 挂起中，不 toast（由 ShooterLayerPickerDialog 承担）
  //     - 某玩家 currentLayer 从 N → 0 → kill → toast.error
  //     - 某玩家 currentLayer 变化（非 0）→ move → toast.info
  //     - 所有玩家 currentLayer 无变化 → miss → toast.warn
  const lastPlayedCard = (G?.lastPlayedCardThisTurn as string | null | undefined) ?? null;
  const lastShootRoll = (G?.lastShootRoll as number | null | undefined) ?? null;
  const [shootDiceRoll, setShootDiceRoll] = useState<number | null>(null);
  const shootToastTrackRef = useRef<{ card: string | null; layers: Record<string, number> }>({
    card: null,
    layers: {},
  });

  // 检测新的 SHOOT 牌打出 → 启动骰子动画
  useEffect(() => {
    if (!G) return;
    const isShootCard =
      typeof lastPlayedCard === 'string' && lastPlayedCard.startsWith('action_shoot');
    const prev = shootToastTrackRef.current;
    if (isShootCard && lastPlayedCard !== prev.card && lastShootRoll != null) {
      setShootDiceRoll(lastShootRoll);
    }
  }, [G, lastPlayedCard, lastShootRoll]);

  // 骰子动画完成回调 → 显示 Toast
  const handleDiceComplete = useCallback(() => {
    setShootDiceRoll(null);
    if (!G || !lastPlayedCard) return;
    const nextLayers: Record<string, number> = {};
    for (const [id, p] of Object.entries(players ?? {})) {
      nextLayers[id] = (p.currentLayer as number) ?? 0;
    }
    const prev = shootToastTrackRef.current;
    const hasPendingShootMove =
      (G as unknown as { pendingShootMove?: unknown }).pendingShootMove != null;
    if (hasPendingShootMove) {
      shootToastTrackRef.current = { card: lastPlayedCard, layers: nextLayers };
      return;
    }
    let fired: 'kill' | 'move' | null = null;
    for (const [id, layer] of Object.entries(nextLayers)) {
      const prevLayer = prev.layers[id];
      if (prevLayer !== undefined && prevLayer !== layer) {
        const name = (players?.[id]?.nickname as string | undefined) ?? `P${id}`;
        if (layer === 0) {
          toast.error(`${getCardName(lastPlayedCard)} 击杀 · ${name}`);
          fired = 'kill';
        } else {
          toast.info(`${getCardName(lastPlayedCard)} 命中 · ${name} 被推至 L${layer}`);
          fired = 'move';
        }
        break;
      }
    }
    if (!fired) {
      toast.warn(`${getCardName(lastPlayedCard)} 未命中 · 目标无位移`);
    }
    shootToastTrackRef.current = { card: lastPlayedCard, layers: nextLayers };
  }, [G, players, lastPlayedCard]);

  // 有效的 pendingPlay：card 必须在当前手牌且仍是 action 阶段
  const effectivePending =
    pendingPlay && turnPhase === 'action' && isHumanTurn && humanHand.includes(pendingPlay.card)
      ? pendingPlay
      : null;

  const startPlay = useCallback(
    (card: string) => {
      // 新选一张牌 → 清掉其他 picker / pendingPlay，避免多个操作面板同时展开
      // 对照：HandDrawer 单选语义 + useGameActions 单一 intent 模型
      setPendingPlay(null);
      setDreamTransitPicker(null);
      setGravityPicker(null);

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
          {winReason && (
            <p className="mt-1 text-xs text-muted-foreground" data-testid="win-reason">
              {t(`localMatch.winReason.${winReason}`, {
                defaultValue: winReason,
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
          {turnPhase === 'action' && !effectivePending && overHand > 0 && (
            <div
              className="w-full rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400"
              data-testid="action-hand-overflow-warning"
            >
              {t('localMatch.endActionHandWarn', {
                n: overHand,
                defaultValue: '本回合结束需弃 {{n}} 张（手牌超出 5 张上限）',
              })}
            </div>
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

          {/* 目标玩家 / 目标层选择已迁至全局 Dialog（TargetPlayerPickerDialog /
              TargetLayerPickerDialog），挂载在本组件末尾的 Dialog 集群区。
              对照：plans/2-1-3-1-2-ui-cozy-wave.md 阶段 5 */}
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

      {/* 贿赂派发：遵循桌游规则（仅在梦境窥视/金币金库触发的响应窗口中进行），
          常驻主动派发 UI 已移除；决策入口走 MasterPeekBribeBanner 等响应式组件。
          对照：docs/manual/03-game-flow.md §贿赂&背叛者 / 04-action-cards.md 梦境窥视 */}

      {/* P2 内联 picker 面板（棋局·易位 / 梦境穿梭剂 mode / 万有引力 / 嫁接）
          均已迁至 Dialog（ChessTransposeDialog / DreamTransitModeDialog /
          GravityTargetPickerDialog / GravityPoolPickerDialog / GraftResolverDialog），
          挂载在本组件末尾的 Dialog 集群区。
          对照：plans/2-1-3-1-2-ui-cozy-wave.md 阶段 5 */}

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

      {/* SHOOT 骰子动画浮层 */}
      <ShootDiceOverlay roll={shootDiceRoll} onComplete={handleDiceComplete} />

      {/* 响应类 Dialog 群（互斥业务保证同时只会有一个 open） · 对照 plans/2-1-3-1-2-ui-cozy-wave.md */}
      <MasterNightmareDecisionDialog
        G={G as never}
        currentPlayerID={currentPlayerID}
        dreamMasterID={dreamMasterID}
        makeMove={makeMove}
      />
      <UnlockResponseDialog
        G={G as never}
        viewerPlayerID="0"
        nicknameOf={(id) => (players?.[id]?.nickname as string | undefined) ?? id}
        makeMove={makeMove}
      />
      <MasterPeekBribeDialog
        G={G as never}
        viewerPlayerID="0"
        nicknameOf={(id) => (players?.[id]?.nickname as string | undefined) ?? id}
        makeMove={makeMove}
      />
      <PeekerVaultRevealDialog G={G as never} viewerPlayerID="0" makeMove={makeMove} />
      <MasterBribeInspectDialog G={G as never} viewerPlayerID="0" makeMove={makeMove} />
      <ShooterLayerPickerDialog
        G={G as never}
        viewerPlayerID="0"
        nicknameOf={(id) => (players?.[id]?.nickname as string | undefined) ?? id}
        cardNameOf={(cardId) => getCardName(cardId)}
        makeMove={makeMove}
      />

      {/* 出牌时选目标玩家（SHOOT / KICK / 念力牵引 / 共鸣 / shift 等） */}
      <TargetPlayerPickerDialog
        pending={
          isHumanTurn && turnPhase === 'action' && effectivePending?.needsTarget === 'player'
            ? { card: effectivePending.card, move: effectivePending.move }
            : null
        }
        viewerPlayerID="0"
        viewerLayer={playerLayer}
        players={
          (players as unknown as
            | Record<string, { isAlive: boolean; currentLayer: number; nickname?: string }>
            | undefined) ?? {}
        }
        cardNameOf={(cardId) => getCardName(cardId)}
        onPick={(id) => void confirmPlayTargetPlayer(id)}
        onCancel={() => {
          cancelPlay();
          setDecreePick(null);
        }}
        decreeSlot={(() => {
          if (!effectivePending) return null;
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
      />

      {/* 出牌时选目标层（穿梭剂 / 梦境窥视 / 梦魇解封 等） */}
      <TargetLayerPickerDialog
        pending={
          isHumanTurn && turnPhase === 'action' && effectivePending?.needsTarget === 'layer'
            ? { card: effectivePending.card, move: effectivePending.move }
            : null
        }
        viewerLayer={playerLayer}
        cardNameOf={(cardId) => getCardName(cardId)}
        onPick={(layer) => void confirmPlayTargetLayer(layer)}
        onCancel={cancelPlay}
      />

      {/* SHOOT·梦境穿梭剂 mode 选择 */}
      <DreamTransitModeDialog
        open={dreamTransitPicker != null}
        onChoose={(mode) => chooseDreamMode(mode)}
        onCancel={() => setDreamTransitPicker(null)}
      />

      {/* 棋局·易位（梦主专属） */}
      <ChessTransposeDialog
        open={isChessMaster && !effectivePending && !!vaultsRaw}
        vaults={(vaultsRaw ?? []).map((v) => ({
          id: v.id as string,
          layer: v.layer as number,
          isOpened: v.isOpened as boolean,
        }))}
        pickedIndices={chessPick}
        onToggle={toggleChessPick}
        onConfirm={() => void confirmChessTranspose()}
        onCancel={() => setChessPick([])}
      />

      {/* 万有引力 · 多目标选择 */}
      <GravityTargetPickerDialog
        open={gravityPicker != null && players != null}
        viewerPlayerID="0"
        options={Object.entries(players ?? {}).map(([id, p]) => ({
          id,
          name: (p.nickname as string | undefined) ?? `AI ${id}`,
          isAlive: p.isAlive as boolean,
        }))}
        selected={gravityPicker?.targets ?? []}
        onToggle={toggleGravityTarget}
        onConfirm={() => void confirmGravity()}
        onCancel={() => setGravityPicker(null)}
      />

      {/* 万有引力 · 池挑选（人类 bonder） */}
      <GravityPoolPickerDialog
        open={isHumanGravityBonder && pendingGravity != null}
        pool={pendingGravity?.pool ?? []}
        currentPicker={
          pendingGravity?.pickOrder?.[
            (pendingGravity?.pickCursor ?? 0) % Math.max(1, pendingGravity?.pickOrder?.length ?? 1)
          ] ?? '0'
        }
        viewerPlayerID="0"
        cardNameOf={(cardId) => getCardName(cardId)}
        onPick={(c) => void pickGravityCard(c)}
      />

      {/* 嫁接 · 选 2 张返牌库顶 */}
      <GraftResolverDialog
        open={isHumanGraftPending}
        hand={humanHand}
        picked={effectiveGraftPick}
        cardNameOf={(cardId) => getCardName(cardId)}
        onToggle={toggleGraftPick}
        onConfirm={() => void confirmGraft()}
      />

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
