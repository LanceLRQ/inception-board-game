// 固定场景的构造：真实建局 + 一组确定的局面调整 + 引擎自己的视角过滤。
//
// 流程：
//   1. 用固定种子经运行器建局并完成开局布置（角色、金库、梦魇、贿赂池、牌库都是引擎发出的）；
//   2. 在完整状态上调整局面：谁回合、手牌（从真实牌库里取出，不凭空造牌）、所处层、翻开情况；
//   3. 带待应答窗口的场景，由回合主人真的打出【解封】，窗口由引擎打开；
//   4. 交给运行器的 viewMatch（引擎的视图钩子）得到本人座位看到的视图。
// 界面拿到的只有第 4 步的结果：他人手牌、牌库顺序、未开金库内容都已被引擎过滤掉。

import {
  InceptionCityGame,
  applyMove,
  createMatch,
  sendToLimbo,
  viewMatch,
  type GameDef,
  type MatchState,
  type MatchViewState,
  type SeatInfo,
} from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine/setup';
import { NIGHTMARE_CARDS, type CardID, type Layer } from '@icgame/shared';
import { FIXTURE_DEFAULT_PLAYERS, type FixtureScenarioId } from './scenarios';

const game: GameDef<SetupState> = InceptionCityGame;

const FIXTURE_SEED = 'fixture-scene';
const FIXTURE_TURN_NUMBER = 5;

/** 解封响应窗口场景里，回合主人打出的牌 */
const UNLOCK_CARD = 'action_unlock' as CardID;

/** 非本人的盗梦者按顺序占用的层与是否已翻开（第 0 名盗梦者可能是本人，同样按此表落位） */
const THIEF_LAYOUT: ReadonlyArray<{ layer: Layer; revealed: boolean }> = [
  { layer: 2, revealed: false },
  { layer: 2, revealed: true },
  { layer: 1, revealed: false },
  { layer: 3, revealed: true },
  { layer: 1, revealed: false },
];
const MASTER_LAYER: Layer = 3;
/**
 * 固定场景里的梦主角色：没有回合内主动技能面板的梦主，
 * 免得开局随机到的梦主（例如棋局）在轮到本人时自动弹出技能选择，盖住整个界面。
 */
const PLAIN_MASTER = 'dm_neptune_ocean' as CardID;
/** 棋局场景里的梦主：行动阶段会自动弹出易位弹窗 */
const CHESS_MASTER = 'dm_chess' as CardID;

const cards = (...ids: string[]): CardID[] => ids as CardID[];

export interface FixtureScenario {
  readonly id: FixtureScenarioId;
  /** 人数 */
  readonly players: number;
  /** 本人座位 */
  readonly seat: string;
  /** 本人座位看到的视图（引擎过滤后的结果） */
  readonly view: MatchViewState;
  /** 座位表：除本人外都显示为 Bot，都在线 */
  readonly seats: SeatInfo[];
}

/** 完成开局布置后的对局状态 */
function startedMatch(players: number): MatchState<SetupState> {
  const created = createMatch(game, {
    numPlayers: players,
    setupData: { rngSeed: FIXTURE_SEED },
    seed: FIXTURE_SEED,
  });
  const res = applyMove(game, created, {
    playerID: created.ctx.currentPlayer,
    move: 'completeSetup',
    args: [],
  });
  if (!res.ok) throw new Error(`固定场景建局失败：completeSetup 被拒绝（${res.reason}）`);
  return res.state;
}

/** 从牌库里取出指定的牌放进某人手牌；牌库里没有就说明场景写错了 */
function dealSpecific(G: SetupState, seat: string, wanted: CardID[]): SetupState {
  const deck = [...G.deck.cards];
  for (const card of wanted) {
    const at = deck.indexOf(card);
    if (at < 0) throw new Error(`固定场景发牌失败：牌库里没有 ${card}`);
    deck.splice(at, 1);
  }
  const player = G.players[seat]!;
  return {
    ...G,
    deck: { ...G.deck, cards: deck },
    players: { ...G.players, [seat]: { ...player, hand: [...player.hand, ...wanted] } },
  };
}

/** 从牌库顶摸若干张给某人 */
function dealTop(G: SetupState, seat: string, count: number): SetupState {
  return dealSpecific(G, seat, G.deck.cards.slice(0, count));
}

