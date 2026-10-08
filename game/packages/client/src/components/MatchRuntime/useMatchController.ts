// 对局界面控制层：从对局来源的视图推导界面状态，持有出牌 / 弃牌 / 选目标等交互流程的本地状态与回调。
// 不含任何 JSX，与布局无关；布局组件与弹窗群只消费返回的 MatchController。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MatchView } from '@icgame/game-engine';
import { logger } from '../../lib/logger';
import { getCardName, type PlayRole } from '../../lib/cards';
import type { ActiveSkillDescriptor } from '../../lib/activeSkills';
import { handCardsAt, validHandPicks, toggleHandPick } from '../../lib/handPick';
import type { MatchSource } from '../../match/matchSource';
import { toast } from '@/lib/toast';
import { rejectMessage } from '../RemoteMatchRuntime/rejectMessage';
import { awaitingNotice } from './awaitingNotice';
import { useAwaitedResponse } from './response/useAwaitedResponse';
import { useMatchAssets } from './useMatchAssets';
import { reportTargets } from './reportTargets';
import { useMatchChat } from './useMatchChat';
import { remainingSeconds, useSecondClock } from './deadline';
import { otherTurnLabel } from './turnLabel';
import {
  adaptPlayForCharacter,
  activeSkillLostTargetIds,
  activeSkillTargetIds,
  bribeHolderIds,
  derivePlayRules,
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
  discardRequiredOf,
  dreamTransitPending,
  effectiveDiscardSelection,
  effectivePendingPlay,
  gravityCurrentPicker,
  handCardMode,
  layersOfPlayers,
  nicknameMap,
  pendingPlayFor,
  playLayerChoices,
  shootToastFor,
  toggleDiscardSelection,
  toggleGravityTargets,
  toggleKeepLastTwo,
  viewOf,
} from './controllerDerive';
import {
  adjacentLayers,
  canConfirmRevive,
  deriveDockEntries,
  isSecretPassageActive,
  reviveArgs,
  reviveCardEligible,
  reviveRequirement,
  reviveTargetIds,
  type DockEntryKind,
} from './model/dockEntries';
import {
  EMPTY_TOUR,
  buildDistribution,
  canConfirmTour,
  pickTourRecipient,
  tapTourCard,
  tourProgress,
  tourRecipientIds,
  validTourState,
  type TourState,
} from './model/tourDistribution';
import type {
  DockEntry,
  MatchController,
  MatchMakeMove,
  PendingPlay,
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
  const sourceKind = source.kind;
  useEffect(() => {
    logger.flow('game', 'runtime mount', { kind: sourceKind });
  }, [sourceKind]);

  // 素材预加载：进对局前取牌种全集与本人视图里可见的牌，之后空闲时再取其余
  const assets = useMatchAssets(gameState ? (gameState.G as MatchView) : undefined, mySeat);

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
  // 本人出牌的一方；单独算成字符串，免得依赖下面那个会传给别的函数的规则对象
  const playRole: PlayRole = mySeat !== null && mySeat === dreamMasterID ? 'master' : 'thief';
  // 出牌规则所需的信息：是否存活、本回合复活过自己、梦主的窥视有没有目标
  const playRules = useMemo(() => derivePlayRules(G, mySeat), [G, mySeat]);

  // 人类弃牌交互：弃牌阶段必须弃的张数由视图给出（手牌上限可能被巨蟹·庇佑取消）
  const humanHand = useMemo(() => (humanPlayer?.hand as string[]) ?? [], [humanPlayer]);
  const overHand = discardRequiredOf(G);
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
  // 射手·禁足：打出普通 SHOOT 时选择令目标不移动
  const [preventMovePick, setPreventMovePick] = useState(false);
  const togglePreventMove = useCallback(
    () => setPreventMovePick((prev) => !prev),
    [setPreventMovePick],
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

  // 贿赂派发没有常驻主动入口：仅在盗梦者使用【梦境窥视】（MasterPeekBribeDialog）
  // 或打开金币金库（MasterNightmareDecisionDialog 三选一）时，由梦主应答。
  // 对照：docs/manual/03-game-flow.md §贿赂&背叛者
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
  const effectivePending = adaptPlayForCharacter(
    effectivePendingPlay(pendingPlay, turnPhase, isMyTurn, humanHand),
    humanCharacterId,
  );
  // 射手·禁足只对普通 SHOOT（playShoot）生效，且要选了目标玩家的出牌意图
  const preventMoveApplicable =
    humanCharacterId === 'thief_sagittarius' &&
    effectivePending?.move === 'playShoot' &&
    effectivePending.needsTarget === 'player';

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
      const next = pendingPlayFor(card, playRole);
      if (!next) return;
      setPendingPlay(next);
    },
    [playRole, setDreamTransitPicker, setGravityPicker, setPendingPlay],
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
        buildPlayArgs(
          effectivePending,
          targetPlayerID,
          decreePick,
          preventMoveApplicable && preventMovePick,
        ),
      );
      setPendingPlay(null);
      setDecreePick(null);
      setPreventMovePick(false);
    },
    [
      effectivePending,
      makeMove,
      decreePick,
      setDecreePick,
      preventMoveApplicable,
      preventMovePick,
      setPreventMovePick,
    ],
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
  // 放回的牌按手牌位置记录（手里有同名牌时能各选一张），发 move 时再换成牌 id
  const [graftPick, setGraftPick] = useState<number[]>([]);
  const toggleGraftPick = useCallback((index: number) => {
    setGraftPick((prev) => toggleKeepLastTwo(prev, index));
  }, []);
  // 派生：只保留仍落在手牌范围内且处于 pending 时的选择
  const effectiveGraftPick = useMemo(
    () => (isHumanGraftPending ? validHandPicks(graftPick, humanHand.length) : []),
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
    await makeMove('resolveGraft', [handCardsAt(humanHand, effectiveGraftPick)]);
    setGraftPick([]);
  }, [effectiveGraftPick, humanHand, makeMove]);

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

  const handModeInput = { turnPhase, isMyTurn, winner, overHand, rules: playRules };
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
      const input = { turnPhase, isMyTurn, winner, overHand, rules: playRules };
      if (!humanHand.includes(card) || handCardMode(card, input) !== 'play') return;
      const plan = commitPlanFor(card, playRole);
      if (!plan) return;
      if (plan.kind === 'direct') {
        cancelPlay();
        void makeMove(plan.pending.move, buildPlayArgs(plan.pending));
        return;
      }
      startPlay(card);
    },
    [
      humanHand,
      turnPhase,
      isMyTurn,
      winner,
      overHand,
      playRules,
      playRole,
      makeMove,
      cancelPlay,
      startPlay,
    ],
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

  // 角色主动技能面板：对局结束不显示；非本人回合时面板里只会有「回合外也能发动」的技能
  // （空间女王·造物：任意玩家的弃牌阶段），其余由 getSkillEntries 按 isHumanTurn 过滤掉
  let skillPanel: SkillPanelModel | null = null;
  if (G && mySeat !== null && !winner) {
    skillPanel = {
      context: buildActiveSkillContext({ G, seat: mySeat, isMyTurn, hand: humanHand }),
      targetIds: activeSkillTargetIds(players, mySeat),
      lostTargetIds: activeSkillLostTargetIds(players, mySeat),
      nicknames: nicknameMap(players),
      invoke: (skill: ActiveSkillDescriptor, args: unknown[]) => {
        // 棋局·易位要先选两个金库，打开弹窗而不是直接发 move
        if (skill.move === 'useChessTranspose') {
          showChess();
          return;
        }
        logger.flow('game/move', 'active skill', { skill: skill.id, move: skill.move });
        void makeMove(skill.move, args);
      },
    };
  }

  // 底部坞入口：复活（本人在迷失层）/ 复活同伴 / 梦主的移动；弹层的草稿跟着回合与阶段走，换了就失效
  const dockStamp = `${turnNumber}:${turnPhase}`;
  const [reviveDraft, setReviveDraft] = useState<{
    stamp: string;
    mode: 'self' | 'other';
    target: string | null;
    picked: number[];
  } | null>(null);
  const [moveOpenStamp, setMoveOpenStamp] = useState<string | null>(null);
  // 黑天鹅·纷飞的分发草稿，同样跟着回合与阶段走
  const [tourDraft, setTourDraft] = useState<{ stamp: string; state: TourState } | null>(null);
  const entrySpecs = useMemo(
    () =>
      G && mySeat !== null && players
        ? deriveDockEntries({
            seat: mySeat,
            dreamMasterID,
            players,
            hand: humanHand,
            isMyTurn,
            turnPhase,
            winner,
            busy: hasOtherPending,
          })
        : [],
    [G, mySeat, players, dreamMasterID, humanHand, isMyTurn, turnPhase, winner, hasOtherPending],
  );
  const reviveTargets = useMemo(
    () =>
      mySeat !== null && players
        ? reviveTargetIds(players, mySeat).map((id) => ({
            id,
            name: (players[id]?.nickname as string | undefined) ?? id,
          }))
        : [],
    [mySeat, players],
  );
  const tourRecipients = useMemo(
    () =>
      mySeat !== null && players
        ? tourRecipientIds(players, mySeat, dreamMasterID).map((id) => ({
            id,
            name: (players[id]?.nickname as string | undefined) ?? id,
          }))
        : [],
    [mySeat, players, dreamMasterID],
  );
  const passage = useMemo(
    () => (players ? isSecretPassageActive(players, dreamMasterID) : false),
    [players, dreamMasterID],
  );
  const requirement = reviveRequirement(passage);

  const openEntry = useCallback(
    (kind: DockEntryKind) => {
      cancelPlay();
      if (kind === 'masterMove') {
        setMoveOpenStamp(dockStamp);
        return;
      }
      // 抽牌阶段的两个入口不需要选参数，直接发 move
      if (kind === 'skipDraw' || kind === 'jokerGamble') {
        const move = kind === 'skipDraw' ? 'skipDraw' : 'playJokerGamble';
        logger.flow('game/move', 'draw phase entry', { move });
        void makeMove(move);
        return;
      }
      if (kind === 'blackSwanTour') {
        // 只有一位接收者时直接选中他
        setTourDraft({
          stamp: dockStamp,
          state: {
            ...EMPTY_TOUR,
            active: tourRecipients.length === 1 ? tourRecipients[0]!.id : null,
          },
        });
        return;
      }
      const mode = kind === 'reviveSelf' ? 'self' : 'other';
      setReviveDraft({
        stamp: dockStamp,
        mode,
        target: mode === 'other' && reviveTargets.length === 1 ? reviveTargets[0]!.id : null,
        picked: [],
      });
    },
    [
      cancelPlay,
      dockStamp,
      makeMove,
      reviveTargets,
      setMoveOpenStamp,
      setReviveDraft,
      setTourDraft,
      tourRecipients,
    ],
  );
  const entries: DockEntry[] = entrySpecs.map((spec) => ({
    ...spec,
    open: () => {
      if (spec.enabled) openEntry(spec.kind);
    },
  }));

  const activeReviveDraft =
    reviveDraft !== null && reviveDraft.stamp === dockStamp ? reviveDraft : null;
  const reviveEntryKind: DockEntryKind | null = activeReviveDraft
    ? activeReviveDraft.mode === 'self'
      ? 'reviveSelf'
      : 'reviveOther'
    : null;
  const reviveOpen =
    reviveEntryKind !== null && entrySpecs.some((e) => e.kind === reviveEntryKind && e.enabled);
  const reviveTarget =
    activeReviveDraft && reviveTargets.some((t) => t.id === activeReviveDraft.target)
      ? activeReviveDraft.target
      : null;
  const revivePickedRaw = activeReviveDraft?.picked;
  const revivePicked = useMemo(
    () =>
      revivePickedRaw
        ? validHandPicks(revivePickedRaw, humanHand.length).filter((i) =>
            reviveCardEligible(humanHand[i]!, passage),
          )
        : [],
    [revivePickedRaw, humanHand, passage],
  );
  const reviveCanConfirm =
    reviveOpen &&
    activeReviveDraft !== null &&
    canConfirmRevive({
      mode: activeReviveDraft.mode,
      target: reviveTarget,
      hand: humanHand,
      picked: revivePicked,
      passage,
    });
  const toggleRevivePick = useCallback(
    (index: number) => {
      const card = humanHand[index];
      if (card === undefined || !reviveCardEligible(card, passage)) return;
      setReviveDraft((prev) =>
        prev
          ? { ...prev, picked: [...toggleHandPick(prev.picked, index, requirement.count)] }
          : prev,
      );
    },
    [humanHand, passage, requirement.count, setReviveDraft],
  );
  const confirmRevive = useCallback(async () => {
    if (!activeReviveDraft || !reviveCanConfirm) return;
    const args = reviveArgs(
      activeReviveDraft.mode === 'self' ? null : reviveTarget,
      humanHand,
      revivePicked,
    );
    logger.flow('game/move', 'revive', {
      mode: activeReviveDraft.mode,
      target: args[0],
      cards: args[1],
    });
    const outcome = await makeMove('playRevive', args);
    if (outcome.ok) setReviveDraft(null);
  }, [
    activeReviveDraft,
    reviveCanConfirm,
    reviveTarget,
    humanHand,
    revivePicked,
    makeMove,
    setReviveDraft,
  ]);

  const tourOpen =
    tourDraft !== null &&
    tourDraft.stamp === dockStamp &&
    entrySpecs.some((e) => e.kind === 'blackSwanTour' && e.enabled);
  const tourState = validTourState(
    tourDraft?.state ?? EMPTY_TOUR,
    humanHand.length,
    tourRecipients.map((r) => r.id),
  );
  const tourCanConfirm =
    tourOpen &&
    canConfirmTour(
      tourState.assigned,
      humanHand.length,
      tourRecipients.map((r) => r.id),
    );
  const confirmTour = useCallback(async () => {
    if (!tourCanConfirm) return;
    const distribution = buildDistribution(humanHand, tourState.assigned);
    logger.flow('game/move', 'black swan tour', {
      recipients: Object.keys(distribution),
      cards: humanHand.length,
    });
    const outcome = await makeMove('playBlackSwanTour', [distribution]);
    if (outcome.ok) setTourDraft(null);
  }, [tourCanConfirm, humanHand, tourState.assigned, makeMove, setTourDraft]);

  const masterMoveOpen =
    moveOpenStamp === dockStamp && entrySpecs.some((e) => e.kind === 'masterMove' && e.enabled);
  const pickMasterMoveLayer = useCallback(
    async (layer: number) => {
      logger.flow('game/move', 'master free move', { from: playerLayer, to: layer });
      const outcome = await makeMove('dreamMasterMove', [layer]);
      if (outcome.ok) setMoveOpenStamp(null);
    },
    [makeMove, playerLayer, setMoveOpenStamp],
  );

  const openPreview = useCallback((cardId: string) => setPreviewCard(cardId), []);
  const closePreview = useCallback(() => setPreviewCard(null), []);

  const canConfirmDiscard = effectiveSelected.length === overHand;

  const chat = useMatchChat(source.chat, mySeat !== null && mySeat === dreamMasterID);
  const sourceReport = source.report;
  const sourceSeats = source.seats;
  const report = useMemo(() => {
    if (sourceReport === null) return null;
    const targets = reportTargets(sourceSeats, mySeat);
    return targets.length === 0 ? null : { targets, submit: sourceReport.submit };
  }, [sourceReport, sourceSeats, mySeat]);

  return {
    ready: gameState !== null,
    error,
    kind: sourceKind,
    isRemote,
    winner,
    winReason,
    preload: assets.background,
    entryAssets: assets.entry,
    assetsReady: assets.entryDone,

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
    playRole,
    bribeHolderIds: bribeHolderIds(G?.bribePool),
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
      targetLayerChoices: effectivePending
        ? playLayerChoices(effectivePending.card, G?.layers)
        : null,
      cancelTargetPlayer: () => {
        cancelPlay();
        setDecreePick(null);
        setPreventMovePick(false);
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
      preventMove: {
        applicable: preventMoveApplicable,
        value: preventMoveApplicable && preventMovePick,
        toggle: togglePreventMove,
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
    entries,
    revive: {
      open: reviveOpen,
      mode: activeReviveDraft?.mode ?? 'self',
      targets: reviveTargets,
      target: reviveTarget,
      hand: humanHand,
      picked: revivePicked,
      required: requirement.count,
      onlyTransit: requirement.onlyTransit,
      eligible: humanHand.map((c) => reviveCardEligible(c, passage)),
      canConfirm: reviveCanConfirm,
      pickTarget: (id: string) => setReviveDraft((prev) => (prev ? { ...prev, target: id } : prev)),
      toggleCard: toggleRevivePick,
      confirm: confirmRevive,
      cancel: () => setReviveDraft(null),
    },
    tour: {
      open: tourOpen,
      hand: humanHand,
      recipients: tourRecipients,
      active: tourState.active,
      assigned: tourState.assigned,
      progress: tourProgress(tourState.assigned),
      canConfirm: tourCanConfirm,
      pickRecipient: (id: string) =>
        setTourDraft((prev) =>
          prev ? { ...prev, state: pickTourRecipient(prev.state, id) } : prev,
        ),
      tapCard: (index: number) =>
        setTourDraft((prev) =>
          prev
            ? {
                ...prev,
                state: tapTourCard(
                  validTourState(
                    prev.state,
                    humanHand.length,
                    tourRecipients.map((r) => r.id),
                  ),
                  index,
                  humanHand.length,
                ),
              }
            : prev,
        ),
      confirm: confirmTour,
      cancel: () => setTourDraft(null),
    },
    masterMove: {
      open: masterMoveOpen,
      layers: adjacentLayers(playerLayer),
      pick: pickMasterMoveLayer,
      cancel: () => setMoveOpenStamp(null),
    },
    response,
    shootDice: { roll: shootDiceRoll, onComplete: handleDiceComplete },

    chat,
    report,
    skillPanel,
    preview: { cardId: previewCard, open: openPreview, close: closePreview },
  };
}
