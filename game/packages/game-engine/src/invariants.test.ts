import { describe, it, expect } from 'vitest';
import type { Layer, CardID } from '@icgame/shared';
import { checkInvariants, assertInvariants } from './invariants.js';
import {
  createTestState,
  makePlayer,
  makeLayer,
  withHand,
  withBribes,
} from './testing/fixtures.js';
import {
  scenarioStartOfGame3p,
  scenarioMidGameThiefAtL3,
  scenarioMasterWin,
} from './testing/scenarios.js';

describe('checkInvariants - happy path', () => {
  it('returns empty for a freshly created test state', () => {
    const state = createTestState();
    // setup 阶段对 master_count 宽容
    const v = checkInvariants(state);
    // 默认 fixture 是 setup 阶段且 5 人（4 thief + 1 master）
    expect(v).toEqual([]);
  });

  it('returns empty for scenarioStartOfGame3p', () => {
    const v = checkInvariants(scenarioStartOfGame3p());
    expect(v).toEqual([]);
  });

  it('returns empty for scenarioMidGameThiefAtL3', () => {
    const v = checkInvariants(scenarioMidGameThiefAtL3());
    expect(v).toEqual([]);
  });

  it('returns empty for scenarioMasterWin', () => {
    const v = checkInvariants(scenarioMasterWin());
    expect(v).toEqual([]);
  });
});

describe('checkInvariants - rule 1: master count', () => {
  it('flags when no master in playing phase', () => {
    const base = createTestState({ phase: 'playing' });
    const noMaster = {
      ...base,
      players: Object.fromEntries(
        Object.entries(base.players).map(([k, v]) => [k, { ...v, faction: 'thief' as const }]),
      ),
    };
    const violations = checkInvariants(noMaster);
    expect(violations.some((v) => v.rule === 'master_count')).toBe(true);
  });

  it('flags when multiple masters in playing phase', () => {
    const base = createTestState({ phase: 'playing' });
    const twoMasters = {
      ...base,
      players: {
        ...base.players,
        p1: { ...base.players.p1!, faction: 'master' as const },
      },
    };
    const v = checkInvariants(twoMasters);
    expect(v.some((x) => x.rule === 'master_count')).toBe(true);
  });

  it('does not flag master_count during setup phase', () => {
    const s = createTestState({
      phase: 'setup',
      players: Object.fromEntries(
        Object.entries(createTestState().players).map(([k, p]) => [
          k,
          { ...p, faction: 'thief' as const },
        ]),
      ),
    });
    const v = checkInvariants(s);
    expect(v.some((x) => x.rule === 'master_count')).toBe(false);
  });
});

describe('checkInvariants - rule 2: current player', () => {
  it('flags when currentPlayerID is not in playerOrder', () => {
    const s = scenarioStartOfGame3p();
    const bad = { ...s, currentPlayerID: 'ghost' };
    const v = checkInvariants(bad);
    expect(v.some((x) => x.rule === 'current_player_in_order')).toBe(true);
  });
});

describe('checkInvariants - rule 3: layer range', () => {
  it('flags negative layer', () => {
    const s = scenarioStartOfGame3p();
    const bad = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, currentLayer: -1 as unknown as Layer } },
    };
    const v = checkInvariants(bad);
    expect(v.some((x) => x.rule === 'layer_range')).toBe(true);
  });

  it('flags layer > 4', () => {
    const s = scenarioStartOfGame3p();
    const bad = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, currentLayer: 9 as unknown as Layer } },
    };
    const v = checkInvariants(bad);
    expect(v.some((x) => x.rule === 'layer_range')).toBe(true);
  });

  it('accepts layer 0 (迷失层)', () => {
    const s = scenarioStartOfGame3p();
    const layer0 = makeLayer(0 as Layer, { heartLockValue: 0, playersInLayer: ['p1'] });
    const updated = {
      ...s,
      layers: { ...s.layers, 0: layer0, 1: { ...s.layers[1]!, playersInLayer: ['p2', 'pM'] } },
      players: { ...s.players, p1: { ...s.players.p1!, currentLayer: 0 as Layer } },
    };
    const v = checkInvariants(updated);
    expect(v.some((x) => x.rule === 'layer_range')).toBe(false);
  });
});

