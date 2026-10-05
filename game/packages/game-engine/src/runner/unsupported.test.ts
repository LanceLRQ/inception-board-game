// 运行器不支持的流程配置必须在建局时报错

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from '../game.js';
import type { SetupState } from '../setup.js';
import { assertSupportedGame, createMatch, type GameDef } from './matchRunner.js';

interface Tiny {
  n: number;
}

function tinyGame(patch: Record<string, unknown> = {}): GameDef<Tiny> {
  const base = {
    setup: () => ({ n: 0 }),
    phases: {
      main: {
        start: true,
        turn: {},
        moves: { inc: { move: ({ G }: { G: Tiny }) => ({ n: G.n + 1 }) } },
      },
    },
  };
  return { ...base, ...patch } as unknown as GameDef<Tiny>;
}

function withPhase(patch: Record<string, unknown>): GameDef<Tiny> {
  const g = tinyGame();
  return { ...g, phases: { main: { ...g.phases.main, ...patch } } } as unknown as GameDef<Tiny>;
}

describe('对局运行器 · 不支持的配置', () => {
  it('最小的合法定义可以建局', () => {
    expect(() => createMatch(tinyGame(), { numPlayers: 2, seed: 's' })).not.toThrow();
  });

  it('本项目的引擎定义通过检查', () => {
    expect(() => assertSupportedGame(InceptionCityGame as GameDef<SetupState>)).not.toThrow();
  });

  it.each([
    ['全局 moves', tinyGame({ moves: {} }), 'game.moves'],
    ['全局 turn', tinyGame({ turn: {} }), 'game.turn'],
    ['插件', tinyGame({ plugins: [] }), 'game.plugins'],
    ['分阶段行动', withPhase({ turn: { stages: {} } }), 'phases.main.turn.stages'],
    ['回合结束条件', withPhase({ turn: { endIf: () => true } }), 'phases.main.turn.endIf'],
    ['回合步数上限', withPhase({ turn: { maxMoves: 1 } }), 'phases.main.turn.maxMoves'],
    ['回合内 move 钩子', withPhase({ turn: { onMove: () => {} } }), 'phases.main.turn.onMove'],
    [
      '自定义出牌名单',
      withPhase({ turn: { order: { first: () => 0, next: () => 0, playOrder: () => [] } } }),
      'phases.main.turn.order.playOrder',
    ],
    ['函数形式的下一阶段', withPhase({ next: () => 'main' }), 'phases.main.next'],
    ['函数简写的 move', withPhase({ moves: { inc: () => ({ n: 1 }) } }), 'phases.main.moves.inc'],
    [
      'move 上的未知标记',
      withPhase({ moves: { inc: { move: () => ({ n: 1 }), redact: true } } }),
      'phases.main.moves.inc.redact',
    ],
  ])('%s：建局时报错并指出位置', (_label, game, where) => {
    expect(() => createMatch(game, { numPlayers: 2, seed: 's' })).toThrow(where);
  });
});
