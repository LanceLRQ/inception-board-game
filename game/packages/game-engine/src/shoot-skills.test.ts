// 意念判官·定罪与哈雷·冲击：只改掷骰这一步，其余与普通 SHOOT 走同一套结算。
// 对照：docs/manual/05-dream-thieves.md 意念判官 / 哈雷；docs/manual/04-action-cards.md SHOOT 解析

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from './setup.js';
import { HALEY_SKILL_ID, SUDGER_SKILL_ID } from './engine/skills.js';
import { InceptionCityGame } from './game.js';
import { checkStateInvariants } from './engine/stateInvariants.js';
import {
  applyMove,
  matchFromSnapshot,
  type GameDef,
  type MatchState,
  type RandomSource,
} from './runner/matchRunner.js';
import { callMove, createTestState, makePlayer } from './testing/fixtures.js';

const SHOOT = 'action_shoot' as CardID;
const NIGHTMARE = 'nightmare_despair_storm' as CardID;

interface SceneOptions {
  shooterCharacter: CardID;
  shooterLayer?: Layer;
  targetLayer?: Layer;
  targetCharacter?: CardID;
  shooterHand?: CardID[];
}

/** p1 = 发动者（回合主人）、p2 = 目标、p3 = 旁观盗梦者、pM = 梦主 */
function scene(opts: SceneOptions): SetupState {
  const base = createTestState({
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 3,
    currentPlayerID: 'p1',
    dreamMasterID: 'pM',
    playerOrder: ['p1', 'p2', 'p3', 'pM'],
    deck: { cards: Array<CardID>(20).fill('action_unlock' as CardID), discardPile: [] },
  });
  const players: SetupState['players'] = {
    p1: makePlayer({
      id: 'p1',
      faction: 'thief',
      characterId: opts.shooterCharacter,
      currentLayer: opts.shooterLayer ?? (2 as Layer),
      hand: opts.shooterHand ?? [],
      successfulUnlocksThisTurn: opts.shooterCharacter === 'thief_haley' ? 1 : 0,
    }),
    p2: makePlayer({
      id: 'p2',
      faction: 'thief',
      characterId: opts.targetCharacter ?? ('thief_architect' as CardID),
      currentLayer: opts.targetLayer ?? (2 as Layer),
      hand: [],
    }),
    p3: makePlayer({ id: 'p3', faction: 'thief', characterId: 'thief_p3' as CardID }),
    pM: makePlayer({
      id: 'pM',
      faction: 'master',
      characterId: 'dm_fortress' as CardID,
      currentLayer: 4 as Layer,
    }),
  };
  return place({ ...base, players });
}

/** 按玩家所在层重算各层的 playersInLayer */
function place(state: SetupState): SetupState {
  const layers = { ...state.layers };
  for (const key of Object.keys(layers)) {
    const layer = Number(key) as Layer;
    layers[layer] = {
      ...layers[layer]!,
      playersInLayer: state.playerOrder.filter((id) => state.players[id]!.currentLayer === layer),
    };
  }
  return { ...state, layers };
}

function withNightmare(state: SetupState, layer: Layer): SetupState {
  return {
    ...state,
    layers: {
      ...state.layers,
      [layer]: { ...state.layers[layer]!, nightmareId: NIGHTMARE, nightmareRevealed: false },
    },
  };
}

function withAries(state: SetupState): SetupState {
  return {
    ...state,
    players: {
      ...state.players,
      p3: { ...state.players.p3!, characterId: 'thief_aries' as CardID },
    },
  };
}

function ok(r: SetupState | 'INVALID_MOVE'): SetupState {
  expect(r).not.toBe('INVALID_MOVE');
  return r as SetupState;
}

