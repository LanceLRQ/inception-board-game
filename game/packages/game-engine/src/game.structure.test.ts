// 对局定义的结构快照：各阶段的 move 名集合、阶段与回合配置的键、每个 move 的参数个数。
//
// 目的：对局定义由多个模块装配而成，拆分或挪动模块时，这里保证「对外暴露的 move 表」一字不变——
// 没有丢 move、没有多 move、没有换掉参数个数。move 的定义顺序不被任何调用方依赖，所以这里按名字排序比较。
// 有意新增、删除或改名 move 时，同步更新这份清单。
import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from './game.js';

type PhaseDefLike = {
  moves?: Record<
    string,
    {
      client?: boolean;
      move: { unwrapped?: (...args: never[]) => unknown } & ((...args: never[]) => unknown);
    }
  >;
  turn?: { order?: Record<string, unknown> } & Record<string, unknown>;
} & Record<string, unknown>;

const phases = InceptionCityGame.phases as unknown as Record<string, PhaseDefLike>;

const SETUP_MOVE_ARITY: Record<string, number> = {
  completeSetup: 1,
  pickCharacter: 1,
};

const PLAYING_MOVE_ARITY: Record<string, number> = {
  doDiscard: 2,
  doDraw: 1,
  dreamMasterMove: 2,
  endActionPhase: 1,
  masterActivateNightmare: 3,
  masterDiscardNightmare: 2,
  masterPeekBribeDecision: 3,
  masterVaultDecision: 3,
  passResponse: 1,
  peekerAcknowledge: 1,
  playApolloWorship: 2,
  playAquariusCoherence: 2,
  playArchitectMaze: 3,
  playAriesStardustActivate: 2,
  playAriesStardustDiscard: 1,
  playAthenaAwe: 3,
  playBlackHoleLevy: 2,
  playBlackSwanTour: 2,
  playChemistInject: 3,
  playChemistRefine: 2,
  playCreation: 2,
  playDarwinEvolution: 2,
  playDreamTransit: 3,
  playForgerExchangeSingle: 3,
  playGaiaShift: 2,
  playGeminiChoice: 1,
  playGeminiSync: 1,
  playGraft: 2,
  playGravity: 3,
  playGreenRayArrest: 4,
  playHaleyImpact: 2,
  playJokerGamble: 1,
  playKick: 3,
  playLibraBalance: 2,
  playLordOfWarBlackMarket: 3,
  playLunaEclipse: 3,
  playLunaFullMoon: 3,
  playMartyrSacrifice: 2,
  playNightmareUnlock: 3,
  playPaprikSalvation: 3,
  playPeek: 3,
  playPeekMaster: 3,
  playPiscesBlessing: 2,
  playResonance: 3,
  playRevive: 3,
  playSecretPassageTeleport: 3,
  playShadeFollow: 1,
  playShift: 3,
  playShoot: 5,
  playShootArmor: 4,
  playShootBurst: 4,
  playShootDreamTransit: 5,
  playShootKing: 4,
  playShootSudger: 4,
  playTelekinesis: 3,
  playTimeStorm: 2,
  playTouristAssist: 2,
  playUnlock: 2,
  resolveGraft: 2,
  resolveGravityPick: 2,
  resolveLibraPick: 2,
  resolveLibraSplit: 3,
  resolveShootMove: 2,
  resolveSudgerPick: 2,
  resolveUnlock: 1,
  respondCancelUnlock: 1,
  respondShootEvade: 1,
  respondShootPass: 1,
  respondTerroristAccept: 1,
  respondTerroristDiscard: 2,
  respondVirgoPerfect: 3,
  skipDiscard: 1,
  skipDraw: 1,
  useAthenaWit: 1,
  useBlackHoleAbsorb: 2,
  useChessTranspose: 3,
  useImperialCityWorldShoot: 2,
  useMarsBattlefield: 4,
  useMarsKill: 3,
  usePlutoBurning: 2,
  useSagittariusHeartLock: 3,
  useSaturnFreeMove: 2,
  useSpaceQueenStashTop: 2,
  useUranusPower: 3,
  useVenusDouble: 2,
  useVenusMirrorWorld: 3,
};

/** 取 move 本体的参数个数：套了行动权闸门的取闸门包住的原函数 */
function arityOf(def: NonNullable<PhaseDefLike['moves']>[string]): number {
  return (def.move.unwrapped ?? def.move).length;
}

function arityTable(moves: PhaseDefLike['moves']): Record<string, number> {
  return Object.fromEntries(Object.entries(moves ?? {}).map(([name, def]) => [name, arityOf(def)]));
}

const sortedEntries = (table: Record<string, number>): [string, number][] =>
  Object.entries(table).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

describe('对局定义的结构', () => {
  it('顶层键集合不变', () => {
    expect(Object.keys(InceptionCityGame).sort()).toEqual([
      'actionRights',
      'describe',
      'disableUndo',
      'endIf',
      'maxPlayers',
      'migrate',
      'minPlayers',
      'name',
      'phases',
      'setup',
      'validate',
      'view',
    ]);
  });

  it('阶段集合与各阶段配置的键不变', () => {
    expect(Object.keys(phases).sort()).toEqual(['endgame', 'playing', 'setup']);
    expect(Object.keys(phases.setup!).sort()).toEqual(['endIf', 'moves', 'next', 'start']);
    expect(Object.keys(phases.playing!).sort()).toEqual(['moves', 'turn']);
    expect(Object.keys(phases.endgame!).sort()).toEqual(['next']);
  });

  it('对局阶段的回合配置键不变', () => {
    expect(Object.keys(phases.playing!.turn!).sort()).toEqual(['onBegin', 'onEnd', 'order']);
    expect(Object.keys(phases.playing!.turn!.order!).sort()).toEqual(['first', 'next']);
  });

  it('准备阶段的 move 名与参数个数不变', () => {
    expect(sortedEntries(arityTable(phases.setup!.moves))).toEqual(sortedEntries(SETUP_MOVE_ARITY));
  });

  it('对局阶段的 move 名与参数个数不变（共 86 个）', () => {
    expect(sortedEntries(arityTable(phases.playing!.moves))).toEqual(
      sortedEntries(PLAYING_MOVE_ARITY),
    );
  });

  it('结束阶段没有 move', () => {
    expect(phases.endgame!.moves).toBeUndefined();
  });

  it('每个 move 定义只有 move 与 client 两个键，且 client 为 false', () => {
    for (const phase of Object.values(phases)) {
      for (const [name, def] of Object.entries(phase.moves ?? {})) {
        expect(Object.keys(def).sort(), name).toEqual(['client', 'move']);
        expect(def.client, name).toBe(false);
      }
    }
  });

  it('对局阶段的每个 move 都套了行动权闸门，准备阶段的没有', () => {
    for (const [name, def] of Object.entries(phases.playing!.moves ?? {})) {
      expect(typeof def.move.unwrapped, name).toBe('function');
    }
    for (const [name, def] of Object.entries(phases.setup!.moves ?? {})) {
      expect(def.move.unwrapped, name).toBeUndefined();
    }
  });
});
