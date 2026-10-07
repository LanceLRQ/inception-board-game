// 对局阶段 move 的参数形状表
//
// move 的参数来自客户端，TypeScript 的类型标注不构成任何保证。这里为每个对局阶段的 move
// 登记「第 N 个参数应当是什么」，由包装层（settleGate.ts）在进入 move 之前统一校验：
// 类型不对或取值越界的一律按非法 move 处理，状态原样不动。
//
// 只判断「类型与取值范围」：玩家 id 必须是对局里的玩家，牌 id 必须是字符串，层号必须是 0-4 的整数……
// 规则层面的合法性（这张牌能不能打、目标合不合法）仍由各 move 自己判断。
// 多出的参数不参与校验，move 本体也不会读它们，直接忽略。
// 没有在表里登记的 move 视同没有参数；表与 move 名单的对应关系由测试保证。

import type { SetupState } from '../setup.js';

/** 单个参数的校验：值、当前对局状态、整组参数（条件型参数要看前面的参数） */
type ArgCheck = (value: unknown, G: SetupState, args: readonly unknown[]) => boolean;

/** id 类字符串的长度上限，远大于任何真实的牌 id / 玩家 id */
const MAX_ID_LENGTH = 64;
/** 牌数组的长度上限，远大于任何真实的手牌 / 牌库规模 */
const MAX_CARD_LIST = 200;
const LAYER_MAX = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const player: ArgCheck = (v, G) => typeof v === 'string' && G.playerOrder.includes(v);

function isId(v: unknown): v is string {
  return typeof v === 'string' && v.length <= MAX_ID_LENGTH;
}

const card: ArgCheck = (v) => isId(v);

const layer: ArgCheck = (v) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= LAYER_MAX;

const bool: ArgCheck = (v) => typeof v === 'boolean';

const cardList: ArgCheck = (v) => Array.isArray(v) && v.length <= MAX_CARD_LIST && v.every(isId);

const playerList: ArgCheck = (v, G) =>
  Array.isArray(v) && v.length <= G.playerOrder.length && v.every((item) => player(item, G, []));

const oneOf =
  (...allowed: readonly (string | number)[]): ArgCheck =>
  (v) =>
    (typeof v === 'string' || typeof v === 'number') && allowed.includes(v);

/** 可省略的参数：没传或经 JSON 变成 null 都算省略 */
const optional =
  (check: ArgCheck): ArgCheck =>
  (v, G, args) =>
    v === undefined || v === null || check(v, G, args);

/** 可以是 null 的参数 */
const nullable =
  (check: ArgCheck): ArgCheck =>
  (v, G, args) =>
    v === null || check(v, G, args);

/** 下标：整数，且落在某个数组的长度之内 */
const indexOf =
  (length: (G: SetupState) => number): ArgCheck =>
  (v, G) =>
    typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < length(G);

/** 对象：每个值都满足 item，键必须是对局里的玩家 */
const recordByPlayer =
  (item: ArgCheck): ArgCheck =>
  (v, G, args) =>
    isRecord(v) &&
    Object.keys(v).length <= G.playerOrder.length &&
    Object.entries(v).every(([key, value]) => player(key, G, args) && item(value, G, args));

/** 梦魇效果的附加参数：只认已知的键，其余键不会被读取 */
const nightmareParams: ArgCheck = optional(
  (v, G, args) =>
    isRecord(v) &&
    optional(layer)(v.targetLayer, G, args) &&
    optional(oneOf('restore', 'add'))(v.action, G, args) &&
    optional(playerList)(v.bribedTargets, G, args),
);

/** 金库三选一的附加参数：梦魇效果的参数，外加皇城·重金指定贿赂牌用的 poolIndex */
const vaultDecisionParams: ArgCheck = optional(
  (v, G, args) =>
    isRecord(v) &&
    nightmareParams(v, G, args) &&
    optional(indexOf((state) => state.bribePool.length))(v.poolIndex, G, args),
);

const virgoParams: ArgCheck = optional(
  (v, G, args) =>
    isRecord(v) && optional(player)(v.targetID, G, args) && optional(layer)(v.layer, G, args),
);

const shootExtras = [optional(card), optional(bool)] as const;