describe('意念判官·定罪 与普通 SHOOT 共用结算', () => {
  const sudgerScene = (o: Partial<SceneOptions> = {}): SetupState =>
    scene({
      shooterCharacter: 'thief_sudger_of_mind' as CardID,
      shooterHand: [SHOOT],
      ...o,
    });

  describe('命中「移动」', () => {
    it.each([2, 3] as const)('目标在第 %i 层：挂起选层，由射手决定去向', (layer) => {
      let s = sudgerScene({ shooterLayer: layer, targetLayer: layer });
      s = ok(callMove(s, 'playShootSudger', ['p2', SHOOT], { rolls: [1, 3] }));
      const picked = ok(callMove(s, 'resolveSudgerPick', ['B']));
      expect(picked.pendingSudgerRolls ?? null).toBeNull();
      expect(picked.pendingShootMove).toMatchObject({
        shooterID: 'p1',
        targetPlayerID: 'p2',
        cardId: SHOOT,
        choices: layer === 2 ? [1, 3] : [2, 4],
      });
      // 选层前目标还在原层，牌已弃出
      expect(picked.players.p2!.currentLayer).toBe(layer);
      expect(picked.players.p1!.hand).not.toContain(SHOOT);

      const choice = layer === 2 ? 1 : 4;
      const moved = ok(callMove(picked, 'resolveShootMove', [choice]));
      expect(moved.pendingShootMove ?? null).toBeNull();
      expect(moved.players.p2!.currentLayer).toBe(choice);
    });

    it('目标在第 1 层或第 4 层：自动移到唯一的相邻层', () => {
      let s = sudgerScene({ shooterLayer: 4 as Layer, targetLayer: 4 as Layer });
      s = ok(callMove(s, 'playShootSudger', ['p2', SHOOT], { rolls: [4, 2] }));
      const r = ok(callMove(s, 'resolveSudgerPick', ['A']));
      expect(r.pendingShootMove ?? null).toBeNull();
      expect(r.players.p2!.currentLayer).toBe(3);
    });
  });

  it('命中「击杀」触发白羊·星尘', () => {
    let s = withNightmare(withAries(sudgerScene()), 2 as Layer);
    s = ok(callMove(s, 'playShootSudger', ['p2', SHOOT], { rolls: [1, 6] }));
    const r = ok(callMove(s, 'resolveSudgerPick', ['A']));
    expect(r.players.p2!.isAlive).toBe(false);
    expect(r.pendingAriesChoice).toMatchObject({ ariesID: 'p3', victimID: 'p2', victimLayer: 2 });
  });

  it('选中点数 6 时触发处女·完美，并把选中的那颗写进 lastShootRoll', () => {
    let s = sudgerScene();
    s = {
      ...s,
      players: {
        ...s.players,
        p3: { ...s.players.p3!, characterId: 'thief_virgo' as CardID },
      },
    };
    s = ok(callMove(s, 'playShootSudger', ['p2', SHOOT], { rolls: [6, 2] }));
    // 掷骰只发生在第一步，选骰前不写 lastShootRoll
    expect(s.lastShootRoll).toBeNull();
    const r = ok(callMove(s, 'resolveSudgerPick', ['A']));
    expect(r.lastShootRoll).toBe(6);
    expect(r.pendingVirgoChoice).toMatchObject({ virgoID: 'p3', triggerRoll: 6 });
  });

  it('选另一颗时 lastShootRoll 记另一颗', () => {
    let s = sudgerScene();
    s = ok(callMove(s, 'playShootSudger', ['p2', SHOOT], { rolls: [5, 2] }));
    const r = ok(callMove(s, 'resolveSudgerPick', ['B']));
    expect(r.lastShootRoll).toBe(2);
  });

  it('水星·逆流：持贿赂牌的意念判官对梦主出牌，梦主先收入这张牌', () => {
    let s = sudgerScene({ shooterLayer: 2 as Layer });
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, bribeReceived: 1 },
        pM: {
          ...s.players.pM!,
          characterId: 'dm_mercury_route' as CardID,
          currentLayer: 2 as Layer,
        },
      },
    };
    s = place(s);
    s = ok(callMove(s, 'playShootSudger', ['pM', SHOOT], { rolls: [6, 5] }));
    const r = ok(callMove(s, 'resolveSudgerPick', ['A']));
    expect(r.players.pM!.hand).toContain(SHOOT);
    expect(r.deck.discardPile).not.toContain(SHOOT);
    expect(r.players.p1!.hand).not.toContain(SHOOT);
  });

  describe('目标是可闪避的双鱼', () => {
    const pisces = 'thief_pisces' as CardID;

    it('先挂起应答窗口，闪避前不掷骰', () => {
      let s = sudgerScene({ targetCharacter: pisces });
      s = ok(callMove(s, 'playShootSudger', ['p2', SHOOT], { rolls: [3, 5] }));
      expect(s.pendingSudgerRolls ?? null).toBeNull();
      expect(s.pendingShootResponse).toMatchObject({
        shooterID: 'p1',
        targetPlayerID: 'p2',
        cardId: SHOOT,
        skill: 'sudger_verdict',
        responseType: 'pisces',
      });
      expect(s.players.p1!.skillUsedThisTurn[SUDGER_SKILL_ID]).toBe(1);
      expect(s.playedCardsThisTurn).toEqual([SHOOT]);
    });

    it('双鱼放弃闪避后掷两颗骰，交给射手挑', () => {
      let s = sudgerScene({ targetCharacter: pisces });
      s = ok(callMove(s, 'playShootSudger', ['p2', SHOOT], { rolls: [] }));
      const r = ok(callMove(s, 'respondShootPass', [], { currentPlayer: 'p2', rolls: [2, 5] }));
      expect(r.pendingShootResponse).toBeNull();
      expect(r.pendingSudgerRolls).toMatchObject({
        rollA: 2,
        rollB: 5,
        targetPlayerID: 'p2',
        cardId: SHOOT,
      });
      // 还没选骰，目标原地不动
      expect(r.players.p2!.currentLayer).toBe(2);
    });

    it('双鱼闪避：不掷骰，射手的牌被弃', () => {
      let s = sudgerScene({ targetCharacter: pisces });
      s = ok(callMove(s, 'playShootSudger', ['p2', SHOOT], { rolls: [] }));
      const r = ok(callMove(s, 'respondShootEvade', [], { currentPlayer: 'p2' }));
      expect(r.pendingShootResponse).toBeNull();
      expect(r.pendingSudgerRolls ?? null).toBeNull();
      expect(r.players.p2!.currentLayer).toBe(1);
      expect(r.players.p1!.hand).not.toContain(SHOOT);
    });
  });
});

