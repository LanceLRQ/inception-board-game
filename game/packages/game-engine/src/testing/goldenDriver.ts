// 黄金轨迹的驱动器：用固定种子经对局运行器跑完整局，逐步记录并滚动哈希。
// 仅供测试使用，不从包入口导出。
//
// 为什么不直接用 runner/moveFuzzer：那个生成器还在被别的测试调整，
// 它一变，基线里的每条轨迹都会跟着变，守护就失去意义。所以这里把选 move 的策略整套冻结：
//   - 伪随机序列、按形参名猜参数的规则、move 与座位的枚举顺序都写在本文件里；
//   - move 的形参名不再读函数源码，而是用下面的冻结表（引擎重构时改参数名不会让轨迹漂移）；
//   - 策略只读「引擎对外表现出来的行为」：行动权判定、move 是否被接受、对局状态。
// 因此同一份引擎行为下，轨迹逐字节相同；引擎行为变了，轨迹就会分叉。

import { createHash } from 'node:crypto';
import { InceptionCityGame } from '../game.js';
import type { SetupState } from '../setup.js';
import {
  applyMove,
  createMatch,
  type GameDef,
  type MatchState,
  type MoveRequest,
  type RandomSource,
} from '../runner/matchRunner.js';

const game: GameDef<SetupState> = InceptionCityGame;

// ---------------------------------------------------------------------------
// 冻结的 move 形参名表（建基线时从引擎读出）
// ---------------------------------------------------------------------------

const MOVE_PARAMS: Readonly<Record<string, readonly string[]>> = {
  pickCharacter: [],
  completeSetup: [],
  doDraw: [],
  skipDraw: [],
  playJokerGamble: [],
  playBlackSwanTour: ['distribution'],
  playBlackHoleLevy: ['giverPicks'],
  useBlackHoleAbsorb: ['targetLayer'],
  useImperialCityWorldShoot: ['targetID'],
  playRevive: ['targetID', 'discardedCardIds'],
  useVenusMirrorWorld: ['targetID', 'discardedCardIds'],
  endActionPhase: [],
  playShoot: ['targetPlayerID', 'cardId', 'decreeId', 'preventMove'],
  playShootSudger: ['targetPlayerID', 'cardId', 'decreeId'],
  resolveSudgerPick: ['pick'],
  playNightmareUnlock: ['cardId', 'layer'],
  masterDiscardNightmare: ['layer'],
  masterActivateNightmare: ['layer', 'params'],
  playShift: ['cardId', 'targetPlayerID'],
  playShootDreamTransit: ['cardId', 'mode', 'targetOrLayer', 'decreeId'],
  playShootKing: ['targetPlayerID', 'cardId', 'decreeId'],
  playShootArmor: ['targetPlayerID', 'cardId', 'decreeId'],
  playShootBurst: ['targetPlayerID', 'cardId', 'decreeId'],
  resolveShootMove: ['layer'],
  playGreenRayArrest: ['shootCardId', 'targetPlayerID', 'targetLayer'],
  dreamMasterMove: ['targetLayer'],
  playUnlock: ['cardId'],
  resolveUnlock: [],
  playHaleyImpact: ['targetID'],
  respondCancelUnlock: [],
  passResponse: [],
  playDreamTransit: ['cardId', 'targetLayer'],
  playKick: ['cardId', 'targetPlayerID'],
  playTelekinesis: ['cardId', 'targetPlayerID'],
  playPeek: ['cardId', 'targetLayer'],
  masterPeekBribeDecision: ['deal', 'poolIndex'],
  masterVaultDecision: ['choice', 'params'],
  playPeekMaster: ['cardId', 'targetThiefID'],
  peekerAcknowledge: [],
  playSecretPassageTeleport: ['targetPlayerID', 'transitCardId'],
  useVenusDouble: ['revealedHandIds'],
  useUranusPower: ['targetPlayerID', 'targetLayer'],
  usePlutoBurning: ['discardCardId'],
  useFortressColdness: ['targetID'],
  useMarsKill: ['layer', 'params'],
  useSaturnFreeMove: ['targetLayer'],
  useSagittariusHeartLock: ['layer', 'delta'],
  useMarsBattlefield: ['discardCard1', 'discardCard2', 'targetShootCardId'],
  useChessTranspose: ['vaultIdx1', 'vaultIdx2'],
  playGraft: ['cardId'],
  resolveGraft: ['cardsToReturn'],
  playGravity: ['cardId', 'targetIds'],
  resolveGravityPick: ['cardId'],
  playResonance: ['cardId', 'targetPlayerID'],
  playTimeStorm: ['cardId'],
  playCreation: ['cardId'],
  playGeminiSync: [],
  playLunaEclipse: ['shootCardIds', 'targetID'],
  playGeminiChoice: [],
  playLunaFullMoon: ['discardCardIds', 'reviveIDs'],
  playPiscesBlessing: ['reviveID'],
  playAriesStardustActivate: ['params'],
  playAriesStardustDiscard: [],
  respondShootEvade: [],
  respondShootPass: [],
  respondTerroristDiscard: ['cardId'],
  useAthenaWit: [],
  respondTerroristAccept: [],
  respondVirgoPerfect: ['choice', 'params'],
  playGaiaShift: ['picks'],
  playDarwinEvolution: ['returnCards'],
  playShadeFollow: [],
  playForgerExchangeSingle: ['targetID', 'returnedCardId'],
  playLibraBalance: ['targetID'],
  resolveLibraSplit: ['pile1', 'pile2'],
  resolveLibraPick: ['pick'],
  playArchitectMaze: ['discardCardId', 'targetID'],
  playApolloWorship: ['targetID'],
  playMartyrSacrifice: ['direction'],
  playAthenaAwe: ['shownHandIds', 'targetID'],
  playChemistRefine: ['discardCardId'],
  playAquariusCoherence: ['pickCardId'],
  playChemistInject: ['targetID', 'toLayer'],
  playLordOfWarBlackMarket: ['discardIds', 'pickFromDiscard'],
  playPaprikSalvation: ['discardCardId', 'targetID'],
  playTouristAssist: ['targetPlayerID'],
  doDiscard: ['cardIds'],
  skipDiscard: [],
  useSpaceQueenStashTop: ['cardId'],
};

