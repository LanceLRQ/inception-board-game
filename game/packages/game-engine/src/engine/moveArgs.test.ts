import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from '../game.js';
import { createTestState, withBribes } from '../testing/fixtures.js';
import { applyMove, createMatch, type GameDef } from '../runner/matchRunner.js';
import { moveParamNames } from '../runner/moveFuzzer.js';
import type { SetupState } from '../setup.js';
import { MOVE_ARG_SPECS, checkMoveArgs } from './moveArgs.js';

const game: GameDef<SetupState> = InceptionCityGame;
const playingMoves = game.phases.playing!.moves!;

describe('move 参数形状表 · 与 move 名单的对应', () => {
  it('对局阶段的每个 move 都登记过，表里没有多余的名字', () => {
    expect(Object.keys(MOVE_ARG_SPECS).sort()).toEqual(Object.keys(playingMoves).sort());
  });

  it('每个 move 登记的参数个数与它的形参个数一致', () => {
    const mismatched = Object.entries(playingMoves)
      .filter(([name, def]) => MOVE_ARG_SPECS[name]!.length !== moveParamNames(def.move).length)
      .map(
        ([name, def]) =>
          `${name}: 表 ${MOVE_ARG_SPECS[name]!.length} / 形参 ${moveParamNames(def.move).length}`,
      );
    expect(mismatched).toEqual([]);
  });

  it('准备阶段的 move 没有参数，不需要登记', () => {
    for (const [name, def] of Object.entries(game.phases.setup!.moves!)) {
      expect(moveParamNames(def.move), name).toEqual([]);
    }
  });
});

describe('checkMoveArgs', () => {
  const G = createTestState({ phase: 'playing' });
  const [a, b] = G.playerOrder as [string, string];

  const accepted: [string, unknown[]][] = [
    ['playKick', ['action_kick', b]],
    ['playRevive', [null, ['action_kick']]],
    ['playRevive', [b, []]],
    ['playShoot', [b, 'action_shoot']],
    ['playShoot', [b, 'action_shoot', null, null]],
    ['playShoot', [b, 'action_shoot', 'action_death_decree_5', true]],
    ['playShootDreamTransit', ['action_shoot_dream_transit', 'shoot', b]],
    ['playShootDreamTransit', ['action_shoot_dream_transit', 'transit', 3, null]],
    ['dreamMasterMove', [0]],
    ['dreamMasterMove', [4]],
    ['playGreenRayArrest', ['action_shoot']],
    ['playGreenRayArrest', ['action_shoot', null, 3]],
    ['playGreenRayArrest', ['action_shoot', b]],
    ['playGreenRayArrest', ['action_shoot', b, 4]],
    ['useSagittariusHeartLock', [2, -1]],
    ['masterActivateNightmare', [2]],
    ['masterActivateNightmare', [2, null]],
    [
      'masterActivateNightmare',
      [2, { targetLayer: 3, action: 'add', bribedTargets: [a], other: 1 }],
    ],
    ['playGaiaShift', [-1]],
    ['playGaiaShift', [1]],
    ['respondVirgoPerfect', ['revive', { targetID: b }]],
    ['respondVirgoPerfect', ['skip']],
    ['masterPeekBribeDecision', [false]],
    ['playPiscesBlessing', [null]],
    ['doDiscard', [['action_kick', 'action_shoot']]],
    ['doDraw', []],
    ['doDraw', [null]],
    ['doDraw', [0]],
    ['doDraw', [3]],
    ['未登记的move', [1, 2, 3]],
  ];
  for (const [move, args] of accepted) {
    it(`放行合法形状：${move} ${JSON.stringify(args)}`, () => {
      expect(checkMoveArgs(G, move, args)).toBe(true);
    });
  }

  const rejected: [string, unknown[]][] = [
    ['playKick', []],
    ['playKick', ['action_kick', 1]],
    ['playKick', ['action_kick', 'nobody']],
    ['playKick', ['action_kick', '__proto__']],
    ['playKick', ['action_kick', 'constructor']],
    ['playKick', [{}, b]],
    ['playKick', ['x'.repeat(65), b]],
    ['playRevive', [undefined, []]],
    ['playRevive', [0, []]],
    ['playRevive', [b, 'action_kick']],
    ['playShoot', [0, 'action_shoot']],
    ['playShoot', [b, 'action_shoot', 5]],
    ['playShoot', [b, 'action_shoot', null, 'yes']],
    ['playShootDreamTransit', ['action_shoot_dream_transit', 'shoot', 3]],
    ['playShootDreamTransit', ['action_shoot_dream_transit', 'transit', b]],
    ['playShootDreamTransit', ['action_shoot_dream_transit', 'fly', 3]],
    ['playGreenRayArrest', []],
    ['playGreenRayArrest', ['action_shoot', 5, 3]],
    ['playGreenRayArrest', ['action_shoot', 'nobody']],
    ['playGreenRayArrest', ['action_shoot', null, 5]],
    ['playGreenRayArrest', ['action_shoot', null, '3']],
    ['dreamMasterMove', [5]],
    ['dreamMasterMove', [-1]],
    ['dreamMasterMove', [1.5]],
    ['dreamMasterMove', [true]],
    ['dreamMasterMove', [Number.NaN]],
    ['dreamMasterMove', ['2']],
    ['useSagittariusHeartLock', [2, 0]],
    ['useSagittariusHeartLock', [2, 1000]],
    ['masterActivateNightmare', [2, 'x']],
    ['masterActivateNightmare', [2, { targetLayer: 9 }]],
    ['masterActivateNightmare', [2, { action: 'steal' }]],
    ['masterActivateNightmare', [2, { bribedTargets: ['nobody'] }]],
    ['playGaiaShift', []],
    ['playGaiaShift', [0]],
    ['playGaiaShift', [2]],
    ['playGaiaShift', ['1']],
    ['playGaiaShift', [{ [a]: -1, [b]: 1 }]],
    ['playGaiaShift', [[1]]],
    ['respondVirgoPerfect', ['revive', { targetID: 7 }]],
    ['respondVirgoPerfect', ['teleport', { layer: 'x' }]],
    ['respondVirgoPerfect', ['cheat']],
    ['masterPeekBribeDecision', ['true']],
    ['masterPeekBribeDecision', [true, 99]],
    ['masterPeekBribeDecision', [true, -1]],
    ['masterVaultDecision', ['steal']],
    ['masterVaultDecision', [1]],
    ['masterVaultDecision', ['bribe', { poolIndex: 99 }]],
    ['masterVaultDecision', ['bribe', { poolIndex: -1 }]],
    ['masterVaultDecision', ['nightmare', { targetLayer: 9 }]],
    ['useChessTranspose', [0, 99]],
    ['playGravity', ['action_gravity', [a, a, a, a, a, a, a, a, a, a, a, a]]],
    ['playGravity', ['action_gravity', ['nobody']]],
    ['doDiscard', [[1]]],
    ['doDiscard', [Array.from({ length: 1000 }, () => 'x')]],
    ['doDiscard', ['action_kick']],
    ['resolveSudgerPick', ['C']],
    ['doDraw', ['多余的参数']],
    ['doDraw', [-1]],
    ['doDraw', [1.5]],
    ['doDraw', [1000]],
  ];
  for (const [move, args] of rejected) {
    it(`拒绝畸形形状：${move} ${JSON.stringify(args).slice(0, 60)}`, () => {
      expect(checkMoveArgs(G, move, args)).toBe(false);
    });
  }

  it('带 __proto__ 键的对象被拒绝，也不会污染原型', () => {
    const polluted: unknown = JSON.parse('{"__proto__":{"polluted":true}}');
    expect(checkMoveArgs(G, 'playBlackSwanTour', [polluted])).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const withKey: unknown = JSON.parse(`{"__proto__":["action_kick"],"${a}":["action_kick"]}`);
    expect(checkMoveArgs(G, 'playBlackSwanTour', [withKey])).toBe(false);
  });
});