describe('哈雷·冲击 与普通 SHOOT 共用结算', () => {
  const haleyScene = (o: Partial<SceneOptions> = {}): SetupState =>
    scene({ shooterCharacter: 'thief_haley' as CardID, ...o });

  describe('命中「移动」', () => {
    it.each([2, 3] as const)('目标在第 %i 层：挂起选层，没有实体牌', (layer) => {
      // 原始点数 6，-2 后为 4，落在移动骰面 [2,3,4]
      let s = haleyScene({ targetLayer: layer });
      s = ok(callMove(s, 'playHaleyImpact', ['p2'], { rolls: [6] }));
      expect(s.pendingShootMove).toMatchObject({
        shooterID: 'p1',
        targetPlayerID: 'p2',
        cardId: null,
        choices: layer === 2 ? [1, 3] : [2, 4],
      });
      expect(s.players.p2!.currentLayer).toBe(layer);

      const choice = layer === 2 ? 3 : 2;
      const moved = ok(callMove(s, 'resolveShootMove', [choice]));
      expect(moved.pendingShootMove ?? null).toBeNull();
      expect(moved.players.p2!.currentLayer).toBe(choice);
    });

    it('目标在第 1 层：自动移到第 2 层', () => {
      let s = haleyScene({ targetLayer: 1 as Layer });
      s = ok(callMove(s, 'playHaleyImpact', ['p2'], { rolls: [5] }));
      expect(s.pendingShootMove ?? null).toBeNull();
      expect(s.players.p2!.currentLayer).toBe(2);
    });
  });

  it('命中「击杀」触发白羊·星尘', () => {
    let s = withNightmare(withAries(haleyScene()), 2 as Layer);
    s = ok(callMove(s, 'playHaleyImpact', ['p2'], { rolls: [3] }));
    expect(s.players.p2!.isAlive).toBe(false);
    expect(s.pendingAriesChoice).toMatchObject({ ariesID: 'p3', victimID: 'p2', victimLayer: 2 });
  });

  it('原始点数写进 lastShootRoll，-2 且最低为 1', () => {
    let s = haleyScene();
    s = ok(callMove(s, 'playHaleyImpact', ['p2'], { rolls: [2] }));
    expect(s.lastShootRoll).toBe(2);
    // 2 - 2 = 0，取最低 1，击杀
    expect(s.players.p2!.isAlive).toBe(false);
  });

  it('-2 之后不可能是 6，不触发处女·完美', () => {
    let s = haleyScene();
    s = {
      ...s,
      players: {
        ...s.players,
        p3: { ...s.players.p3!, characterId: 'thief_virgo' as CardID },
      },
    };
    s = ok(callMove(s, 'playHaleyImpact', ['p2'], { rolls: [6] }));
    expect(s.pendingVirgoChoice).toBeNull();
  });

  it('没有实体牌：不弃牌、不走水星·逆流、不计入出牌记录', () => {
    let s = haleyScene({ shooterLayer: 2 as Layer });
    s = {
      ...s,
      deck: { cards: [], discardPile: ['action_kick' as CardID] },
      players: {
        ...s.players,
        p1: { ...s.players.p1!, bribeReceived: 1, hand: [SHOOT] },
        pM: {
          ...s.players.pM!,
          characterId: 'dm_mercury_route' as CardID,
          currentLayer: 2 as Layer,
        },
      },
    };
    s = place(s);
    // 原始 6 → 4：对梦主命中「移动」
    s = ok(callMove(s, 'playHaleyImpact', ['pM'], { rolls: [6] }));
    expect(s.players.p1!.hand).toEqual([SHOOT]);
    expect(s.players.pM!.hand).toEqual([]);
    expect(s.deck.discardPile).toEqual(['action_kick']);
    expect(s.playedCardsThisTurn).toEqual([]);
    expect(s.lastPlayedCardThisTurn).toBeNull();
  });

  it('不受层数限制，也没有死亡宣言入口', () => {
    let s = haleyScene({ shooterLayer: 1 as Layer, targetLayer: 4 as Layer });
    s = ok(callMove(s, 'playHaleyImpact', ['p2'], { rolls: [3] }));
    expect(s.players.p2!.isAlive).toBe(false);
  });

  describe('目标是可闪避的双鱼', () => {
    const pisces = 'thief_pisces' as CardID;

    it('先挂起应答窗口，闪避前不掷骰', () => {
      let s = haleyScene({ targetCharacter: pisces });
      s = ok(callMove(s, 'playHaleyImpact', ['p2'], { rolls: [] }));
      expect(s.pendingShootResponse).toMatchObject({
        shooterID: 'p1',
        targetPlayerID: 'p2',
        cardId: null,
        skill: 'haley_impact',
        sameLayerRequired: false,
        deathFaces: [1],
        moveFaces: [2, 3, 4],
      });
      expect(s.lastShootRoll).toBeNull();
      expect(s.players.p1!.skillUsedThisTurn[HALEY_SKILL_ID]).toBe(1);
    });

    it('放弃闪避后重入，-2 仍然生效', () => {
      let s = haleyScene({ targetCharacter: pisces });
      s = ok(callMove(s, 'playHaleyImpact', ['p2'], { rolls: [] }));
      // 原始 3，-2 后为 1：击杀（不扣的话 3 只是移动）
      const r = ok(callMove(s, 'respondShootPass', [], { currentPlayer: 'p2', rolls: [3] }));
      expect(r.pendingShootResponse).toBeNull();
      expect(r.players.p2!.isAlive).toBe(false);
      expect(r.lastShootRoll).toBe(3);
    });

    it('闪避：没有牌可弃，状态干净', () => {
      let s = haleyScene({ targetCharacter: pisces });
      s = { ...s, players: { ...s.players, p1: { ...s.players.p1!, hand: [SHOOT] } } };
      s = ok(callMove(s, 'playHaleyImpact', ['p2'], { rolls: [] }));
      const r = ok(callMove(s, 'respondShootEvade', [], { currentPlayer: 'p2' }));
      expect(r.pendingShootResponse).toBeNull();
      expect(r.players.p2!.currentLayer).toBe(1);
      expect(r.players.p1!.hand).toEqual([SHOOT]);
      expect(r.deck.discardPile).toEqual([]);
    });
  });

  describe('守卫', () => {
    it('不是自己的回合：拒绝', () => {
      const s = { ...haleyScene(), currentPlayerID: 'p2' };
      expect(callMove(s, 'playHaleyImpact', ['pM'], { currentPlayer: 'p1' })).toBe('INVALID_MOVE');
    });

    it.each(['draw', 'discard', 'turnStart'] as const)('行动阶段之外（%s）：拒绝', (phase) => {
      const s = { ...haleyScene(), turnPhase: phase };
      expect(callMove(s, 'playHaleyImpact', ['p2'])).toBe('INVALID_MOVE');
    });

    it('目标是自己或已死亡：拒绝', () => {
      const s = haleyScene();
      expect(callMove(s, 'playHaleyImpact', ['p1'])).toBe('INVALID_MOVE');
      const dead = {
        ...s,
        players: { ...s.players, p2: { ...s.players.p2!, isAlive: false } },
      };
      expect(callMove(dead, 'playHaleyImpact', ['p2'])).toBe('INVALID_MOVE');
    });
  });
});