/** 牌库顶若干张进弃牌堆 */
function discardTop(G: SetupState, count: number): SetupState {
  return {
    ...G,
    deck: {
      cards: G.deck.cards.slice(count),
      discardPile: [...G.deck.discardPile, ...G.deck.cards.slice(0, count)],
    },
  };
}

/** 摆好各人所处的层，并重建各层的人员名单 */
function placePlayers(
  G: SetupState,
  placement: Record<string, { layer: Layer; revealed: boolean }>,
): SetupState {
  const players = { ...G.players };
  for (const [seat, spot] of Object.entries(placement)) {
    players[seat] = {
      ...players[seat]!,
      currentLayer: spot.layer,
      isRevealed: players[seat]!.isRevealed || spot.revealed,
    };
  }
  const layers: SetupState['layers'] = {};
  for (const [key, layer] of Object.entries(G.layers)) {
    layers[Number(key)] = {
      ...layer,
      playersInLayer: G.playerOrder.filter((id) => players[id]!.currentLayer === layer.layer),
    };
  }
  return { ...G, players, layers };
}

/** 回合交给某人：行动阶段、固定回合数 */
function giveTurn(
  state: MatchState<SetupState>,
  G: SetupState,
  seat: string,
): MatchState<SetupState> {
  const turnShift = FIXTURE_TURN_NUMBER - G.turnNumber;
  return {
    ...state,
    G: {
      ...G,
      turnPhase: 'action',
      turnNumber: FIXTURE_TURN_NUMBER,
      currentPlayerID: seat,
      unlockThisTurn: 0,
    },
    ctx: {
      ...state.ctx,
      currentPlayer: seat,
      playOrderPos: state.ctx.playOrder.indexOf(seat),
      turn: state.ctx.turn + turnShift,
    },
  };
}

/** 角色走查场景：本人的视角与角色、梦主的角色、回合阶段，以及在这之上对局面的调整 */
interface SkillScene {
  readonly viewer: 'thief' | 'master';
  /** 本人的角色 */
  readonly character: string;
  /** 盗梦者视角下梦主的角色；缺省是没有主动技能的梦主 */
  readonly masterCharacter?: string;
  /** 回合阶段；缺省是出牌阶段 */
  readonly phase?: 'draw' | 'discard';
  /** 回合主人：缺省是本人；other = 第二名盗梦者（走查别人回合里本人也能发动的技能） */
  readonly turnOwner?: 'viewer' | 'other';
  readonly adjust?: (G: SetupState, who: { viewer: string; master: string }) => SetupState;
}

/** 弃牌堆里的梦境穿梭剂放回牌库底，使弃牌堆里没有这种牌（牌总数不变） */
function withoutTransitInDiscard(G: SetupState): SetupState {
  const transit = 'action_dream_transit';
  const gone = G.deck.discardPile.filter((c) => c === transit);
  return {
    ...G,
    deck: {
      cards: [...G.deck.cards, ...gone],
      discardPile: G.deck.discardPile.filter((c) => c !== transit),
    },
  };
}

/** 把指定的牌从牌库挪进弃牌堆（从真实牌库里取，不凭空造牌）；牌库里没有就说明场景写错了 */
function discardSpecific(G: SetupState, wanted: CardID[]): SetupState {
  const deck = [...G.deck.cards];
  for (const card of wanted) {
    const at = deck.indexOf(card);
    if (at < 0) throw new Error(`固定场景弃牌失败：牌库里没有 ${card}`);
    deck.splice(at, 1);
  }
  return { ...G, deck: { cards: deck, discardPile: [...G.deck.discardPile, ...wanted] } };
}

/** 本回合已打出的牌：记进出牌记录（对应的牌已经在弃牌堆里，由 discardSpecific 保证） */
function withPlayedCards(G: SetupState, played: CardID[]): SetupState {
  return {
    ...G,
    playedCardsThisTurn: played,
    lastPlayedCardThisTurn: played[played.length - 1] ?? null,
  };
}

/** 本人在本回合的技能使用记录里加几个键 */
function withSkillUsed(G: SetupState, seat: string, used: Record<string, number>): SetupState {
  const p = G.players[seat]!;
  return {
    ...G,
    players: {
      ...G.players,
      [seat]: { ...p, skillUsedThisTurn: { ...p.skillUsedThisTurn, ...used } },
    },
  };
}