describe('经过运行器的参数拒绝', () => {
  it('类型不对的参数被拒绝为非法 move，状态原样不动', () => {
    const created = createMatch(game, {
      numPlayers: 5,
      setupData: { rngSeed: 'args' },
      seed: 'args',
    });
    const started = applyMove(game, created, { playerID: '0', move: 'completeSetup', args: [] });
    if (!started.ok) throw new Error('completeSetup 被拒绝');
    const s = started.state;
    const before = JSON.stringify(s.G);
    const cur = s.ctx.currentPlayer;
    const res = applyMove(game, s, { playerID: cur, move: 'dreamMasterMove', args: [true] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('invalid_move');
    expect(JSON.stringify(res.state.G)).toBe(before);

    const kick = applyMove(game, s, { playerID: cur, move: 'playKick', args: ['action_kick', 1] });
    expect(kick.ok).toBe(false);
    expect(JSON.stringify(kick.state.G)).toBe(before);
  });
});

describe('checkMoveArgs · 贿赂派发与金库三选一', () => {
  const G = withBribes(createTestState({ phase: 'playing' }), [
    { id: 'bribe-0', kind: 'fail' },
    { id: 'bribe-1', kind: 'deal' },
  ]);

  const accepted: [string, unknown[]][] = [
    ['masterVaultDecision', ['bribe']],
    ['masterVaultDecision', ['discard', undefined]],
    ['masterVaultDecision', ['bribe', { poolIndex: 1 }]],
    ['masterVaultDecision', ['nightmare', { targetLayer: 2, action: 'add' }]],
    ['masterPeekBribeDecision', [true]],
    ['masterPeekBribeDecision', [true, 1]],
  ];
  for (const [move, args] of accepted) {
    it(`放行合法形状：${move} ${JSON.stringify(args)}`, () => {
      expect(checkMoveArgs(G, move, args)).toBe(true);
    });
  }

  const rejected: [string, unknown[]][] = [
    ['masterVaultDecision', ['bribe', { poolIndex: 2 }]],
    ['masterVaultDecision', ['bribe', { poolIndex: 'x' }]],
    ['masterPeekBribeDecision', [true, 2]],
  ];
  for (const [move, args] of rejected) {
    it(`拒绝畸形形状：${move} ${JSON.stringify(args)}`, () => {
      expect(checkMoveArgs(G, move, args)).toBe(false);
    });
  }
});
