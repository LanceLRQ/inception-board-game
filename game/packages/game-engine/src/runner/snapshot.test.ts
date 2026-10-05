// 快照恢复时的形状校验

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from '../game.js';
import type { SetupState } from '../setup.js';
import { createMatch, matchFromSnapshot, type GameDef, type MatchState } from './matchRunner.js';

const game: GameDef<SetupState> = InceptionCityGame;

function valid(): MatchState<SetupState> {
  return createMatch(game, { numPlayers: 4, setupData: { rngSeed: 'snap' }, seed: 'snap' });
}

function broken(patch: (s: Record<string, unknown>) => void): unknown {
  const raw = JSON.parse(JSON.stringify(valid())) as Record<string, unknown>;
  patch(raw);
  return raw;
}

function ctxOf(s: Record<string, unknown>): Record<string, unknown> {
  return s.ctx as Record<string, unknown>;
}

describe('对局运行器 · 快照校验', () => {
  it('合法快照经 JSON 往返后原样返回', () => {
    const s = valid();
    expect(matchFromSnapshot<SetupState>(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it.each([
    ['不是对象', 'oops', '不是对象'],
    ['null', null, '不是对象'],
    ['缺少 G', broken((s) => delete s.G), 'G'],
    ['缺少 ctx', broken((s) => delete s.ctx), 'ctx'],
    ['人数不是正整数', broken((s) => (ctxOf(s).numPlayers = 0)), 'ctx.numPlayers'],
    ['出牌顺序不是字符串数组', broken((s) => (ctxOf(s).playOrder = [1, 2])), 'ctx.playOrder'],
    ['出牌位置越界', broken((s) => (ctxOf(s).playOrderPos = 99)), 'ctx.playOrderPos'],
    [
      '当前玩家不在出牌顺序里',
      broken((s) => (ctxOf(s).currentPlayer = 'ghost')),
      'ctx.currentPlayer',
    ],
    ['阶段类型不对', broken((s) => (ctxOf(s).phase = 3)), 'ctx.phase'],
    ['回合数为负', broken((s) => (ctxOf(s).turn = -1)), 'ctx.turn'],
    ['随机数状态不是整数', broken((s) => (s.rngState = 1.5)), 'rngState'],
    ['版本号为负', broken((s) => (s.stateID = -1)), 'stateID'],
  ])('%s：抛错并指出字段', (_label, raw, field) => {
    expect(() => matchFromSnapshot(raw)).toThrow(field);
  });
});