// ---------------------------------------------------------------------------
// 确定性工具：策略用的伪随机序列、规范化序列化与哈希
// ---------------------------------------------------------------------------

/** 32 位字符串摊散（FNV-1a），把种子字符串变成伪随机序列的起点 */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32：策略的伪随机序列，与对局自己的随机流完全无关 */
function makeSeq(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 试跑用的随机源：独立于对局的随机流，不读也不写 state.rngState */
function makeProbeRandom(next: () => number): RandomSource {
  const Die = (sides: number): number => Math.floor(next() * sides) + 1;
  return {
    Die,
    D6: () => Die(6),
    Shuffle: <T>(arr: T[]): T[] => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  };
}

/**
 * 规范化序列化：对象键排序、丢弃 undefined 属性，与键的插入顺序无关。
 * 只接受 JSON 能表达的值；碰到 Map / Set / 函数等直接抛错，免得哈希悄悄漏掉内容。
 */
export function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'number':
      return Number.isFinite(value) ? String(value) : `"#${String(value)}"`;
    case 'boolean':
      return value ? 'true' : 'false';
    case 'undefined':
      return 'null';
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
      const proto = Object.getPrototypeOf(value) as unknown;
      if (proto !== Object.prototype && proto !== null) {
        throw new Error('黄金轨迹：状态里出现了非普通对象，无法规范化');
      }
      const obj = value as Record<string, unknown>;
      const parts: string[] = [];
      for (const key of Object.keys(obj).sort()) {
        if (obj[key] === undefined) continue;
        parts.push(`${JSON.stringify(key)}:${canonicalize(obj[key])}`);
      }
      return `{${parts.join(',')}}`;
    }
    default:
      throw new Error(`黄金轨迹：状态里出现了不可序列化的值（${typeof value}）`);
  }
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** 完整状态（对局状态、回合信息、随机流状态、版本号）的哈希 */
export function hashMatchState(state: MatchState<SetupState>): string {
  return sha256(
    canonicalize({
      G: state.G,
      ctx: state.ctx,
      rngState: state.rngState,
      stateID: state.stateID,
    }),
  );
}

