// 对局界面控制层：从对局来源的视图推导界面状态，持有出牌 / 弃牌 / 选目标等交互流程的本地状态与回调。
// 不含任何 JSX，与布局无关；布局组件与弹窗群只消费返回的 MatchController。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MatchView } from '@icgame/game-engine';
import { logger } from '../../lib/logger';
import { getCardName } from '../../lib/cards';
import { preloadAllCardImages } from '../../lib/cardImages';
import type { ActiveSkillDescriptor } from '../../lib/activeSkills';
import type { MatchSource } from '../../match/matchSource';
import { toast } from '@/lib/toast';
import { rejectMessage } from '../RemoteMatchRuntime/rejectMessage';
import { awaitingNotice } from './awaitingNotice';
import { useAwaitedResponse } from './response/useAwaitedResponse';
import { remainingSeconds, useSecondClock } from './deadline';
import { otherTurnLabel } from './turnLabel';
import {
  activeSkillTargetIds,
  buildActiveSkillContext,
  chessAvailable,
  chessDialogOpen,
  type ChessDialogChoice,
  unopenedVaultCount,
  buildPlayArgs,
  CHESS_SKILL_ID,
  classifyShoot,
  commitPlanFor,
  decreeApplicable,
  decreeCardsIn,
  deriveHandItems,
  deriveOutcome,
  discardCardsFor,
  dreamTransitPending,
  effectiveDiscardSelection,
  effectivePendingPlay,
  gravityCurrentPicker,
  handCardMode,
  layersOfPlayers,
  nicknameMap,
  overflowCount,
  pendingPlayFor,
  shootToastFor,
  toggleDiscardSelection,
  toggleGravityTargets,
  toggleKeepLastTwo,
  viewOf,
} from './controllerDerive';
import type {
  MatchController,
  MatchMakeMove,
  PendingPlay,
  PreloadProgress,
  SelfInfo,
  SkillPanelModel,
} from './controllerTypes';