/** 最后一名盗梦者（不是本人）被击杀，进了迷失层：走查复活类技能的复活对象 */
function withDeadMate(G: SetupState, who: { viewer: string; master: string }): SetupState {
  const mate = G.playerOrder.filter((id) => id !== who.master && id !== who.viewer).pop()!;
  return killPlayer(G, mate);
}

const SKILL_SCENES: Partial<Record<FixtureScenarioId, SkillScene>> = {
  // 抽牌阶段：略过抽牌的入口
  'skill-draw': { viewer: 'thief', character: 'thief_aries', phase: 'draw' },
  'skill-joker': { viewer: 'thief', character: 'thief_joker', phase: 'draw' },
  // 双子翻到背面，本人在第 4 层、梦主在第 3 层：梦主所在层数字更小
  'skill-gemini-back': {
    viewer: 'thief',
    character: 'thief_gemini_back',
    adjust: (G, { viewer }) => placePlayers(G, { [viewer]: { layer: 4, revealed: false } }),
  },
  // 药剂师：手里有梦境穿梭剂、同层有同伴，但弃牌堆里没有梦境穿梭剂：「调剂」置灰并说明，「注射」可用
  'skill-chemist': {
    viewer: 'thief',
    character: 'thief_chemist',
    adjust: (G) => withoutTransitInDiscard(G),
  },
  'skill-space-queen': { viewer: 'thief', character: 'thief_space_queen', phase: 'discard' },
  // 轮到别人弃牌：空间女王在别人的弃牌阶段也能发动造物
  'skill-space-queen-other': {
    viewer: 'thief',
    character: 'thief_space_queen',
    phase: 'discard',
    turnOwner: 'other',
  },
  // 盖亚：同层有两名同伴，选一个方向让他们全部移动
  'skill-gaia': {
    viewer: 'thief',
    character: 'thief_gaia',
    adjust: (G, { viewer, master }) => {
      const mates = G.playerOrder.filter((id) => id !== viewer && id !== master).slice(0, 2);
      const here: Record<string, { layer: Layer; revealed: boolean }> = {
        [viewer]: { layer: 2, revealed: false },
      };
      for (const id of mates) here[id] = { layer: 2, revealed: false };
      return placePlayers(G, here);
    },
  },
  // 白羊：抽牌阶段，已有 2 张梦魇弃掉（闪耀最多多抽 2 张）
  'skill-aries-glow': {
    viewer: 'thief',
    character: 'thief_aries',
    phase: 'draw',
    adjust: (G) => {
      const onBoard = new Set(Object.values(G.layers).map((l) => l.nightmareId));
      const spare = NIGHTMARE_CARDS.map((card) => card.id as CardID).filter(
        (id) => !onBoard.has(id),
      );
      return { ...G, usedNightmareIds: spare.slice(0, 2) };
    },
  },
  'skill-black-hole': { viewer: 'thief', character: 'thief_black_hole' },
  // 黑洞在抽牌阶段：同层有手牌的玩家可以交牌，「吞噬」入口可用
  'skill-black-hole-draw': { viewer: 'thief', character: 'thief_black_hole', phase: 'draw' },
  'skill-terrorist': { viewer: 'thief', character: 'thief_terrorist' },
  'skill-sagittarius': { viewer: 'thief', character: 'thief_sagittarius' },
  // 皇城世界观：本人收过贿赂牌，有一次 SHOOT 机会
  'skill-imperial': {
    viewer: 'thief',
    character: 'thief_aries',
    masterCharacter: 'dm_imperial_city',
    adjust: (G, { viewer }) => {
      const given = giveBribe(G, viewer);
      return {
        ...given,
        players: {
          ...given.players,
          [viewer]: { ...given.players[viewer]!, imperialShootCharges: 1 },
        },
      };
    },
  },
  // 土星世界观：本人持有贿赂牌，可以免费移动到相邻层
  'skill-saturn': {
    viewer: 'thief',
    character: 'thief_aries',
    masterCharacter: 'dm_saturn_territory',
    adjust: (G, { viewer }) => giveBribe(G, viewer),
  },
  // 本人所在层的心锁已被解空
  'skill-unlock-none': {
    viewer: 'thief',
    character: 'thief_aries',
    adjust: (G, { viewer }) => {
      const layer = G.players[viewer]!.currentLayer;
      return {
        ...G,
        layers: { ...G.layers, [layer]: { ...G.layers[layer]!, heartLockValue: 0 } },
      };
    },
  },
  // 本回合已成功解封一次，解封次数用尽
  'skill-unlock-spent': {
    viewer: 'thief',
    character: 'thief_aries',
    adjust: (G, { viewer }) => ({
      ...G,
      players: { ...G.players, [viewer]: { ...G.players[viewer]!, successfulUnlocksThisTurn: 1 } },
    }),
  },
  // 黑天鹅：抽牌阶段，手里有牌，同桌有存活的盗梦者可以接收
  'skill-black-swan': { viewer: 'thief', character: 'thief_black_swan', phase: 'draw' },
  // 露娜翻到背面：手里有非 SHOOT 牌，一名盗梦者同伴在迷失层（满月的复活对象）
  'skill-luna': {
    viewer: 'thief',
    character: 'thief_luna_back',
    adjust: (G, who) => withDeadMate(G, who),
  },
  // 双鱼翻到背面：一名盗梦者同伴在迷失层（洗礼可以顺便复活）
  'skill-pisces': {
    viewer: 'thief',
    character: 'thief_pisces_back',
    adjust: (G, who) => withDeadMate(G, who),
  },
  // 达尔文：手里有 4 张牌，放回的 2 张从中选
  'skill-darwin': { viewer: 'thief', character: 'thief_darwin' },
  // 格林射线：手里有梦境穿梭剂和 SHOOT
  'skill-green-ray': { viewer: 'thief', character: 'thief_green_ray' },
  // 水瓶：本回合打出过两张 KICK，弃牌堆里还有别的牌
  'skill-aquarius': {
    viewer: 'thief',
    character: 'thief_aquarius',
    adjust: (G) =>
      withPlayedCards(
        discardSpecific(G, cards('action_kick', 'action_kick')),
        cards('action_kick', 'action_kick'),
      ),
  },
  // 射手：本回合击杀过玩家，可以发动穿心
  'skill-heart-lock': {
    viewer: 'thief',
    character: 'thief_sagittarius',
    adjust: (G, { viewer }) => withSkillUsed(G, viewer, { 'thief_sagittarius.kills': 1 }),
  },
  // 金星·镜界世界观：本回合打出过一张 KICK，可以弃 2 张牌复制它
  'skill-venus-mirror': {
    viewer: 'thief',
    character: 'thief_aries',
    masterCharacter: 'dm_venus_mirror',
    adjust: (G) => withPlayedCards(discardSpecific(G, cards('action_kick')), cards('action_kick')),
  },
  'skill-venus': { viewer: 'master', character: 'dm_venus_mirror' },
  // 密道：手里有梦境穿梭剂
  'skill-passage': {
    viewer: 'master',
    character: 'dm_secret_passage',
    adjust: (G, { viewer }) => dealSpecific(G, viewer, cards('action_dream_transit')),
  },
  // 梦主：第 2 层的梦魇已翻开（致命漩涡），第 3 层的梦魇已翻开（回音萦绕，发动要选层与方式），
  // 第 1 层的梦魇已翻开（邪念瘟疫，发动要点名派发贿赂牌的盗梦者）
  'skill-nightmare': {
    viewer: 'master',
    character: PLAIN_MASTER,
    adjust: (G) => {
      let s = placeNightmare(G, 2, 'nightmare_vortex' as CardID);
      s = placeNightmare(s, 3, 'nightmare_echo' as CardID);
      s = placeNightmare(s, 1, 'nightmare_plague' as CardID);
      return {
        ...s,
        layers: {
          ...s.layers,
          1: { ...s.layers[1]!, nightmareRevealed: true },
          2: { ...s.layers[2]!, nightmareRevealed: true },
          3: { ...s.layers[3]!, nightmareRevealed: true },
        },
      };
    },
  },
};