// ---------------------------------------------------------------------------
// 参数生成：按形参名猜参数值（规则冻结，勿随意改动）
// ---------------------------------------------------------------------------

type Seq = () => number;

function pick<T>(rnd: Seq, arr: readonly T[]): T | undefined {
  return arr.length === 0 ? undefined : arr[Math.floor(rnd() * arr.length)];
}

function subset<T>(rnd: Seq, arr: readonly T[], max: number): T[] {
  const n = Math.min(arr.length, Math.floor(rnd() * (max + 1)));
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!);
  return out;
}

function sample<T>(rnd: Seq, arr: readonly T[], count: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!);
  }
  return out;
}

/** 收集所有「待结算」字段里出现过的字符串，结算类 move 的参数多半取自这里 */
function pendingStrings(G: SetupState): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  for (const key of Object.keys(G).sort()) {
    const value = (G as unknown as Record<string, unknown>)[key];
    if (key.startsWith('pending') && value) walk(value);
  }
  return out;
}

function guessArg(name: string, G: SetupState, actor: string, rnd: Seq): unknown {
  const hand = G.players[actor]?.hand ?? [];
  const players = G.playerOrder;
  const pending = pendingStrings(G);
  const pendingPlayers = pending.filter((v) => players.includes(v));
  const n = name.toLowerCase();

  if (n === 'cardid' && G.pendingGravity && G.pendingGravity.pool.length > 0 && rnd() < 0.8) {
    return pick(rnd, G.pendingGravity.pool);
  }
  const libra = G.pendingLibra;
  if (libra && libra.split === null && /^pile[12]$/.test(n)) {
    const targetHand = G.players[libra.targetPlayerID]?.hand ?? [];
    const cut = Math.ceil(targetHand.length / 2);
    return n === 'pile1' ? targetHand.slice(0, cut) : targetHand.slice(cut);
  }
  if (n === 'cardstoreturn' && rnd() < 0.7) return sample(rnd, hand, 2);
  const forcedAt = G.players[actor]?.forcedDiscardArmedAtTurn;
  if (n === 'cardids' && typeof forcedAt === 'number' && forcedAt === G.turnNumber) {
    return [...hand];
  }
  if (/(cardids|handids|discardids|returncards|cardstoreturn|^pile\d$)/.test(n)) {
    return subset(rnd, hand, hand.length);
  }
  if (/(targetids|reviveids)/.test(n)) return subset(rnd, players, 2);
  if (n === 'targetorlayer') return rnd() < 0.5 ? pick(rnd, players) : Math.floor(rnd() * 5);
  if (/(card|decree|pickfromdiscard)/.test(n)) {
    if (n === 'decreeid') {
      // 死亡宣言展示式使用：多数时候不带，其次从手里的宣言牌里挑
      const r = rnd();
      if (r < 0.5) return undefined;
      const decrees = hand.filter((c) => c.startsWith('action_death_decree_'));
      if (r < 0.9 && decrees.length > 0) return pick(rnd, decrees);
    }
    const r = rnd();
    if (r < 0.6) return pick(rnd, hand);
    if (r < 0.85 && pending.length > 0) return pick(rnd, pending);
    return pick(rnd, G.deck.discardPile) ?? pick(rnd, hand);
  }
  if (/layer/.test(n) && !/playerid/.test(n)) return Math.floor(rnd() * 6);
  if (n === 'poolindex') return undefined;
  if (/(idx|index)/.test(n)) return Math.floor(rnd() * 6);
  if (/(playerid|targetid|reviveid|thiefid)/.test(n)) {
    if (n === 'reviveid' && rnd() < 0.3) return null;
    if (rnd() < 0.3 && pendingPlayers.length > 0) return pick(rnd, pendingPlayers);
    return pick(rnd, players);
  }
  if (n === 'delta') return rnd() < 0.5 ? -1 : 1;
  if (n === 'direction') return rnd() < 0.5 ? 'increase' : 'decrease';
  if (n === 'mode') return rnd() < 0.5 ? 'shoot' : 'transit';
  if (n === 'pick') return pick(rnd, ['A', 'B', 'pile1', 'pile2']);
  if (n === 'choice') {
    if (G.pendingVaultDecision) return pick(rnd, ['bribe', 'nightmare', 'discard']);
    return 'skip';
  }
  if (n === 'deal' || n === 'preventmove') return rnd() < 0.5;
  // 结构化参数：玩家 → 牌 / 牌堆 / 方向
  if (n === 'distribution') {
    const others = players.filter((id) => id !== actor);
    const pool = [...hand];
    const out: Record<string, string[]> = {};
    for (const id of subset(rnd, others, 2)) {
      const give = pool.splice(0, Math.floor(rnd() * 3));
      if (give.length > 0) out[id] = give;
    }
    return out;
  }
  if (n === 'giverpicks') {
    const out: Record<string, string> = {};
    for (const id of players) {
      const theirs = G.players[id]?.hand ?? [];
      if (id !== actor && theirs.length > 0 && rnd() < 0.6) out[id] = pick(rnd, theirs)!;
    }
    return out;
  }
  if (n === 'picks') {
    const out: Record<string, number> = {};
    for (const id of subset(rnd, players, players.length)) out[id] = rnd() < 0.5 ? -1 : 1;
    return out;
  }
  return undefined;
}

