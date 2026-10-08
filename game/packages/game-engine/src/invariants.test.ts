import { describe, it, expect } from 'vitest';
import type { Layer, CardID } from '@icgame/shared';
import { checkInvariants, assertInvariants } from './invariants.js';
import type { SetupState } from './setup.js';
import {
  createTestState,
  makePlayer,
  makeLayer,
  withHand,
  withBribes,
} from './testing/fixtures.js';
import {
  scenarioActionPhase,
  scenarioStartOfGame3p,
  scenarioMidGameThiefAtL3,
  scenarioMasterWin,
} from './testing/scenarios.js';

describe('checkInvariants - happy path', () => {
  it('returns empty for a freshly created test state', () => {
    const state = createTestState();
    // setup 阶段不检查梦主身份
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

describe('checkInvariants - rule 1: master identity', () => {
  it('flags when the declared dream master is not on the master faction', () => {
    const base = createTestState({ phase: 'playing' });
    const noMaster = {
      ...base,
      players: Object.fromEntries(
        Object.entries(base.players).map(([k, v]) => [k, { ...v, faction: 'thief' as const }]),
      ),
    };
    const violations = checkInvariants(noMaster);
    expect(violations.some((v) => v.rule === 'master_id')).toBe(true);
  });

  it('flags when dreamMasterID points at a missing player in playing phase', () => {
    const base = createTestState({ phase: 'playing' });
    const v = checkInvariants({ ...base, dreamMasterID: 'ghost' });
    expect(v.some((x) => x.rule === 'master_id')).toBe(true);
  });

  it('flags a non-master player on the master faction without a successful bribe', () => {
    const base = createTestState({ phase: 'playing' });
    const twoMasters = {
      ...base,
      players: {
        ...base.players,
        p1: { ...base.players.p1!, faction: 'master' as const },
      },
    };
    const v = checkInvariants(twoMasters);
    expect(v.some((x) => x.rule === 'betrayer_without_deal')).toBe(true);
  });

  it('accepts a betrayer who holds a successful bribe', () => {
    const base = createTestState({ phase: 'playing' });
    const withBetrayer = withBribes(
      {
        ...base,
        players: {
          ...base.players,
          p1: { ...base.players.p1!, faction: 'master' as const, bribeReceived: 1 },
        },
      },
      [{ id: 'b-deal', kind: 'deal', status: 'deal', heldBy: 'p1', originalOwnerId: 'p1' }],
    );
    const v = checkInvariants(withBetrayer);
    expect(v).toEqual([]);
  });

  it('does not accept a failed bribe as the reason for a master-faction player', () => {
    const base = createTestState({ phase: 'playing' });
    const s = withBribes(
      {
        ...base,
        players: { ...base.players, p1: { ...base.players.p1!, faction: 'master' as const } },
      },
      [{ id: 'b-fail', kind: 'fail', status: 'dealt', heldBy: 'p1', originalOwnerId: 'p1' }],
    );
    expect(checkInvariants(s).some((x) => x.rule === 'betrayer_without_deal')).toBe(true);
  });

  it('does not flag master identity during setup phase', () => {
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
    expect(v.some((x) => x.rule === 'master_id' || x.rule === 'betrayer_without_deal')).toBe(false);
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

  it('does not flag > 5 hand at turnEnd when sheltered by a living Cancer', () => {
    const s = scenarioActionPhase();
    const cancer = s.players.p2!;
    const sheltered = {
      ...s,
      turnPhase: 'turnEnd' as const,
      players: { ...s.players, p2: { ...cancer, characterId: 'thief_cancer' as CardID } },
    };
    const tooMany = Array.from({ length: 7 }, (_, i) => `a_${i}` as CardID);
    const v = checkInvariants(withHand(sheltered, 'p1', tooMany));
    expect(v.some((x) => x.rule === 'hand_limit')).toBe(false);
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

describe('checkInvariants - dead players may hold cards', () => {
  it('does not flag a dead player still holding cards', () => {
    const s = scenarioStartOfGame3p();
    const dead = {
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
    const v = checkInvariants(dead);
    expect(v.some((x) => x.rule === 'dead_no_hand')).toBe(false);
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

  it('flags a dead player missing from the lost layer roster', () => {
    const s = scenarioStartOfGame3p();
    const bad = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, isAlive: false, deathTurn: 2, hand: [], currentLayer: 0 as Layer },
      },
      layers: { ...s.layers, 0: { ...s.layers[1]!, playersInLayer: [] } },
    };
    const v = checkInvariants(bad);
    expect(v.some((x) => x.rule === 'layer_membership')).toBe(true);
  });

  it('flags a dead player still listed in a dream layer roster', () => {
    const s = scenarioStartOfGame3p();
    const bad = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, isAlive: false, deathTurn: 2, hand: [], currentLayer: 0 as Layer },
      },
    };
    const v = checkInvariants(bad);
    expect(v.some((x) => x.rule === 'layer_membership_reverse')).toBe(true);
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

describe('checkInvariants - 待应答状态的规则', () => {
  function playing(extra: Partial<SetupState>): SetupState {
    return createTestState({ phase: 'playing', turnPhase: 'action', ...extra });
  }
  const asChar = (state: SetupState, id: string, characterId: string): SetupState => ({
    ...state,
    players: {
      ...state.players,
      [id]: { ...state.players[id]!, characterId: characterId as never },
    },
  });
  const withHand = (state: SetupState, id: string, hand: string[]): SetupState => ({
    ...state,
    players: { ...state.players, [id]: { ...state.players[id]!, hand: hand as never } },
  });
  const rules = (state: SetupState) => checkInvariants(state).map((v) => v.rule);

  it('黑洞·吞噬：合法的等待名单没有违规', () => {
    let G = playing({
      turnPhase: 'draw',
      pendingBlackHoleLevy: { blackHoleID: 'p1', waiting: ['p2'] },
    });
    G = asChar(G, 'p1', 'thief_black_hole');
    G = withHand(G, 'p2', ['action_kick']);
    expect(rules(G)).toEqual([]);
  });

  it('黑洞·吞噬：不在抽牌阶段、黑洞不是回合主人、名单里有跨层 / 没牌 / 重复 / 黑洞自己 / 空名单都要点名', () => {
    let G = asChar(
      withHand(playing({ pendingBlackHoleLevy: { blackHoleID: 'p1', waiting: ['p2'] } }), 'p2', [
        'action_kick',
      ]),
      'p1',
      'thief_black_hole',
    );
    expect(rules(G)).toContain('pending_levy_turn');
    G = { ...G, turnPhase: 'draw', currentPlayerID: 'p3' };
    expect(rules(G)).toContain('pending_levy_turn');
    const base = asChar(playing({ turnPhase: 'draw' }), 'p1', 'thief_black_hole');
    const mk = (waiting: string[]) => ({
      ...base,
      pendingBlackHoleLevy: { blackHoleID: 'p1', waiting },
    });
    expect(rules(mk(['p2']))).toContain('pending_levy_hand');
    expect(rules(mk(['p1']))).toContain('pending_levy_waiting');
    expect(rules(mk(['p2', 'p2']))).toContain('pending_levy_duplicate');
    expect(rules(mk([]))).toContain('pending_levy_empty');
    const far: SetupState = {
      ...withHand(mk(['p2']), 'p2', ['action_kick']),
    };
    const farther = {
      ...far,
      players: { ...far.players, p2: { ...far.players.p2!, currentLayer: 3 as never } },
    };
    expect(rules(farther)).toContain('pending_levy_layer');
    expect(
      rules({
        ...mk(['p2']),
        players: {
          ...mk(['p2']).players,
          p1: { ...mk(['p2']).players.p1!, characterId: 'thief_kick' as never },
        },
      }),
    ).toContain('pending_levy_holder');
  });

  it('达尔文·淘汰：合法的选牌等待没有违规；不在出牌阶段、不是达尔文、手牌不足都要点名', () => {
    const G = asChar(
      withHand(playing({ pendingDarwinReturn: { playerID: 'p1' } }), 'p1', [
        'action_kick',
        'action_shoot',
      ]),
      'p1',
      'thief_darwin',
    );
    expect(rules(G)).toEqual([]);
    expect(rules({ ...G, turnPhase: 'draw' })).toContain('pending_darwin_turn');
    expect(rules({ ...G, currentPlayerID: 'p2' })).toContain('pending_darwin_turn');
    expect(rules(asChar(G, 'p1', 'thief_architect'))).toContain('pending_darwin_owner');
    expect(rules(withHand(G, 'p1', ['action_kick']))).toContain('pending_darwin_hand');
  });

  it('雅典娜·急智：合法的应答等待没有违规；出牌者是梦主 / 跨层 / 自己对自己 / 雅典娜不是雅典娜都要点名', () => {
    const wit = {
      athenaID: 'p2',
      userID: 'p1',
      cardId: 'action_kick' as never,
      move: 'playKick',
      args: ['action_kick', 'p2'],
    };
    const G = asChar(playing({ pendingAthenaWit: wit }), 'p2', 'thief_athena');
    expect(rules(G)).toEqual([]);
    expect(rules({ ...G, turnPhase: 'draw' })).toContain('pending_wit_turn');
    expect(rules(asChar(G, 'p2', 'thief_architect'))).toContain('pending_wit_athena');
    expect(
      rules({ ...G, pendingAthenaWit: { ...wit, userID: 'p2' }, currentPlayerID: 'p2' }),
    ).toContain('pending_wit_self');
    expect(
      rules({
        ...G,
        players: { ...G.players, p1: { ...G.players.p1!, currentLayer: 2 as never } },
      }),
    ).toContain('pending_wit_layer');
    expect(rules({ ...G, dreamMasterID: 'p1' })).toContain('pending_wit_master');
  });

  it('土星·律令：合法的应答等待没有违规；不在出牌阶段、等的不是土星梦主、出牌者是梦主、牌已离手都要点名', () => {
    const decree = {
      masterID: 'pM',
      userID: 'p1',
      cardId: 'action_kick' as never,
      move: 'playKick',
      args: ['action_kick', 'p2'],
    };
    const G = asChar(
      withHand(
        playing({ pendingSaturnDecree: decree, currentPlayerID: 'p1', dreamMasterID: 'pM' }),
        'p1',
        ['action_kick'],
      ),
      'pM',
      'dm_saturn_territory',
    );
    expect(rules(G)).toEqual([]);
    expect(rules({ ...G, turnPhase: 'draw' })).toContain('pending_decree_turn');
    expect(rules({ ...G, currentPlayerID: 'p2' })).toContain('pending_decree_turn');
    expect(rules(asChar(G, 'pM', 'dm_fortress'))).toContain('pending_decree_saturn');
    expect(rules({ ...G, pendingSaturnDecree: { ...decree, masterID: 'p2' } })).toContain(
      'pending_decree_master',
    );
    expect(
      rules({ ...G, pendingSaturnDecree: { ...decree, userID: 'pM' }, currentPlayerID: 'pM' }),
    ).toContain('pending_decree_user');
    expect(rules(withHand(G, 'p1', []))).toContain('pending_decree_card');
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
