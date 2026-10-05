// 从包入口使用对局运行器

import { describe, it, expect } from 'vitest';
import {
  InceptionCityGame,
  applyMove,
  createMatch,
  matchFromSnapshot,
  type GameDef,
  type SetupState,
} from '../index.js';

describe('包入口 · 对局运行器', () => {
  it('引擎定义可以直接交给运行器，不需要类型转换', () => {
    const game: GameDef<SetupState> = InceptionCityGame;
    const s = createMatch(game, {
      numPlayers: 4,
      setupData: { rngSeed: 'export' },
      seed: 'export',
    });
    const res = applyMove(game, s, { playerID: '0', move: 'completeSetup', args: [] });
    expect(res.ok).toBe(true);
    expect(matchFromSnapshot<SetupState>(JSON.parse(JSON.stringify(res.state)))).toEqual(res.state);
  });
});