function candidateFor(
  state: MatchState<SetupState>,
  move: string,
  playerID: string,
  rnd: Seq,
): MoveRequest {
  const names = Object.hasOwn(MOVE_PARAMS, move) ? MOVE_PARAMS[move]! : [];
  const args = names.map((name) => guessArg(name, state.G, playerID, rnd));
  while (args.length > 0 && args[args.length - 1] === undefined) args.pop();
  return { playerID, move, args };
}

// ---------------------------------------------------------------------------
// 选 move 的策略
// ---------------------------------------------------------------------------

/** 推进回合用的 move：挑选时降低权重，让行动牌和技能有机会被打出 */
const PROGRESS_MOVES = new Set(['endActionPhase', 'skipDiscard', 'doDiscard', 'skipDraw']);
/** 出牌类 move 里表示「打出的那张牌」的形参名 */
const PLAYED_CARD_PARAMS: ReadonlySet<string> = new Set([
  'cardId',
  'shootCardId',
  'transitCardId',
  'decreeId',
]);
/** 结算 / 响应类 move 的参数更难猜中，多试几次；有可结算事项时优先结算 */
const SETTLE_MOVE = /^(resolve|respond|pass|peeker|masterPeek|masterVault)/;

function phaseMoveNames(phase: string | null): string[] {
  if (phase === null || !Object.hasOwn(game.phases, phase)) return [];
  return Object.keys(game.phases[phase]!.moves ?? {}).sort();
}

function rightsAllow(state: MatchState<SetupState>, playerID: string, move: string): boolean {
  try {
    return game.actionRights?.({ G: state.G, ctx: state.ctx, playerID, move }) !== false;
  } catch {
    return true;
  }
}

/** 试跑：每个「座位 × move」试若干次猜测参数，返回所有能被接受的候选；座位与 move 都按名字排序 */
function listAcceptable(state: MatchState<SetupState>, rnd: Seq): MoveRequest[] {
  const probe = makeProbeRandom(makeSeq(Math.floor(rnd() * 2 ** 31)));
  const names = phaseMoveNames(state.ctx.phase);
  const seats = [...state.ctx.playOrder].sort((a, b) => Number(a) - Number(b));
  const accepted: MoveRequest[] = [];
  for (const seat of seats) {
    for (const move of names) {
      if (!rightsAllow(state, seat, move)) continue;
      const attempts = SETTLE_MOVE.test(move) || move === 'doDiscard' ? 16 : 2;
      for (let i = 0; i < attempts; i++) {
        const cand = candidateFor(state, move, seat, rnd);
        if (applyMove(game, state, cand, { random: probe }).ok) {
          accepted.push(cand);
          break;
        }
      }
    }
  }
  return accepted;
}