/** 梦主是土星·领地、盗梦者打出 KICK 后等梦主应答律令的场景（手里有 / 没有同名牌） */
const isSaturnScenario = (id: FixtureScenarioId): boolean =>
  id === 'master-pending-saturn' ||
  id === 'master-pending-saturn-nomatch' ||
  id === 'thief-pending-saturn';
const SATURN_MASTER = 'dm_saturn_territory' as CardID;

const isMasterScenario = (id: FixtureScenarioId): boolean =>
  SKILL_SCENES[id]?.viewer === 'master' ||
  id === 'master' ||
  id === 'master-pending' ||
  id === 'master-pending-saturn' ||
  id === 'master-pending-saturn-nomatch' ||
  id === 'master-chess' ||
  id === 'master-mate-dead' ||
  id === 'master-bribe' ||
  id === 'master-vault-echo' ||
  id === 'master-vault-plague';
const isDiscardScenario = (id: FixtureScenarioId): boolean => id === 'thief-discard';
/** 弃牌场景里本人多摸的牌数：缺省 4 张手牌 + 3 = 7 张，超出手牌上限（5）2 张 */
const DISCARD_EXTRA_CARDS = 3;
const isPendingScenario = (id: FixtureScenarioId): boolean =>
  id === 'thief-pending' || id === 'master-pending';