describe('checkInvariants - rule 4: heart lock non-negative', () => {
  it('flags negative heart lock', () => {
    const s = scenarioStartOfGame3p();
    const bad = {
      ...s,
      layers: { ...s.layers, 2: { ...s.layers[2]!, heartLockValue: -1 } },
    };
    const v = checkInvariants(bad);
    expect(v.some((x) => x.rule === 'heart_lock_non_negative')).toBe(true);
  });

  it('accepts heart lock = 0', () => {
    const s = scenarioStartOfGame3p();
    const zero = {
      ...s,
      layers: { ...s.layers, 2: { ...s.layers[2]!, heartLockValue: 0 } },
    };
    expect(checkInvariants(zero).some((x) => x.rule === 'heart_lock_non_negative')).toBe(false);
  });
});

describe('checkInvariants - rule 5: hand limit', () => {
  it('flags > 5 hand at turnEnd', () => {
    const s = scenarioStartOfGame3p();
    const tooMany: CardID[] = [
      'a_1' as CardID,
      'a_2' as CardID,
      'a_3' as CardID,
      'a_4' as CardID,
      'a_5' as CardID,
      'a_6' as CardID,
    ];
    const turnEnd = { ...s, turnPhase: 'turnEnd' as const };
    const bad = withHand(turnEnd, 'p1', tooMany);
    const v = checkInvariants(bad);
    expect(v.some((x) => x.rule === 'hand_limit')).toBe(true);
  });

  it('does not flag > 5 hand during action phase', () => {
    const s = scenarioStartOfGame3p();
    const tooMany: CardID[] = [
      'a_1' as CardID,
      'a_2' as CardID,
      'a_3' as CardID,
      'a_4' as CardID,
      'a_5' as CardID,
      'a_6' as CardID,
    ];
    const bad = withHand({ ...s, turnPhase: 'action' as const }, 'p1', tooMany);
    const v = checkInvariants(bad);
    expect(v.some((x) => x.rule === 'hand_limit')).toBe(false);
  });
});

describe('checkInvariants - rule 6: dead + deathTurn', () => {
  it('flags dead player without deathTurn', () => {
    const s = scenarioStartOfGame3p();
    const bad = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, isAlive: false, deathTurn: null },
      },
    };
    const v = checkInvariants(bad);
    expect(v.some((x) => x.rule === 'dead_needs_death_turn')).toBe(true);
  });

  it('flags alive player with deathTurn', () => {
    const s = scenarioStartOfGame3p();
    const bad = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, isAlive: true, deathTurn: 5 } },
    };
    const v = checkInvariants(bad);
    expect(v.some((x) => x.rule === 'alive_no_death_turn')).toBe(true);
  });
});

describe('checkInvariants - rule 7: dead no hand', () => {
  it('flags dead player still holding cards', () => {
    const s = scenarioStartOfGame3p();
    const bad = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          isAlive: false,
          deathTurn: 5,
          hand: ['k_1' as CardID],
        },
      },
    };
    const v = checkInvariants(bad);
    expect(v.some((x) => x.rule === 'dead_no_hand')).toBe(true);
  });
});

describe('checkInvariants - rule 8: layer membership consistency', () => {
  it('flags player-layer mismatch (player thinks L2, layer lists L1)', () => {
    const s = scenarioStartOfGame3p();
    // 让 p1 说自己在 L2，但 layers[2] 没有列出 p1
    const bad = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, currentLayer: 2 as Layer } },
    };
    const v = checkInvariants(bad);
    expect(v.some((x) => x.rule === 'layer_membership')).toBe(true);
  });

  it('flags layer.playersInLayer vs player.currentLayer mismatch (reverse)', () => {
    const s = scenarioStartOfGame3p();
    // layers[3] 列出 p1，但 p1 实际在 L1
    const bad = {
      ...s,
      layers: { ...s.layers, 3: { ...s.layers[3]!, playersInLayer: ['p1'] } },
    };
    const v = checkInvariants(bad);
    expect(v.some((x) => x.rule === 'layer_membership_reverse')).toBe(true);
  });
});

