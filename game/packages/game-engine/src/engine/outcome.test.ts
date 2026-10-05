import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from '../game.js';
import type { SetupState } from '../setup.js';
import {
  applyMove,
  createMatch,
  eventsFor,
  viewMatch,
  type GameDef,
} from '../runner/matchRunner.js';
import type { MatchView } from './matchView.js';
import { matchOutcome } from './outcome.js';

const game: GameDef<SetupState> = InceptionCityGame;
const NONE = { winner: null, winReason: null };

describe('matchOutcome', () => {
  it('未结束时没有结果', () => {
    expect(matchOutcome(undefined, NONE)).toEqual({ winner: null, reason: null });
  });

  it('从结束判定的返回值里读出胜方与原因', () => {
    expect(matchOutcome({ winner: 'master', reason: 'deck_exhausted' }, NONE)).toEqual({
      winner: 'master',
      reason: 'deck_exhausted',
    });
  });

  it('结束判定没带细节时回落到状态里的字段', () => {
    expect(matchOutcome(true, { winner: 'thief', winReason: 'r' })).toEqual({
      winner: 'thief',
      reason: 'r',
    });
  });

  it('不认识的胜方值不被采信', () => {
    expect(matchOutcome({ winner: 'nobody', reason: 7 }, NONE)).toEqual({
      winner: null,
      reason: null,
    });
  });
});

describe('对局结束后的结果去向', () => {
  // 秘密金库被打开即盗梦者获胜；这里直接把它标成已打开，再走一步让结束判定生效
  function finishedMatch() {
    const s = createMatch(game, {
      numPlayers: 5,
      setupData: { rngSeed: 'outcome' },
      seed: 'outcome',
    });
    const vaults = s.G.vaults.map((v) =>
      v.contentType === 'secret' ? { ...v, isOpened: true } : v,
    );
    const out = applyMove(
      game,
      { ...s, G: { ...s.G, vaults } },
      { playerID: s.ctx.currentPlayer, move: 'completeSetup', args: [] },
    );
    if (!out.ok) throw new Error(`move rejected: ${out.reason}`);
    return out;
  }

  it('每个观察者的视图都带胜方与原因', () => {
    const { state } = finishedMatch();
    expect(state.ctx.gameover).toBeDefined();
    for (const viewer of ['0', '3', null]) {
      const view = viewMatch(game, state, viewer).G as unknown as MatchView;
      expect(view.gameOver).toBe(true);
      expect(view.winner).toBe('thief');
      expect(view.winReason).toBe('secret_vault_opened');
    }
  });

  it('结束事件带同样的结果', () => {
    const { events } = finishedMatch();
    const over = eventsFor(events, null).find((e) => e.kind === 'game_over');
    expect(over?.data).toEqual({ winner: 'thief', reason: 'secret_vault_opened' });
  });
});