describe('经对局运行器驱动：应答窗口与选层的行动权', () => {
  const game: GameDef<SetupState> = InceptionCityGame;

  function fixedRandom(values: number[]): RandomSource {
    const queue = [...values];
    const next = (): number => (queue.length > 0 ? queue.shift()! : 4);
    return { D6: next, Die: next, Shuffle: (arr) => arr };
  }

  function start(G: SetupState): MatchState<SetupState> {
    return matchFromSnapshot<SetupState>({
      G,
      ctx: {
        numPlayers: G.playerOrder.length,
        playOrder: G.playerOrder,
        playOrderPos: G.playerOrder.indexOf('p1'),
        currentPlayer: 'p1',
        phase: 'playing',
        turn: 3,
      },
      rngState: 1,
      stateID: 0,
    });
  }

  function step(
    state: MatchState<SetupState>,
    playerID: string,
    move: string,
    args: unknown[],
    rolls: number[] = [],
  ): MatchState<SetupState> {
    const res = applyMove(game, state, { playerID, move, args }, { random: fixedRandom(rolls) });
    expect(res.ok, `${move} 被拒绝：${res.ok ? '' : res.reason}`).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(checkStateInvariants(res.state.G)).toEqual([]);
    return res.state;
  }

  it('哈雷对双鱼：应答窗口只有双鱼能答，放弃后 -2 结算并挂起选层，选层只有哈雷能答', () => {
    const G = scene({
      shooterCharacter: 'thief_haley' as CardID,
      targetCharacter: 'thief_pisces' as CardID,
    });
    let m = step(start(G), 'p1', 'playHaleyImpact', ['p2']);
    expect(m.G.pendingShootResponse?.skill).toBe('haley_impact');

    // 射手不能替双鱼答
    const wrong = applyMove(game, m, { playerID: 'p1', move: 'respondShootPass', args: [] });
    expect(wrong.ok).toBe(false);

    // 原始 6，-2 后为 4：命中「移动」，双鱼在第 2 层，要选层
    m = step(m, 'p2', 'respondShootPass', [], [6]);
    expect(m.G.pendingShootMove).toMatchObject({ shooterID: 'p1', cardId: null, choices: [1, 3] });
    const intruder = applyMove(game, m, { playerID: 'p2', move: 'resolveShootMove', args: [3] });
    expect(intruder.ok).toBe(false);

    m = step(m, 'p1', 'resolveShootMove', [3]);
    expect(m.G.players.p2!.currentLayer).toBe(3);
    expect(m.G.pendingShootMove ?? null).toBeNull();
  });

  it('意念判官对双鱼：放弃闪避后掷两颗骰，选骰后命中移动再挂起选层', () => {
    const G = scene({
      shooterCharacter: 'thief_sudger_of_mind' as CardID,
      shooterHand: [SHOOT],
      targetCharacter: 'thief_pisces' as CardID,
    });
    let m = step(start(G), 'p1', 'playShootSudger', ['p2', SHOOT]);
    expect(m.G.pendingShootResponse?.skill).toBe('sudger_verdict');

    m = step(m, 'p2', 'respondShootPass', [], [2, 6]);
    expect(m.G.pendingSudgerRolls).toMatchObject({ rollA: 2, rollB: 6 });

    m = step(m, 'p1', 'resolveSudgerPick', ['A']);
    expect(m.G.pendingShootMove).toMatchObject({ shooterID: 'p1', cardId: SHOOT, choices: [1, 3] });

    m = step(m, 'p1', 'resolveShootMove', [1]);
    expect(m.G.players.p2!.currentLayer).toBe(1);
  });
});