/** 轮到本人应答的场景：本人的角色、回合主人是谁、待决状态怎么来 */
interface ResponseSpec {
  /** 本人的角色 */
  readonly viewerCharacter: string;
  /** 回合主人：对方（第二名盗梦者）还是本人 */
  readonly turnOwner: 'other' | 'viewer';
}

const RESPONSE_SPECS: Partial<Record<FixtureScenarioId, ResponseSpec>> = {
  // 本人是意念判官，行动阶段轮到自己、手里有 SHOOT：走查【定罪】的发动入口
  'thief-sudger': { viewerCharacter: 'thief_sudger_of_mind', turnOwner: 'viewer' },
  // 对方打出 SHOOT：本人是双鱼，可以【游离】
  'thief-pending-shoot': { viewerCharacter: 'thief_pisces', turnOwner: 'other' },
  // 对方是恐怖分子，打出 SHOOT：本人要选择是否弃牌
  'thief-pending-terrorist': { viewerCharacter: 'thief_dream_interpreter', turnOwner: 'other' },
  // 对方是天秤，把全部手牌交给本人，本人分牌
  'thief-pending-libra-split': { viewerCharacter: 'thief_dream_interpreter', turnOwner: 'other' },
  // 本人是天秤，对方已把牌分成两份，本人挑一份
  'thief-pending-libra-pick': { viewerCharacter: 'thief_libra', turnOwner: 'viewer' },
  // 本人是意念判官，打出 SHOOT 后在两个骰值里选一个
  'thief-pending-sudger': { viewerCharacter: 'thief_sudger_of_mind', turnOwner: 'viewer' },
  // 有人掷出 6：本人是处女；有一名盗梦者已死亡可以复活
  'thief-pending-virgo': { viewerCharacter: 'thief_virgo', turnOwner: 'other' },
  // 一名盗梦者被击杀：本人是白羊，该层的梦魇是回音萦绕
  'thief-pending-aries': { viewerCharacter: 'thief_aries', turnOwner: 'other' },
  // 同上，该层的梦魇是邪念瘟疫（发动要点名派发贿赂牌的盗梦者）
  'thief-pending-aries-plague': { viewerCharacter: 'thief_aries', turnOwner: 'other' },
  // 对方是黑洞，抽牌阶段放弃抽牌：本人与另一名同层玩家各交 1 张手牌
  'thief-pending-levy': { viewerCharacter: 'thief_dream_interpreter', turnOwner: 'other' },
  // 本人是达尔文，出牌阶段发动【淘汰】：已抽到牌库顶 2 张，等本人选 2 张放回
  'thief-pending-darwin': { viewerCharacter: 'thief_darwin', turnOwner: 'viewer' },
  // 本人是雅典娜，同层的对方对本人打出 KICK：结算前可从弃牌堆选 1 张
  'thief-pending-athena': { viewerCharacter: 'thief_athena', turnOwner: 'other' },
};

/** 白羊场景里被击杀者原来所在的层 */
const ARIES_VICTIM_LAYER: Layer = 2;
/** 金库三选一场景里被打开的金库所在的层 */
const VAULT_LAYER: Layer = 2;

/** 把角色给某人；原来拿着这个角色的人换到他原来的角色，保证全桌没有重复角色 */
function assignCharacter(G: SetupState, seat: string, characterId: string): SetupState {
  const holder = G.playerOrder.find((id) => G.players[id]!.characterId === characterId);
  const players = { ...G.players };
  if (holder !== undefined && holder !== seat) {
    players[holder] = { ...players[holder]!, characterId: players[seat]!.characterId };
  }
  players[seat] = { ...players[seat]!, characterId: characterId as CardID };
  return { ...G, players };
}