function choose(accepted: MoveRequest[], rnd: Seq): MoveRequest | null {
  if (accepted.length === 0) return null;
  const settle = accepted.filter((c) => SETTLE_MOVE.test(c.move));
  if (settle.length > 0) return pick(rnd, settle)!;
  const actions = accepted.filter((c) => !PROGRESS_MOVES.has(c.move));
  const progress = accepted.filter((c) => PROGRESS_MOVES.has(c.move));
  if (actions.length > 0 && (progress.length === 0 || rnd() < 0.6)) return pick(rnd, actions)!;
  return pick(rnd, progress.length > 0 ? progress : accepted)!;
}

/** 噪声请求：随机座位、随机 move、随机参数，绝大多数会被拒绝；用来把「拒绝」也钉进轨迹 */
function noiseMove(state: MatchState<SetupState>, rnd: Seq): MoveRequest {
  const all = [...new Set(Object.keys(game.phases).flatMap((p) => phaseMoveNames(p)))].sort();
  const move = rnd() < 0.05 ? 'noSuchMove' : (pick(rnd, all) ?? 'noSuchMove');
  const playerID = rnd() < 0.5 ? state.ctx.currentPlayer : (pick(rnd, state.ctx.playOrder) ?? '0');
  return candidateFor(state, move, playerID, rnd);
}

// ---------------------------------------------------------------------------
// 整局驱动
// ---------------------------------------------------------------------------

export interface GoldenMatchConfig {
  numPlayers: number;
  seed: string;
  /** 步数上限（含被拒绝的尝试） */
  maxSteps: number;
  /** 每隔多少步记一个检查点 */
  checkpointEvery: number;
  /** 追加给建局的参数（rngSeed 由 seed 提供） */
  setupData?: Record<string, unknown>;
  /** 每步回调，仅用于排查分叉时导出逐步记录 */
  onStep?: (step: GoldenStepRecord) => void;
}

export interface GoldenStepRecord {
  index: number;
  seat: string;
  move: string;
  accepted: boolean;
  /** 被拒绝的原因；被接受时为 null */
  reason: string | null;
  /** 接受之后的状态哈希；被拒绝时为 null */
  stateHash: string | null;
  /** 到这一步为止的滚动哈希 */
  rolling: string;
}

export type GoldenEnd = 'gameover' | 'stalled' | 'step_limit';

/** 入库的部分 */
export interface GoldenRecord {
  numPlayers: number;
  seed: string;
  steps: number;
  accepted: number;
  end: GoldenEnd;
  /** 终局结果摘要：「阵营:原因」；没打完时为 "-" */
  outcome: string;
  /** 每隔 checkpointEvery 步的滚动哈希（取前 16 位十六进制） */
  checkpoints: string[];
  /** 最终滚动哈希（取前 32 位十六进制） */
  finalHash: string;
}

/** 只用于覆盖统计、不入库的部分 */
export interface GoldenCoverage {
  /** 开局分到的角色牌 id */
  characters: string[];
  /** 被成功打出的行动牌 id → 次数（出牌类 move 的牌参数，且该牌确实离开了手牌） */
  playedCards: Record<string, number>;
  /** 被接受的 move 名 → 次数 */
  acceptedMoves: Record<string, number>;
  /** 出现过的待应答 / 待结算状态字段 → 出现的步数 */
  pendingFields: Record<string, number>;
  /** 被拒绝的 move 名 → 次数 */
  rejectedMoves: Record<string, number>;
  /** 到过的最大回合号 */
  turns: number;
}

export interface GoldenResult {
  record: GoldenRecord;
  coverage: GoldenCoverage;
}