describe('checkInvariants - rule 9: vault consistency', () => {
  it('flags isOpened=true without openedBy', () => {
    const s = scenarioStartOfGame3p();
    const bad = {
      ...s,
      vaults: [{ ...s.vaults[0]!, isOpened: true, openedBy: null }, ...s.vaults.slice(1)],
    };
    const v = checkInvariants(bad);
    expect(v.some((x) => x.rule === 'vault_opened_by')).toBe(true);
  });

  it('flags isOpened=false but openedBy set', () => {
    const s = scenarioStartOfGame3p();
    const bad = {
      ...s,
      vaults: [{ ...s.vaults[0]!, isOpened: false, openedBy: 'p1' }, ...s.vaults.slice(1)],
    };
    const v = checkInvariants(bad);
    expect(v.some((x) => x.rule === 'vault_not_opened_but_by')).toBe(true);
  });
});

describe('checkInvariants - rule 10: winner value', () => {
  it('accepts null/thief/master', () => {
    for (const w of [null, 'thief', 'master'] as const) {
      const s = { ...scenarioStartOfGame3p(), winner: w };
      expect(checkInvariants(s).some((x) => x.rule === 'winner_value')).toBe(false);
    }
  });

  it('flags bogus winner', () => {
    const s = { ...scenarioStartOfGame3p(), winner: 'nobody' as unknown as 'thief' };
    expect(checkInvariants(s).some((x) => x.rule === 'winner_value')).toBe(true);
  });
});

describe('checkInvariants - rule 11: bribe pool', () => {
  it('flags inPool with heldBy set', () => {
    const s = withBribes(scenarioStartOfGame3p(), [{ id: 'b-1', status: 'inPool', heldBy: 'p1' }]);
    const v = checkInvariants(s);
    expect(v.some((x) => x.rule === 'bribe_in_pool')).toBe(true);
  });

  it('flags dealt without heldBy', () => {
    const s = withBribes(scenarioStartOfGame3p(), [{ id: 'b-2', status: 'dealt', heldBy: null }]);
    const v = checkInvariants(s);
    expect(v.some((x) => x.rule === 'bribe_held_required')).toBe(true);
  });

  it('passes when inPool has null heldBy', () => {
    const s = withBribes(scenarioStartOfGame3p(), [{ id: 'b-3', status: 'inPool', heldBy: null }]);
    const v = checkInvariants(s);
    expect(v.some((x) => x.rule.startsWith('bribe_'))).toBe(false);
  });
});

describe('assertInvariants', () => {
  it('is a no-op on clean state', () => {
    expect(() => assertInvariants(scenarioStartOfGame3p())).not.toThrow();
  });

  it('throws with all violations when state is bad', () => {
    const s = scenarioStartOfGame3p();
    const bad = {
      ...s,
      currentPlayerID: 'ghost',
      players: {
        ...s.players,
        p1: { ...s.players.p1!, currentLayer: 99 as unknown as Layer },
      },
    };
    expect(() => assertInvariants(bad)).toThrow(/Invariant violations/);
  });
});

describe('fixtures helpers', () => {
  it('makePlayer respects overrides', () => {
    const p = makePlayer({ id: 'x', faction: 'master' });
    expect(p.id).toBe('x');
    expect(p.faction).toBe('master');
    expect(p.isAlive).toBe(true); // default preserved
  });

  it('makeLayer allows heart lock override', () => {
    const l = makeLayer(2 as Layer, { heartLockValue: 7 });
    expect(l.layer).toBe(2);
    expect(l.heartLockValue).toBe(7);
  });

  it('withHand leaves other players untouched', () => {
    const s = scenarioStartOfGame3p();
    const next = withHand(s, 'p1', ['a' as CardID, 'b' as CardID]);
    expect(next.players.p1!.hand).toEqual(['a', 'b']);
    expect(next.players.p2!.hand).toEqual(s.players.p2!.hand);
  });

  it('withBribes replaces the pool', () => {
    const s = withBribes(scenarioStartOfGame3p(), [
      { id: 'b1', status: 'inPool', heldBy: null },
      { id: 'b2', status: 'dealt', heldBy: 'p1' },
    ]);
    expect(s.bribePool.length).toBe(2);
    expect(s.bribePool[1]!.heldBy).toBe('p1');
  });
});