/** 某人已被击杀：移到迷失层，手牌进弃牌堆 */
function killPlayer(G: SetupState, seat: string): SetupState {
  const victim = G.players[seat]!;
  const placed = placePlayers(
    {
      ...G,
      deck: { ...G.deck, discardPile: [...G.deck.discardPile, ...victim.hand] },
      players: {
        ...G.players,
        [seat]: { ...victim, isAlive: false, deathTurn: FIXTURE_TURN_NUMBER - 1, hand: [] },
      },
    },
    { [seat]: { layer: 0 as Layer, revealed: false } },
  );
  return placed;
}

/** 把一张「失败」的贿赂牌交给某人：公开的只有谁持有；成败仍只有持有者与梦主能看 */
function giveBribe(G: SetupState, seat: string): SetupState {
  const at = G.bribePool.findIndex((b) => b.status === 'inPool' && b.kind === 'fail');
  if (at < 0) throw new Error('固定场景发贿赂牌失败：贿赂池里没有可派的牌');
  const holder = G.players[seat]!;
  return {
    ...G,
    bribePool: G.bribePool.map((b, i) =>
      i === at ? { ...b, status: 'dealt', heldBy: seat, originalOwnerId: seat } : b,
    ),
    players: { ...G.players, [seat]: { ...holder, bribeReceived: holder.bribeReceived + 1 } },
  };
}

/** 让某个梦魇落在某一层：原来拿着它的层换到这一层原来的梦魇，保证全局没有重复 */
function placeNightmare(G: SetupState, layer: Layer, nightmareId: CardID): SetupState {
  const target = G.layers[layer]!;
  const holder = Object.values(G.layers).find((l) => l.nightmareId === nightmareId);
  const layers = { ...G.layers };
  if (holder !== undefined && holder.layer !== layer) {
    layers[holder.layer] = { ...holder, nightmareId: target.nightmareId };
  }
  layers[layer] = { ...target, nightmareId, nightmareRevealed: false };
  return { ...G, layers };
}

/** 经运行器执行一个 move；被拒就是场景写错了 */
function mustApply(
  state: MatchState<SetupState>,
  playerID: string,
  move: string,
  args: unknown[],
): MatchState<SetupState> {
  const res = applyMove(game, state, { playerID, move, args });
  if (!res.ok) throw new Error(`固定场景执行失败：${move} 被拒绝（${res.reason}）`);
  return res.state;
}

/**
 * 场景的完整对局状态（只在服务端与测试里应当出现的那种）和本人座位。
 * 界面不会拿到它，只会拿到 buildFixtureScenario 过滤后的视图。
 */