/** move 名 → 各参数的校验，顺序与 move 的形参一致 */
export const MOVE_ARG_SPECS: Readonly<Record<string, readonly ArgCheck[]>> = {
  // 无参数
  doDraw: [],
  skipDraw: [],
  playJokerGamble: [],
  endActionPhase: [],
  resolveUnlock: [],
  respondCancelUnlock: [],
  passResponse: [],
  peekerAcknowledge: [],
  playGeminiSync: [],
  playGeminiChoice: [],
  playAriesStardustDiscard: [],
  respondShootEvade: [],
  respondShootPass: [],
  useAthenaWit: [],
  respondTerroristAccept: [],
  playShadeFollow: [],
  skipDiscard: [],

  // 玩家 / 牌 / 层
  playBlackSwanTour: [recordByPlayer(cardList)],
  playBlackHoleLevy: [recordByPlayer(card)],
  useBlackHoleAbsorb: [layer],
  useImperialCityWorldShoot: [player],
  playRevive: [nullable(player), cardList],
  useVenusMirrorWorld: [player, cardList],
  playShoot: [player, card, ...shootExtras],
  playShootSudger: [player, card, optional(card)],
  resolveSudgerPick: [oneOf('A', 'B')],
  playNightmareUnlock: [card, layer],
  masterDiscardNightmare: [layer],
  masterActivateNightmare: [layer, nightmareParams],
  playShift: [card, player],
  playShootDreamTransit: [
    card,
    oneOf('shoot', 'transit'),
    (v, G, args) => (args[1] === 'shoot' ? player(v, G, args) : layer(v, G, args)),
    optional(card),
  ],
  playShootKing: [player, card, optional(card)],
  playShootArmor: [player, card, optional(card)],
  playShootBurst: [player, card, optional(card)],
  resolveShootMove: [layer],
  playGreenRayArrest: [card, player, layer],
  dreamMasterMove: [layer],
  playUnlock: [card],
  playHaleyImpact: [player],
  playDreamTransit: [card, layer],
  playKick: [card, player],
  playTelekinesis: [card, player],
  playPeek: [card, layer],
  masterPeekBribeDecision: [bool, optional(indexOf((G) => G.bribePool.length))],
  masterVaultDecision: [oneOf('bribe', 'nightmare', 'discard'), vaultDecisionParams],
  playPeekMaster: [card, player],
  playSecretPassageTeleport: [player, card],
  useVenusDouble: [cardList],
  useUranusPower: [player, layer],
  usePlutoBurning: [card],
  useFortressColdness: [player],
  useMarsKill: [layer, nightmareParams],
  useSaturnFreeMove: [layer],
  useSagittariusHeartLock: [layer, oneOf(-1, 1)],
  useMarsBattlefield: [card, card, card],
  useChessTranspose: [indexOf((G) => G.vaults.length), indexOf((G) => G.vaults.length)],
  playGraft: [card],
  resolveGraft: [cardList],
  playGravity: [card, playerList],
  resolveGravityPick: [card],
  playResonance: [card, player],
  playTimeStorm: [card],
  playCreation: [card],
  playLunaEclipse: [cardList, player],
  playLunaFullMoon: [cardList, playerList],
  playPiscesBlessing: [nullable(player)],
  playAriesStardustActivate: [nightmareParams],
  respondTerroristDiscard: [card],
  respondVirgoPerfect: [oneOf('revive', 'draw_two', 'teleport', 'skip'), virgoParams],
  playGaiaShift: [recordByPlayer(oneOf(-1, 1))],
  playDarwinEvolution: [cardList],
  playForgerExchangeSingle: [player, card],
  playLibraBalance: [player],
  resolveLibraSplit: [cardList, cardList],
  resolveLibraPick: [oneOf('pile1', 'pile2')],
  playArchitectMaze: [card, player],
  playApolloWorship: [player],
  playMartyrSacrifice: [oneOf('increase', 'decrease')],
  playAthenaAwe: [cardList, player],
  playChemistRefine: [card],
  playAquariusCoherence: [card],
  playChemistInject: [player, layer],
  playLordOfWarBlackMarket: [cardList, card],
  playPaprikSalvation: [card, player],
  playTouristAssist: [player],
  doDiscard: [cardList],
  useSpaceQueenStashTop: [card],
};

/** 参数是否满足该 move 登记的形状；没登记的 move 视同没有参数 */
export function checkMoveArgs(G: SetupState, move: string, args: readonly unknown[]): boolean {
  if (!Object.hasOwn(MOVE_ARG_SPECS, move)) return true;
  const specs = MOVE_ARG_SPECS[move]!;
  return specs.every((check, i) => check(args[i], G, args));
}