function outcomeOf(gameover: unknown): string {
  if (gameover === undefined) return '-';
  if (typeof gameover === 'object' && gameover !== null) {
    const o = gameover as { winner?: unknown; reason?: unknown };
    return `${String(o.winner ?? '?')}:${String(o.reason ?? '?')}`;
  }
  return String(gameover);
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

/** 按种子跑一整局（或跑到步数上限 / 无路可走），返回入库记录与覆盖统计 */
export function runGoldenMatch(config: GoldenMatchConfig): GoldenResult {
  const { numPlayers, seed, maxSteps, checkpointEvery, setupData = {}, onStep } = config;
  const rnd = makeSeq(hash32(`golden-policy|${numPlayers}|${seed}`));
  const sourceSeed = `golden-${numPlayers}-${seed}`;
  let state = createMatch(game, {
    numPlayers,
    setupData: { ...setupData, rngSeed: sourceSeed },
    seed: sourceSeed,
  });

  let rolling = sha256(`golden|${numPlayers}|${seed}|${hashMatchState(state)}`);
  const checkpoints: string[] = [];
  const coverage: GoldenCoverage = {
    characters: [],
    playedCards: {},
    acceptedMoves: {},
    pendingFields: {},
    rejectedMoves: {},
    turns: 0,
  };
  let accepted = 0;
  let steps = 0;
  let end: GoldenEnd = 'step_limit';
  let charactersSeen = false;

  const record = (
    req: MoveRequest | null,
    ok: boolean,
    reason: string | null,
    stateHash: string | null,
  ): void => {
    const seat = req?.playerID ?? '-';
    const move = req?.move ?? '-';
    rolling = sha256(
      `${rolling}|${seat}|${move}|${ok ? 1 : 0}|${reason ?? ''}|${canonicalize(req?.args ?? null)}|${stateHash ?? ''}`,
    );
    steps++;
    if (steps % checkpointEvery === 0) checkpoints.push(rolling.slice(0, 16));
    onStep?.({ index: steps, seat, move, accepted: ok, reason, stateHash, rolling });
  };

  const attempt = (req: MoveRequest): void => {
    const before = state;
    const res = applyMove(game, state, req);
    if (!res.ok) {
      bump(coverage.rejectedMoves, req.move);
      record(req, false, res.reason, null);
      return;
    }
    state = res.state;
    accepted++;
    bump(coverage.acceptedMoves, req.move);
    // 本步打出的行动牌：「出牌」类 move 里按形参名认出的牌参数，且这张牌确实离开了发起者的手牌
    if (req.move.startsWith('play')) {
      const names = Object.hasOwn(MOVE_PARAMS, req.move) ? MOVE_PARAMS[req.move]! : [];
      const handBefore = before.G.players[req.playerID]?.hand ?? [];
      const handAfter = state.G.players[req.playerID]?.hand ?? [];
      names.forEach((name, i) => {
        const arg = req.args[i];
        if (!PLAYED_CARD_PARAMS.has(name) || typeof arg !== 'string') return;
        const countOf = (hand: readonly string[]): number => hand.filter((c) => c === arg).length;
        // 死亡宣言是展示式使用，牌不离手；被接受就说明展示成立
        const shown = name === 'decreeId' && arg.startsWith('action_death_decree_');
        if (shown || countOf(handAfter) < countOf(handBefore)) bump(coverage.playedCards, arg);
      });
    }
    for (const key of Object.keys(state.G).sort()) {
      const waiting = key.startsWith('pending') || key === 'peekReveal';
      if (waiting && (state.G as unknown as Record<string, unknown>)[key]) {
        bump(coverage.pendingFields, key);
      }
    }
    if (!charactersSeen && state.G.phase === 'playing') {
      charactersSeen = true;
      coverage.characters = state.ctx.playOrder
        .map((id) => state.G.players[id]?.characterId)
        .filter((id): id is NonNullable<typeof id> => typeof id === 'string');
    }
    coverage.turns = Math.max(coverage.turns, state.ctx.turn);
    record(req, true, null, hashMatchState(state));
  };

  while (steps < maxSteps && state.ctx.gameover === undefined) {
    // 约十分之一的步数先发一个噪声请求：大概率被拒绝，偶尔被接受（接受了就照常推进）
    if (rnd() < 0.1) {
      attempt(noiseMove(state, rnd));
      if (state.ctx.gameover !== undefined || steps >= maxSteps) break;
    }
    const cand = choose(listAcceptable(state, rnd), rnd);
    if (!cand) {
      record(null, false, 'stalled', null);
      end = 'stalled';
      break;
    }
    attempt(cand);
  }
  if (state.ctx.gameover !== undefined) end = 'gameover';

  return {
    record: {
      numPlayers,
      seed,
      steps,
      accepted,
      end,
      outcome: outcomeOf(state.ctx.gameover),
      checkpoints,
      finalHash: rolling.slice(0, 32),
    },
    coverage,
  };
}