export function buildFixtureMatch(
  id: FixtureScenarioId,
  players: number = FIXTURE_DEFAULT_PLAYERS,
): {
  state: MatchState<SetupState>;
  viewer: string;
} {
  const base = startedMatch(players);
  const master = base.G.dreamMasterID;
  const thieves = base.G.playerOrder.filter((seat) => seat !== master);
  const viewer = isMasterScenario(id) ? master : thieves[0]!;
  const response = RESPONSE_SPECS[id];
  const skillScene = SKILL_SCENES[id];
  // 待应答场景里由第二名盗梦者当回合主人；其余场景轮到本人
  const actor =
    isPendingScenario(id) ||
    isSaturnScenario(id) ||
    response?.turnOwner === 'other' ||
    skillScene?.turnOwner === 'other'
      ? thieves[1]!
      : viewer;

  // 发牌：先给指定的牌，再给其余人摸牌；他们的牌张数各不相同
  let G = base.G;
  G = dealSpecific(
    G,
    viewer,
    id === 'master-pending-saturn-nomatch'
      ? // 没有与出牌者的 KICK 同名的牌：律令窗口照样出现，但只能不抵消
        cards('action_dream_peek', UNLOCK_CARD, 'action_dream_transit')
      : isMasterScenario(id)
        ? cards('action_kick', 'action_dream_peek', UNLOCK_CARD)
        : cards('action_shoot', UNLOCK_CARD, 'action_dream_transit', 'action_kick'),
  );
  if (isDiscardScenario(id)) G = dealTop(G, viewer, DISCARD_EXTRA_CARDS);
  if (actor !== viewer) G = dealSpecific(G, actor, cards(UNLOCK_CARD, 'action_kick'));
  // 对方要打出 SHOOT 的场景：给回合主人一张 SHOOT
  if (id === 'thief-pending-shoot' || id === 'thief-pending-terrorist') {
    G = dealSpecific(G, actor, cards('action_shoot'));
  }
  const others = G.playerOrder.filter((seat) => seat !== viewer && seat !== actor);
  others.forEach((seat, i) => {
    G = dealTop(G, seat, 2 + (i % 3));
  });
  G = discardTop(G, 2);

  // 落位：梦主在第 3 层，盗梦者分散在 1–3 层，有人已翻开
  const placement: Record<string, { layer: Layer; revealed: boolean }> = {
    [master]: { layer: MASTER_LAYER, revealed: true },
  };
  thieves.forEach((seat, i) => {
    placement[seat] = THIEF_LAYOUT[i % THIEF_LAYOUT.length]!;
  });
  G = placePlayers(G, placement);
  G = {
    ...G,
    players: {
      ...G.players,
      [master]: {
        ...G.players[master]!,
        characterId: (skillScene?.viewer === 'master'
          ? skillScene.character
          : (skillScene?.masterCharacter ??
            (id === 'master-chess'
              ? CHESS_MASTER
              : isSaturnScenario(id)
                ? SATURN_MASTER
                : PLAIN_MASTER))) as CardID,
      },
    },
  };
  if (response) G = assignCharacter(G, viewer, response.viewerCharacter);
  if (skillScene) {
    if (skillScene.viewer === 'thief') G = assignCharacter(G, viewer, skillScene.character);
    if (skillScene.adjust) G = skillScene.adjust(G, { viewer, master });
  }
  // 复活走查：本人在迷失层（手牌保留），或一名盗梦者同伴在迷失层
  if (id === 'thief-dead') G = sendToLimbo(G, viewer);
  if (id === 'thief-mate-dead' || id === 'master-mate-dead') {
    G = sendToLimbo(G, thieves[thieves.length - 1]!);
  }
  // 梦境窥视效果②走查：一名盗梦者持有贿赂牌
  if (id === 'master-bribe') G = giveBribe(G, thieves[1]!);
  if (id === 'thief-pending-terrorist') G = assignCharacter(G, actor, 'thief_terrorist');
  if (id === 'thief-pending-libra-split') G = assignCharacter(G, actor, 'thief_libra');
  if (id === 'thief-pending-levy') {
    G = assignCharacter(G, actor, 'thief_black_hole');
    // 再有一名玩家与黑洞同层，名单里有两个人
    G = placePlayers(G, { [thieves[2]!]: { layer: 2 as Layer, revealed: false } });
  }
  if (id === 'thief-pending-athena') {
    // 弃牌堆里多放几张不同的牌，选牌弹窗里才有东西可挑
    G = discardSpecific(
      G,
      cards('action_shoot', 'action_kick', 'action_dream_peek', 'action_kick'),
    );
  }

  let state = giveTurn(base, G, actor);
  if (isDiscardScenario(id)) state = { ...state, G: { ...state.G, turnPhase: 'discard' } };
  if (skillScene?.phase) state = { ...state, G: { ...state.G, turnPhase: skillScene.phase } };
  // 黑洞·吞噬发生在抽牌阶段
  if (id === 'thief-pending-levy') state = { ...state, G: { ...state.G, turnPhase: 'draw' } };

  if (isPendingScenario(id)) {
    const played = applyMove(game, state, {
      playerID: actor,
      move: 'playUnlock',
      args: [UNLOCK_CARD],
    });
    if (!played.ok) throw new Error(`固定场景出牌失败：playUnlock 被拒绝（${played.reason}）`);
    state = played.state;
  }

  const other = thieves[1]!;
  const lastThief = thieves[thieves.length - 1]!;
  switch (id) {
    case 'thief-pending-shoot':
    case 'thief-pending-terrorist':
      state = mustApply(state, actor, 'playShoot', [viewer, 'action_shoot']);
      break;
    case 'thief-pending-libra-split':
      state = mustApply(state, actor, 'playLibraBalance', [viewer]);
      break;
    case 'thief-pending-libra-pick': {
      state = mustApply(state, viewer, 'playLibraBalance', [other]);
      // 对方把拿到的牌分成两份（前一半、后一半）
      const hand = state.G.players[other]!.hand;
      const half = Math.ceil(hand.length / 2);
      state = mustApply(state, other, 'resolveLibraSplit', [hand.slice(0, half), hand.slice(half)]);
      break;
    }
    case 'thief-pending-levy':
      // 对方（黑洞）真的发动，引擎挂起同层有手牌的人的交牌
      state = mustApply(state, actor, 'playBlackHoleLevy', []);
      break;
    case 'thief-pending-darwin':
      // 本人（达尔文）真的发动：引擎先抽 2 张，再等本人选牌
      state = mustApply(state, viewer, 'playDarwinEvolution', []);
      break;
    case 'thief-pending-athena':
      // 对方真的对本人打出 KICK：引擎在结算前挂起雅典娜的应答
      state = mustApply(state, actor, 'playKick', ['action_kick', viewer]);
      break;
    case 'master-pending-saturn':
    case 'master-pending-saturn-nomatch':
    case 'thief-pending-saturn':
      // 盗梦者真的打出 KICK：引擎在结算前挂起梦主的律令应答
      state = mustApply(state, actor, 'playKick', ['action_kick', thieves[0]!]);
      break;
    case 'thief-pending-sudger': {
      state = mustApply(state, viewer, 'playShootSudger', [other, 'action_shoot']);
      // 两颗骰子由引擎掷出；固定场景把点数定为一个击杀、一个移动，两种结果都能走查
      const rolls = state.G.pendingSudgerRolls!;
      state = {
        ...state,
        G: { ...state.G, pendingSudgerRolls: { ...rolls, rollA: 1, rollB: 4 } },
      };
      break;
    }
    case 'thief-pending-virgo': {
      // 引擎里这一步由 SHOOT 掷出 6 触发；这里直接摆出结果：最近一次掷骰是 6，处女的选择待决。
      // 一名盗梦者和梦主都已死亡：复活的对象不限阵营，两个人都在名单里
      let G2 = killPlayer(killPlayer(state.G, lastThief), state.G.dreamMasterID);
      G2 = {
        ...G2,
        lastShootRoll: 6,
        pendingVirgoChoice: { virgoID: viewer, triggerRoll: 6, shooterID: actor },
      };
      state = { ...state, G: G2 };
      break;
    }
    case 'thief-pending-aries':
    case 'thief-pending-aries-plague': {
      // 引擎里这一步由 SHOOT 击杀盗梦者触发；这里直接摆出结果：被击杀者在迷失层，白羊的选择待决
      let G2 = killPlayer(state.G, lastThief);
      G2 = placeNightmare(
        G2,
        ARIES_VICTIM_LAYER,
        (id === 'thief-pending-aries' ? 'nightmare_echo' : 'nightmare_plague') as CardID,
      );
      G2 = {
        ...G2,
        pendingAriesChoice: {
          ariesID: viewer,
          victimLayer: ARIES_VICTIM_LAYER,
          victimID: lastThief,
        },
      };
      state = { ...state, G: G2 };
      break;
    }
    case 'master-vault-echo':
    case 'master-vault-plague': {
      // 引擎里这一步由盗梦者打开金币金库触发；这里直接摆出结果：第一名盗梦者在 VAULT_LAYER 层开箱，梦主待三选一
      let G2 = placeNightmare(
        state.G,
        VAULT_LAYER,
        (id === 'master-vault-echo' ? 'nightmare_echo' : 'nightmare_plague') as CardID,
      );
      G2 = { ...G2, pendingVaultDecision: { layer: VAULT_LAYER, openerID: thieves[0]! } };
      state = { ...state, G: G2 };
      break;
    }
    default:
      break;
  }
  return { state, viewer };
}

/** 视图里取玩家昵称；取不到就退回座位号 */
function nicknameIn(view: MatchViewState, seat: string): string {
  const players = (view.G as { players?: Record<string, { nickname?: unknown }> }).players;
  const nick = players?.[seat]?.nickname;
  return typeof nick === 'string' && nick ? nick : seat;
}

export function buildFixtureScenario(
  id: FixtureScenarioId,
  players: number = FIXTURE_DEFAULT_PLAYERS,
): FixtureScenario {
  const { state, viewer } = buildFixtureMatch(id, players);
  const view = viewMatch(game, state, viewer);
  const seats: SeatInfo[] = view.ctx.playOrder.map((seat) => ({
    seat,
    nickname: nicknameIn(view, seat),
    isBot: seat !== viewer,
    connected: true,
    takenOver: false,
  }));
  return { id, players, seat: viewer, view, seats };
}