export function useMatchController(source: MatchSource): MatchController {
  const { t } = useTranslation();
  const sourceView = source.view;
  const gameState = useMemo(() => viewOf(sourceView), [sourceView]);
  const error = source.error;
  const mySeat = source.seat;
  // 需要字符串的子组件入参；就绪前界面显示加载态，不会用到
  const viewerSeat = mySeat ?? '';
  // 长按 / 双击预览的卡牌 ID
  const [previewCard, setPreviewCard] = useState<string | null>(null);
  // 卡图预载进度
  const [preloadProgress, setPreloadProgress] = useState<PreloadProgress | null>(null);

  // 挂载：打点 + 后台预加载所有卡图（不阻塞对局）· 浏览器 HTTP cache 接管后续 <img> 秒出
  const sourceKind = source.kind;
  useEffect(() => {
    logger.flow('game', 'runtime mount', { kind: sourceKind });
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
  }, [sourceKind]);

  const sourceMakeMove = source.makeMove;
  // 包一层：被拒时提示并留日志；自动发出的 move（silent）被拒不提示
  const makeMove: MatchMakeMove = useCallback(
    async (move: string, args: unknown[] = [], opts?: { silent?: boolean }) => {
      const outcome = await sourceMakeMove(move, args);
      if (!outcome.ok) {
        logger.warn('game/move', 'move rejected', { move, code: outcome.code });
        const key = opts?.silent ? null : rejectMessage(outcome.code);
        if (key) toast.warn(t(key));
      }
      return outcome;
    },
    [sourceMakeMove, t],
  );

  const deadlineAt = source.deadlineAt;
  const clockNow = useSecondClock(deadlineAt !== null);
  const deadlineSeconds = remainingSeconds(deadlineAt, clockNow);
  const awaiting = useMemo(
    () => (sourceView ? awaitingNotice(sourceView.G as MatchView, mySeat) : null),
    [sourceView, mySeat],
  );
  const response = useAwaitedResponse({
    view: sourceView ? (sourceView.G as MatchView) : undefined,
    seat: mySeat,
    makeMove,
    deadlineSeconds,
  });

  const isRemote = sourceKind === 'remote';
  const selfTakenOver = source.selfTakenOver;
  // 托管的开始与取消各打一条流程日志；首次渲染时本来就没托管，不记
  const wasTakenOver = useRef(false);
  useEffect(() => {
    if (wasTakenOver.current === selfTakenOver) return;
    wasTakenOver.current = selfTakenOver;
    logger.flow('game', selfTakenOver ? 'self takeover started' : 'self takeover released', {
      seat: mySeat,
    });
  }, [selfTakenOver, mySeat]);
  const seatById = useMemo(() => new Map(source.seats.map((s) => [s.seat, s])), [source.seats]);

  const G = gameState?.G;
  const ctx = gameState?.ctx;
  const { winner, winReason } = deriveOutcome(G, ctx);

  // 胜负一旦产生，打一次 INFO
  useEffect(() => {
    if (winner) logger.flow('game', 'match ended', { winner });
  }, [winner]);

  const turnNumber = (G?.turnNumber as number) ?? 0;
  const turnPhase = (G?.turnPhase as string) ?? '';
  const currentPlayerID = (ctx?.currentPlayer as string) ?? '';
  const isMyTurn = mySeat !== null && currentPlayerID === mySeat;
  const players = G?.players;
  const otherTurn = otherTurnLabel(
    seatById.get(currentPlayerID),
    (players?.[currentPlayerID]?.nickname as string | undefined) ?? currentPlayerID,
  );
  const humanPlayer = mySeat === null ? undefined : players?.[mySeat];
  const vaultsRaw = G?.vaults;
  const dreamMasterID = (G?.dreamMasterID as string) ?? '';

  // 人类弃牌交互：超过手牌上限（5）时必须选择要弃的牌
  const humanHand = useMemo(() => (humanPlayer?.hand as string[]) ?? [], [humanPlayer]);
  const overHand = overflowCount(humanHand.length);
  // 弃牌选择按手牌位置记录（手里有同名牌时各算一张）；带上回合号，跨回合的残留自动失效
  const [discardPick, setDiscardPick] = useState<{ turn: number; picked: readonly number[] }>({
    turn: -1,
    picked: [],
  });
  const currentDiscardPick = discardPick.turn === turnNumber ? discardPick.picked : [];

  // 仅保留仍在手牌范围内 + 当前确实在 discard 阶段的选中，避免 stale 残留
  const effectiveSelected = effectiveDiscardSelection(
    currentDiscardPick,
    humanHand.length,
    turnPhase,
    isMyTurn,
  );

  // 出牌意图：action 阶段选中一张需要目标的牌后进入选目标模式
  const [pendingPlay, setPendingPlay] = useState<PendingPlay | null>(null);

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
        const targets = toggleGravityTargets(prev.targets, pid);
        return targets === prev.targets ? prev : { ...prev, targets };
      });
    },
    [setGravityPicker],
  );
  const confirmGravity = useCallback(async () => {
    if (!gravityPicker || gravityPicker.targets.length < 1) return;
    await makeMove('playGravity', [gravityPicker.card, [...gravityPicker.targets]]);
    setGravityPicker(null);
  }, [gravityPicker, makeMove, setGravityPicker]);

  // 棋局·易位：选中的 2 个金库索引，以及本回合对弹窗做过的处理（关闭 / 主动打开）
  const [chessPick, setChessPick] = useState<number[]>([]);
  const [chessChoice, setChessChoice] = useState<ChessDialogChoice | null>(null);
  const humanCharacterId = (humanPlayer?.characterId as string) ?? '';

  const toggleChessPick = useCallback(
    (idx: number) => {
      setChessPick((prev) => toggleKeepLastTwo(prev, idx));
    },
    [setChessPick],
  );

  // 本回合关闭弹窗：不再自动弹出，之后仍可从技能入口主动打开
  const dismissChess = useCallback(() => {
    setChessPick([]);
    setChessChoice({ turn: turnNumber, mode: 'dismissed' });
  }, [turnNumber]);
  const showChess = useCallback(() => {
    setChessPick([]);
    setChessChoice({ turn: turnNumber, mode: 'shown' });
  }, [turnNumber]);
  const confirmChessTranspose = useCallback(async () => {
    if (chessPick.length !== 2) return;
    const outcome = await makeMove('useChessTranspose', [chessPick[0], chessPick[1]]);
    setChessPick([]);
    if (outcome.ok) setChessChoice({ turn: turnNumber, mode: 'dismissed' });
  }, [chessPick, makeMove, setChessPick, turnNumber]);

  // 贿赂派发：移除常驻主动 UI（违反规则）。
  // 规则：仅在盗梦者使用【梦境窥视】或打开金币金库时，梦主通过响应窗口决策派发。
  // 对照：docs/manual/03-game-flow.md §贿赂&背叛者 + MasterPeekBribeBanner
  const humanFaction = (humanPlayer?.faction as string) ?? 'thief';
  const playerLayer = (humanPlayer?.currentLayer as number) ?? 1;

  // SHOOT 结算 → 骰子动画 + Toast（按结果分级）
  //   流程：检测到 SHOOT 牌打出 + lastShootRoll 有值 → 显示 ShootDiceOverlay
  //   骰子动画完成后 → Toast 通知结果
  //   判定（SHOOT Toast 分级，见 classifyShoot）：
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
    const nextLayers = layersOfPlayers(players);
    const prev = shootToastTrackRef.current;
    const outcome = classifyShoot(prev.layers, nextLayers, G.pendingShootMove != null);
    shootToastTrackRef.current = { card: lastPlayedCard, layers: nextLayers };
    const message = shootToastFor(
      outcome,
      getCardName(lastPlayedCard),
      (id) => (players?.[id]?.nickname as string | undefined) ?? `P${id}`,
    );
    if (message) toast[message.level](message.text);
  }, [G, players, lastPlayedCard]);

  // 有效的 pendingPlay：card 必须在当前手牌且仍是 action 阶段
  const effectivePending = effectivePendingPlay(pendingPlay, turnPhase, isMyTurn, humanHand);

  const startPlay = useCallback(
    (card: string) => {
      // 新选一张牌 → 清掉其他 picker / pendingPlay，避免多个操作面板同时展开
      // 对照：HandDrawer 单选语义（同一时刻只有一个出牌意图）
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
      const next = pendingPlayFor(card);
      if (!next) return;
      setPendingPlay(next);
    },
    [setDreamTransitPicker, setGravityPicker, setPendingPlay],
  );

  const chooseDreamMode = useCallback(
    (mode: 'shoot' | 'transit') => {
      if (!dreamTransitPicker) return;
      setPendingPlay(dreamTransitPending(dreamTransitPicker, mode));
      setDreamTransitPicker(null);
    },
    [dreamTransitPicker, setDreamTransitPicker, setPendingPlay],
  );

  const confirmPlayNoTarget = useCallback(async () => {
    if (!effectivePending || effectivePending.needsTarget !== 'none') return;
    // playUnlock / playCreation 需要 cardId 参数
    await makeMove(effectivePending.move, buildPlayArgs(effectivePending));
    setPendingPlay(null);
  }, [effectivePending, makeMove]);

  const confirmPlayTargetPlayer = useCallback(
    async (targetPlayerID: string) => {
      if (!effectivePending || effectivePending.needsTarget !== 'player') return;
      await makeMove(
        effectivePending.move,
        buildPlayArgs(effectivePending, targetPlayerID, decreePick),
      );
      setPendingPlay(null);
      setDecreePick(null);
    },
    [effectivePending, makeMove, decreePick, setDecreePick],
  );

  const confirmPlayTargetLayer = useCallback(
    async (targetLayer: number) => {
      if (!effectivePending || effectivePending.needsTarget !== 'layer') return;
      await makeMove(effectivePending.move, buildPlayArgs(effectivePending, targetLayer));
      setPendingPlay(null);
    },
    [effectivePending, makeMove],
  );

  const cancelPlay = useCallback(() => setPendingPlay(null), []);

  // 嫁接 pending resolver：抽 3 后选 2 张返牌库顶
  const pendingGraft = G?.pendingGraft;
  const isHumanGraftPending = pendingGraft?.playerID === mySeat && isMyTurn;
  const [graftPick, setGraftPick] = useState<string[]>([]);
  const toggleGraftPick = useCallback((card: string) => {
    setGraftPick((prev) => toggleKeepLastTwo(prev, card));
  }, []);
  // 派生：只保留仍在手牌中且处于 pending 时的选择
  const effectiveGraftPick = useMemo(
    () => (isHumanGraftPending ? graftPick.filter((c) => humanHand.includes(c)) : []),
    [isHumanGraftPending, graftPick, humanHand],
  );

  // pendingGravity 人类 bonder 驱动池挑选
  const pendingGravity = G?.pendingGravity;
  const isHumanGravityBonder = pendingGravity?.bonderPlayerID === mySeat;
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
    (index: number) => {
      setDiscardPick((prev) => ({
        turn: turnNumber,
        picked: toggleDiscardSelection(
          prev.turn === turnNumber ? prev.picked : [],
          index,
          overHand,
        ),
      }));
    },
    [overHand, turnNumber],
  );

  const handModeInput = { turnPhase, isMyTurn, winner, overHand };
  const handItems = deriveHandItems(humanHand, {
    ...handModeInput,
    selectedDiscard: effectiveSelected,
    pendingCard: effectivePending?.card,
  });
  const tapHandCard = (index: number) => {
    const card = humanHand[index];
    if (card === undefined) return;
    if (handCardMode(card, handModeInput) === 'discard') toggleDiscard(index);
  };

  // 确认打出一张牌：无目标直接发 move；需要目标 / 穿梭剂 / 万有引力与一步出牌相同，进入各自的选择流程
  const commitPlay = useCallback(
    (card: string) => {
      const input = { turnPhase, isMyTurn, winner, overHand };
      if (!humanHand.includes(card) || handCardMode(card, input) !== 'play') return;
      const plan = commitPlanFor(card);
      if (!plan) return;
      if (plan.kind === 'direct') {
        cancelPlay();
        void makeMove(plan.pending.move, buildPlayArgs(plan.pending));
        return;
      }
      startPlay(card);
    },
    [humanHand, turnPhase, isMyTurn, winner, overHand, makeMove, cancelPlay, startPlay],
  );

  const self: SelfInfo | null =
    humanPlayer && mySeat !== null
      ? {
          seat: mySeat,
          characterId: humanCharacterId,
          faction: humanFaction,
          layer: playerLayer,
          isAlive: !!humanPlayer.isAlive,
          bribeReceived:
            typeof humanPlayer.bribeReceived === 'number'
              ? (humanPlayer.bribeReceived as number)
              : 0,
        }
      : null;

  // 棋局·易位：只在行动阶段、没有别的待办占着界面时可用
  const hasOtherPending =
    effectivePending !== null ||
    dreamTransitPicker !== null ||
    gravityPicker !== null ||
    isHumanGraftPending ||
    G?.pendingUnlock != null ||
    G?.pendingGravity != null ||
    G?.pendingResponseWindow != null ||
    G?.pendingShootMove != null ||
    response.awaited !== null;
  const chessIsAvailable = chessAvailable({
    characterId: humanCharacterId,
    isMyTurn,
    turnPhase,
    winner,
    busy: hasOtherPending,
    usedThisGame: humanPlayer?.skillUsedThisGame?.[CHESS_SKILL_ID] ?? 0,
    unopenedVaults: unopenedVaultCount(vaultsRaw ?? []),
  });

  // 角色主动技能面板（影子·潜伏 / 阿波罗·崇拜）：非本人回合或对局结束不显示
  let skillPanel: SkillPanelModel | null = null;
  if (G && isMyTurn && !winner) {
    skillPanel = {
      context: buildActiveSkillContext({ G, seat: mySeat, isMyTurn, hand: humanHand }),
      targetIds: activeSkillTargetIds(players, mySeat),
      nicknames: nicknameMap(players),
      invoke: (skill: ActiveSkillDescriptor, args: unknown[]) => {
        // 棋局·易位要先选两个金库，打开弹窗而不是直接发 move
        if (skill.move === 'useChessTranspose') {
          showChess();
          return;
        }
        void makeMove(skill.move, args);
      },
    };
  }

  const openPreview = useCallback((cardId: string) => setPreviewCard(cardId), []);
  const closePreview = useCallback(() => setPreviewCard(null), []);

  const canConfirmDiscard = effectiveSelected.length === overHand;

  return {
    ready: gameState !== null,
    error,
    kind: sourceKind,
    isRemote,
    winner,
    winReason,
    preload: preloadProgress,

    view: G,
    viewerSeat,
    viewerLayer: playerLayer,
    dreamMasterID,
    seatById,
    stage:
      gameState && mySeat !== null
        ? { G: gameState.G, ctx: gameState.ctx, humanPlayerID: mySeat, seats: source.seats }
        : null,
    nicknameOf: (id: string) => (players?.[id]?.nickname as string | undefined) ?? id,

    turn: {
      number: turnNumber,
      phase: turnPhase,
      currentSeat: currentPlayerID,
      isMine: isMyTurn,
      otherTurn,
      deadlineSeconds,
      deadlineAt,
      awaiting,
    },
    takeover: {
      active: selfTakenOver,
      bannerVisible: isRemote && selfTakenOver,
      resume: source.resume,
    },
    self,
    hand: {
      available: Array.isArray(humanPlayer?.hand),
      cards: humanHand,
      items: handItems,
      overflow: overHand,
      mustDiscard: turnPhase === 'discard' && overHand > 0 && isMyTurn,
      tap: tapHandCard,
    },

    makeMove,
    play: {
      pending: effectivePending,
      commit: commitPlay,
      confirmNoTarget: confirmPlayNoTarget,
      confirmTargetPlayer: confirmPlayTargetPlayer,
      confirmTargetLayer: confirmPlayTargetLayer,
      cancel: cancelPlay,
      targetPlayerPending:
        isMyTurn && turnPhase === 'action' && effectivePending?.needsTarget === 'player'
          ? { card: effectivePending.card, move: effectivePending.move }
          : null,
      targetLayerPending:
        isMyTurn && turnPhase === 'action' && effectivePending?.needsTarget === 'layer'
          ? { card: effectivePending.card, move: effectivePending.move }
          : null,
      cancelTargetPlayer: () => {
        cancelPlay();
        setDecreePick(null);
      },
      dreamTransit: {
        open: dreamTransitPicker != null,
        choose: chooseDreamMode,
        cancel: () => setDreamTransitPicker(null),
      },
      decree: {
        options: decreeCardsIn(humanHand),
        selected: decreePick,
        toggle: toggleDecree,
        clear: () => setDecreePick(null),
        applicable: decreeApplicable(effectivePending, humanHand),
      },
    },
    actions: {
      draw: () => void makeMove('doDraw'),
      endAction: () => void makeMove('endActionPhase'),
      skipDiscard: () => void makeMove('skipDiscard'),
      confirmDiscard: () => {
        void makeMove('doDiscard', [discardCardsFor(humanHand, effectiveSelected)]);
        setDiscardPick({ turn: -1, picked: [] });
      },
      discardSelected: effectiveSelected.length,
      discardRequired: overHand,
      canConfirmDiscard,
    },

    gravity: {
      pickerOpen: gravityPicker != null && players != null,
      targets: gravityPicker?.targets ?? [],
      options: Object.entries(players ?? {}).map(([id, p]) => ({
        id,
        name: p.nickname,
        isAlive: p.isAlive as boolean,
      })),
      toggle: toggleGravityTarget,
      confirm: confirmGravity,
      cancel: () => setGravityPicker(null),
      pool: {
        open: isHumanGravityBonder && pendingGravity != null,
        cards: pendingGravity?.pool ?? [],
        currentPicker: gravityCurrentPicker(pendingGravity, viewerSeat),
        pick: pickGravityCard,
      },
    },
    chess: {
      open: chessDialogOpen(chessIsAvailable, turnNumber, chessChoice),
      available: chessIsAvailable,
      show: showChess,
      vaults: (vaultsRaw ?? []).map((v) => ({
        id: v.id as string,
        layer: v.layer as number,
        isOpened: v.isOpened as boolean,
      })),
      picked: chessPick,
      toggle: toggleChessPick,
      confirm: confirmChessTranspose,
      cancel: dismissChess,
    },
    graft: {
      open: isHumanGraftPending,
      hand: humanHand,
      picked: effectiveGraftPick,
      toggle: toggleGraftPick,
      confirm: confirmGraft,
    },
    response,
    shootDice: { roll: shootDiceRoll, onComplete: handleDiceComplete },

    skillPanel,
    preview: { cardId: previewCard, open: openPreview, close: closePreview },
  };
}
