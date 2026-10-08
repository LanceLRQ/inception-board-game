// 技能面板里每个主动技能与真实引擎对账：
//   1. 界面推导出「可用」的技能，按界面规则拼的参数发过去，引擎必须接受；
//   2. 技能声明的次数键，必须是引擎成功发动后实际写入使用记录的键（回合记录或整局记录）；
//   3. 把使用记录写到上限：界面置灰并说明「已用完」，引擎也拒绝同样的参数。
// 局面从固定场景的真实对局出发，只改角色、手牌、所处层、牌库 / 弃牌堆这些，视图经引擎过滤。

import { describe, it, expect } from 'vitest';
import {
  InceptionCityGame,
  applyMove,
  movePlayerToLayer,
  viewMatch,
  type GameDef,
  type MatchState,
  type MatchView,
} from '@icgame/game-engine';
import type { PlayerSetup, SetupState } from '@icgame/game-engine/setup';
import type { CardID } from '@icgame/shared';
import { buildFixtureMatch } from '../../match/fixtures/buildScenario';
import { buildActiveSkillContext } from '../MatchRuntime/controllerDerive';
import {
  ACTIVE_SKILL_DESCRIPTORS,
  APOLLO_WORSHIP,
  ARCHITECT_MAZE,
  ATHENA_AWE,
  BLACK_HOLE_ABSORB,
  CHEMIST_INJECT,
  CHEMIST_REFINE,
  CHESS_TRANSPOSE,
  DARWIN_EVOLUTION,
  FORGER_EXCHANGE,
  GAIA_SHIFT,
  GEMINI_CHOICE,
  GEMINI_SYNC,
  HALEY_IMPACT,
  IMPERIAL_WORLD_SHOOT,
  LIBRA_BALANCE,
  LORD_OF_WAR_BLACK_MARKET,
  LUNA_ECLIPSE,
  MARS_BATTLEFIELD_EXCHANGE,
  MARS_KILL,
  MASTER_ACTIVATE_NIGHTMARE,
  MASTER_DISCARD_NIGHTMARE,
  PAPRIK_SALVATION,
  PLUTO_BURNING,
  SATURN_FREE_MOVE,
  SECRET_PASSAGE_TELEPORT,
  SPACE_QUEEN_STASH,
  URANUS_POWER,
  VENUS_DOUBLE,
  getSkillEntries,
  layerChoicesFor,
  pickableHandIndexes,
  skillUsage,
  targetIdsFor,
  type ActiveSkillDescriptor,
} from '../../lib/activeSkills';
import { activeSkillLostTargetIds, activeSkillTargetIds } from '../MatchRuntime/controllerDerive';

const game: GameDef<SetupState> = InceptionCityGame;
type S = MatchState<SetupState>;

const cards = (...ids: string[]): CardID[] => ids as CardID[];

// ---------------------------------------------------------------------------
// 局面工具
// ---------------------------------------------------------------------------

function editG(state: S, fn: (G: SetupState) => SetupState): S {
  return { ...state, G: fn(state.G) };
}

function patchPlayer(state: S, seat: string, patch: Partial<PlayerSetup>): S {
  return editG(state, (G) => ({
    ...G,
    players: { ...G.players, [seat]: { ...G.players[seat]!, ...patch } },
  }));
}

const setHand = (state: S, seat: string, hand: CardID[]): S => patchPlayer(state, seat, { hand });

const setCharacter = (state: S, seat: string, characterId: string): S =>
  patchPlayer(state, seat, { characterId: characterId as CardID });

const moveTo = (state: S, seat: string, layer: number): S =>
  editG(state, (G) => movePlayerToLayer(G, seat, layer));

const setPhase = (state: S, phase: SetupState['turnPhase']): S =>
  editG(state, (G) => ({ ...G, turnPhase: phase }));

const setDiscard = (state: S, discardPile: CardID[]): S =>
  editG(state, (G) => ({ ...G, deck: { ...G.deck, discardPile } }));

function setLayer(state: S, layer: number, patch: Partial<SetupState['layers'][number]>): S {
  return editG(state, (G) => ({
    ...G,
    layers: { ...G.layers, [layer]: { ...G.layers[layer]!, ...patch } },
  }));
}

function bumpUsage(state: S, seat: string, key: string, scope: 'turn' | 'game', n: number): S {
  const p = state.G.players[seat]!;
  return scope === 'turn'
    ? patchPlayer(state, seat, { skillUsedThisTurn: { ...p.skillUsedThisTurn, [key]: n } })
    : patchPlayer(state, seat, { skillUsedThisGame: { ...p.skillUsedThisGame, [key]: n } });
}

/** 盗梦者视角的固定场景：本人 + 其余盗梦者座位（第 0 个与本人同层） */
function thiefScene() {
  const { state, viewer } = buildFixtureMatch('thief');
  const others = state.G.playerOrder.filter((id) => id !== viewer && id !== state.G.dreamMasterID);
  return { state, me: viewer, others, master: state.G.dreamMasterID };
}

/** 梦主视角的固定场景 */
function masterScene() {
  const { state, viewer } = buildFixtureMatch('master');
  const thieves = state.G.playerOrder.filter((id) => id !== viewer);
  return { state, me: viewer, thieves };
}

function viewOf(state: S, seat: string): MatchView {
  return viewMatch(game, state, seat).G as MatchView;
}

function contextOf(state: S, seat: string) {
  const G = viewOf(state, seat);
  const hand = G.players[seat]!.hand ?? [];
  return buildActiveSkillContext({ G, seat, isMyTurn: G.currentPlayerID === seat, hand });
}

function entryOf(state: S, seat: string, skill: ActiveSkillDescriptor) {
  return getSkillEntries(contextOf(state, seat)).find((e) => e.skill === skill);
}

function apply(state: S, seat: string, move: string, args: unknown[]): S | null {
  const res = applyMove(game, state, { playerID: seat, move, args });
  return res.ok ? res.state : null;
}

// ---------------------------------------------------------------------------
// 场景表：每个技能一个可发动的局面和界面拼出的参数
// ---------------------------------------------------------------------------

interface Row {
  readonly name: string;
  readonly skill: ActiveSkillDescriptor;
  readonly build: () => { state: S; seat: string; args: unknown[] };
}

/** 盗梦者技能的通用起手：换角色、换手牌 */
function asThief(characterId: string, hand: CardID[]) {
  const scene = thiefScene();
  let state = setCharacter(scene.state, scene.me, characterId);
  state = setHand(state, scene.me, hand);
  return { ...scene, state };
}

/** 梦主技能的通用起手：换梦主角色、换手牌 */
function asMaster(characterId: string, hand: CardID[]) {
  const scene = masterScene();
  let state = setCharacter(scene.state, scene.me, characterId);
  state = setHand(state, scene.me, hand);
  return { ...scene, state };
}

const ROWS: Row[] = [
  {
    name: '阿波罗·崇拜',
    skill: APOLLO_WORSHIP,
    build: () => {
      const s = asThief('thief_apollo', cards('action_kick'));
      const target = s.others[1]!;
      const state = patchPlayer(s.state, target, { bribeReceived: 1 });
      return { state, seat: s.me, args: [target] };
    },
  },
  {
    name: '药剂师·调剂',
    skill: CHEMIST_REFINE,
    build: () => {
      const s = asThief('thief_chemist', cards('action_kick', 'action_unlock'));
      const state = setDiscard(s.state, cards('action_dream_transit'));
      return { state, seat: s.me, args: ['action_kick'] };
    },
  },
  {
    name: '药剂师·注射',
    skill: CHEMIST_INJECT,
    build: () => {
      const s = asThief('thief_chemist', cards('action_dream_transit', 'action_kick'));
      const mate = s.others[0]!;
      const [toLayer] = layerChoicesFor(
        CHEMIST_INJECT,
        contextOf(moveTo(s.state, mate, s.state.G.players[s.me]!.currentLayer), s.me),
        mate,
      );
      return {
        state: moveTo(s.state, mate, s.state.G.players[s.me]!.currentLayer),
        seat: s.me,
        args: [mate, toLayer],
      };
    },
  },
  {
    name: '双子·命运（弃牌阶段）',
    skill: GEMINI_SYNC,
    build: () => {
      const s = asThief('thief_gemini', cards('action_kick'));
      return { state: setPhase(s.state, 'discard'), seat: s.me, args: [] };
    },
  },
  {
    name: '双子·抉择（背面）',
    skill: GEMINI_CHOICE,
    build: () => {
      const s = asThief('thief_gemini_back', cards('action_kick'));
      // 梦主在第 3 层：本人移到第 4 层，梦主所在层数字更小
      return { state: moveTo(s.state, s.me, 4), seat: s.me, args: [] };
    },
  },
  {
    name: '灵魂牧师·拯救',
    skill: PAPRIK_SALVATION,
    build: () => {
      const s = asThief('thief_paprik', cards('action_kick', 'action_unlock'));
      const dead = s.others[2]!;
      const state = patchPlayer(moveTo(s.state, dead, 0), dead, { isAlive: false });
      return { state, seat: s.me, args: ['action_kick', dead] };
    },
  },
  {
    name: '筑梦师·迷宫',
    skill: ARCHITECT_MAZE,
    build: () => {
      const s = asThief('thief_architect', cards('action_shoot', 'action_kick'));
      const mate = s.others[0]!;
      return {
        state: moveTo(s.state, mate, s.state.G.players[s.me]!.currentLayer),
        seat: s.me,
        args: ['action_shoot', mate],
      };
    },
  },
  {
    name: '达尔文·进化',
    skill: DARWIN_EVOLUTION,
    build: () => {
      const s = asThief('thief_darwin', cards('action_kick', 'action_unlock', 'action_shoot'));
      return { state: s.state, seat: s.me, args: [cards('action_kick', 'action_unlock')] };
    },
  },
  {
    name: '哈雷·冲击',
    skill: HALEY_IMPACT,
    build: () => {
      const s = asThief('thief_haley', cards('action_kick'));
      const state = patchPlayer(s.state, s.me, { successfulUnlocksThisTurn: 1 });
      return { state, seat: s.me, args: [s.others[0]!] };
    },
  },
  {
    name: '露娜·月蚀',
    skill: LUNA_ECLIPSE,
    build: () => {
      const s = asThief('thief_luna', cards('action_shoot', 'action_shoot', 'action_kick'));
      const mate = s.others[0]!;
      return {
        state: moveTo(s.state, mate, s.state.G.players[s.me]!.currentLayer),
        seat: s.me,
        args: [cards('action_shoot', 'action_shoot'), mate],
      };
    },
  },
  {
    name: '雅典娜·惊叹',
    skill: ATHENA_AWE,
    build: () => {
      const s = asThief(
        'thief_athena',
        cards('action_kick', 'action_unlock', 'action_shoot', 'action_graft'),
      );
      const mate = s.others[0]!;
      return {
        state: moveTo(s.state, mate, s.state.G.players[s.me]!.currentLayer),
        seat: s.me,
        args: [cards('action_kick', 'action_unlock', 'action_shoot', 'action_graft'), mate],
      };
    },
  },
  {
    name: '欺诈师·盗心',
    skill: FORGER_EXCHANGE,
    build: () => {
      const s = asThief('thief_forger', cards('action_kick'));
      return { state: s.state, seat: s.me, args: [s.others[0]!, 'action_kick'] };
    },
  },
  {
    name: '天秤·平衡',
    skill: LIBRA_BALANCE,
    build: () => {
      const s = asThief('thief_libra', cards('action_kick'));
      return { state: s.state, seat: s.me, args: [s.others[0]!] };
    },
  },
  {
    name: '战争之王·黑市',
    skill: LORD_OF_WAR_BLACK_MARKET,
    build: () => {
      const s = asThief('thief_lord_of_war', cards('action_kick', 'action_unlock'));
      const state = setDiscard(s.state, cards('action_shoot'));
      return {
        state,
        seat: s.me,
        args: [cards('action_kick', 'action_unlock'), 'action_shoot'],
      };
    },
  },
  {
    name: '盖亚·大地',
    skill: GAIA_SHIFT,
    build: () => {
      const s = asThief('thief_gaia', cards('action_kick'));
      const mate = s.others[0]!;
      return {
        state: moveTo(s.state, mate, s.state.G.players[s.me]!.currentLayer),
        seat: s.me,
        args: [{ [mate]: 1 }],
      };
    },
  },
  {
    name: '空间女王·造物（弃牌阶段）',
    skill: SPACE_QUEEN_STASH,
    build: () => {
      const s = asThief('thief_space_queen', cards('action_kick', 'action_unlock'));
      return { state: setPhase(s.state, 'discard'), seat: s.me, args: ['action_kick'] };
    },
  },
  {
    name: '黑洞·吸纳',
    skill: BLACK_HOLE_ABSORB,
    build: () => {
      const s = asThief('thief_black_hole', cards('action_kick'));
      const [layer] = layerChoicesFor(
        BLACK_HOLE_ABSORB,
        contextOf(setCharacter(s.state, s.me, 'thief_black_hole'), s.me),
      );
      return { state: s.state, seat: s.me, args: [layer] };
    },
  },
  {
    name: '土星·领地：免费移动',
    skill: SATURN_FREE_MOVE,
    build: () => {
      const s = asThief('thief_aries', cards('action_kick'));
      let state = setCharacter(s.state, s.master, 'dm_saturn_territory');
      state = patchPlayer(state, s.me, { bribeReceived: 1 });
      return { state, seat: s.me, args: [s.state.G.players[s.me]!.currentLayer + 1] };
    },
  },
  {
    name: '皇城·世界观：视为 SHOOT',
    skill: IMPERIAL_WORLD_SHOOT,
    build: () => {
      const s = asThief('thief_aries', cards('action_kick'));
      let state = setCharacter(s.state, s.master, 'dm_imperial_city');
      state = patchPlayer(state, s.me, { bribeReceived: 1, imperialShootCharges: 1 });
      return { state, seat: s.me, args: [s.others[1]!] };
    },
  },
  {
    name: '火星·战场：世界观交换',
    skill: MARS_BATTLEFIELD_EXCHANGE,
    build: () => {
      const s = asThief('thief_aries', cards('action_kick', 'action_unlock', 'action_shoot'));
      let state = setCharacter(s.state, s.master, 'dm_mars_battlefield');
      state = setDiscard(state, cards('action_shoot'));
      return { state, seat: s.me, args: ['action_kick', 'action_unlock', 'action_shoot'] };
    },
  },
  {
    name: '天王星·权力',
    skill: URANUS_POWER,
    build: () => {
      const s = asMaster('dm_uranus_firmament', cards('action_kick'));
      const target = s.thieves[0]!;
      const from = s.state.G.players[target]!.currentLayer;
      return { state: s.state, seat: s.me, args: [target, from === 1 ? 2 : 1] };
    },
  },
  {
    name: '密道·传送',
    skill: SECRET_PASSAGE_TELEPORT,
    build: () => {
      const s = asMaster('dm_secret_passage', cards('action_dream_transit', 'action_kick'));
      return { state: s.state, seat: s.me, args: [s.thieves[0]!, 'action_dream_transit'] };
    },
  },
  {
    name: '火星·杀戮',
    skill: MARS_KILL,
    build: () => {
      const s = asMaster('dm_mars_battlefield', cards('action_unlock', 'action_kick'));
      const layer = Object.values(s.state.G.layers).find(
        (l) => l.nightmareId && l.nightmareId !== 'nightmare_echo',
      )!.layer;
      return { state: s.state, seat: s.me, args: [layer] };
    },
  },
  {
    name: '冥王星·业火',
    skill: PLUTO_BURNING,
    build: () => {
      const s = asMaster('dm_pluto_hell', cards('action_kick'));
      const state = setHand(s.state, s.thieves[0]!, []);
      return { state, seat: s.me, args: ['action_kick'] };
    },
  },
  {
    name: '金星·重影',
    skill: VENUS_DOUBLE,
    build: () => {
      const s = asMaster('dm_venus_mirror', cards('action_kick', 'action_unlock'));
      return { state: s.state, seat: s.me, args: [cards('action_kick')] };
    },
  },
  {
    name: '棋局·易位',
    skill: CHESS_TRANSPOSE,
    build: () => {
      const s = asMaster('dm_chess', cards('action_kick'));
      return { state: s.state, seat: s.me, args: [0, 1] };
    },
  },
  {
    name: '梦魇：弃掉已翻开的梦魇',
    skill: MASTER_DISCARD_NIGHTMARE,
    build: () => {
      const s = asMaster('dm_neptune_ocean', cards('action_kick'));
      const state = setLayer(s.state, 2, {
        nightmareId: 'nightmare_vortex' as CardID,
        nightmareRevealed: true,
      });
      return { state, seat: s.me, args: [2] };
    },
  },
  {
    name: '梦魇：发动已翻开的梦魇',
    skill: MASTER_ACTIVATE_NIGHTMARE,
    build: () => {
      const s = asMaster('dm_neptune_ocean', cards('action_kick'));
      const state = setLayer(s.state, 2, {
        nightmareId: 'nightmare_despair_storm' as CardID,
        nightmareRevealed: true,
      });
      return { state, seat: s.me, args: [2] };
    },
  },
];

describe('技能面板与真实引擎对账', () => {
  for (const row of ROWS) {
    describe(row.name, () => {
      it('界面标为可用，按界面拼的参数引擎接受', () => {
        const { state, seat, args } = row.build();
        const entry = entryOf(state, seat, row.skill);
        expect(entry, '界面应列出该技能').toBeDefined();
        expect(entry!.reason).toBeNull();
        expect(entry!.enabled).toBe(true);
        expect(apply(state, seat, row.skill.move, args)).not.toBeNull();
      });

      it('次数键是引擎实际写入的键；写到上限后界面置灰、引擎也拒绝', () => {
        const { state, seat, args } = row.build();
        const usage = skillUsage(row.skill, contextOf(state, seat));
        if (!usage) return;
        const scope = row.skill.usage!.scope ?? 'turn';
        const key = row.skill.usage!.key;

        const after = apply(state, seat, row.skill.move, args)!;
        const record =
          scope === 'turn'
            ? after.G.players[seat]!.skillUsedThisTurn
            : after.G.players[seat]!.skillUsedThisGame;
        expect(record[key] ?? 0, `引擎应在 ${key} 下记一次`).toBeGreaterThanOrEqual(1);

        const exhausted = bumpUsage(state, seat, key, scope, usage.limit);
        const entry = entryOf(exhausted, seat, row.skill)!;
        expect(entry.enabled).toBe(false);
        expect(entry.reason?.key).toBe(
          scope === 'game' ? 'skill.reason.usedUpGame' : 'skill.reason.usedUp',
        );
        expect(apply(exhausted, seat, row.skill.move, args), '次数用完后引擎应拒绝').toBeNull();
      });
    });
  }

  it('描述符里声明了次数键的技能都在场景表里对账过', () => {
    const covered = new Set(ROWS.map((r) => r.skill));
    const missing = ACTIVE_SKILL_DESCRIPTORS.filter((d) => d.usage && !covered.has(d));
    expect(missing.map((d) => d.id)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 目标 / 层 / 手牌的筛选：界面只列引擎会接受的
// ---------------------------------------------------------------------------

describe('可选目标与层', () => {
  it('阿波罗·崇拜：只列收到过贿赂牌、手里有牌的存活盗梦者', () => {
    const s = asThief('thief_apollo', cards('action_kick'));
    const withBribe = s.others[1]!;
    const ctx = contextOf(patchPlayer(s.state, withBribe, { bribeReceived: 1 }), s.me);
    const ids = targetIdsFor(
      APOLLO_WORSHIP,
      ctx,
      activeSkillTargetIds(viewOf(s.state, s.me).players, s.me),
      [],
    );
    expect(ids).toEqual([withBribe]);
  });

  it('阿波罗·崇拜：没有这样的人时整个技能置灰并说明', () => {
    const s = asThief('thief_apollo', cards('action_kick'));
    const entry = entryOf(s.state, s.me, APOLLO_WORSHIP)!;
    expect(entry.enabled).toBe(false);
    expect(entry.reason?.key).toBe('skill.reason.noTarget');
  });

  it('筑梦师·迷宫：目标只列同层存活玩家，牌只能选 SHOOT 类', () => {
    const s = asThief('thief_architect', cards('action_kick', 'action_shoot', 'action_unlock'));
    const mate = s.others[0]!;
    const state = moveTo(s.state, mate, s.state.G.players[s.me]!.currentLayer);
    const ctx = contextOf(state, s.me);
    expect(targetIdsFor(ARCHITECT_MAZE, ctx, [], [])).toEqual([mate]);
    expect(pickableHandIndexes(ARCHITECT_MAZE, ctx).map((i) => ctx.hand[i])).toEqual([
      'action_shoot',
    ]);
  });

  it('筑梦师·迷宫：手里没有 SHOOT 类牌时置灰，引擎也拒绝', () => {
    const s = asThief('thief_architect', cards('action_kick', 'action_unlock'));
    const mate = s.others[0]!;
    const state = moveTo(s.state, mate, s.state.G.players[s.me]!.currentLayer);
    expect(entryOf(state, s.me, ARCHITECT_MAZE)!.reason?.key).toBe('skill.reason.noShootCard');
    expect(apply(state, s.me, 'playArchitectMaze', ['action_kick', mate])).toBeNull();
  });

  it('密道·传送：只有密道梦主有这个技能，牌只能选梦境穿梭剂', () => {
    const s = asMaster('dm_secret_passage', cards('action_dream_transit', 'action_kick'));
    const ctx = contextOf(s.state, s.me);
    expect(pickableHandIndexes(SECRET_PASSAGE_TELEPORT, ctx).map((i) => ctx.hand[i])).toEqual([
      'action_dream_transit',
    ]);
    // 非密道梦主：没有这个技能
    const other = asMaster('dm_neptune_ocean', cards('action_dream_transit'));
    expect(entryOf(other.state, other.me, SECRET_PASSAGE_TELEPORT)).toBeUndefined();
    // 引擎对其他牌也拒绝
    expect(
      apply(s.state, s.me, 'playSecretPassageTeleport', [s.thieves[0], 'action_kick']),
    ).toBeNull();
  });

  it('密道·传送：手里没有梦境穿梭剂时置灰', () => {
    const s = asMaster('dm_secret_passage', cards('action_kick'));
    expect(entryOf(s.state, s.me, SECRET_PASSAGE_TELEPORT)!.reason?.key).toBe(
      'skill.reason.noTransitInHand',
    );
  });

  it('土星·领地：只有梦主是土星且本人持贿赂才有；层只列相邻层', () => {
    const s = asThief('thief_aries', cards('action_kick'));
    const plain = patchPlayer(s.state, s.me, { bribeReceived: 1 });
    expect(entryOf(plain, s.me, SATURN_FREE_MOVE), '梦主不是土星').toBeUndefined();
    const saturn = setCharacter(plain, s.master, 'dm_saturn_territory');
    const ctx = contextOf(saturn, s.me);
    const layer = saturn.G.players[s.me]!.currentLayer;
    expect(layerChoicesFor(SATURN_FREE_MOVE, ctx)).toEqual(
      [layer - 1, layer + 1].filter((l) => l >= 1 && l <= 4),
    );
    // 引擎对非相邻层 / 无贿赂 / 非土星梦主都拒绝
    expect(apply(saturn, s.me, 'useSaturnFreeMove', [layer + 2])).toBeNull();
    expect(apply(plain, s.me, 'useSaturnFreeMove', [layer + 1])).toBeNull();
    expect(
      apply(setCharacter(s.state, s.master, 'dm_saturn_territory'), s.me, 'useSaturnFreeMove', [
        layer + 1,
      ]),
    ).toBeNull();
  });

  it('梦魇：弃掉 / 发动只列已翻开的梦魇所在层；回音萦绕缺参数，不列入发动', () => {
    const s = asMaster('dm_neptune_ocean', cards('action_kick'));
    expect(entryOf(s.state, s.me, MASTER_DISCARD_NIGHTMARE)!.reason?.key).toBe(
      'skill.reason.noRevealedNightmare',
    );
    let state = setLayer(s.state, 2, {
      nightmareId: 'nightmare_vortex' as CardID,
      nightmareRevealed: true,
    });
    state = setLayer(state, 3, {
      nightmareId: 'nightmare_echo' as CardID,
      nightmareRevealed: true,
    });
    const ctx = contextOf(state, s.me);
    expect(layerChoicesFor(MASTER_DISCARD_NIGHTMARE, ctx)).toEqual([2, 3]);
    expect(layerChoicesFor(MASTER_ACTIVATE_NIGHTMARE, ctx)).toEqual([2]);
    // 引擎：回音萦绕不带参数发动被拒，弃掉被接受
    expect(apply(state, s.me, 'masterActivateNightmare', [3])).toBeNull();
    expect(apply(state, s.me, 'masterDiscardNightmare', [3])).not.toBeNull();
    // 没翻开的层引擎拒绝
    expect(apply(state, s.me, 'masterDiscardNightmare', [1])).toBeNull();
  });

  it('火星·杀戮：需要手里有【解封】，层只列还有梦魇的（回音萦绕除外）', () => {
    const noUnlock = asMaster('dm_mars_battlefield', cards('action_kick'));
    expect(entryOf(noUnlock.state, noUnlock.me, MARS_KILL)!.reason?.key).toBe(
      'skill.reason.noUnlockCard',
    );
    const s = asMaster('dm_mars_battlefield', cards('action_unlock'));
    const withNightmares = [1, 2, 3, 4].filter(
      (l) =>
        s.state.G.layers[l]!.nightmareId && s.state.G.layers[l]!.nightmareId !== 'nightmare_echo',
    );
    expect(layerChoicesFor(MARS_KILL, contextOf(s.state, s.me))).toEqual(withNightmares);
  });

  it('天王星·权力：层不含目标当前所在层；没有未派发的贿赂牌时一次也不能发动', () => {
    const s = asMaster('dm_uranus_firmament', cards('action_kick'));
    const target = s.thieves[0]!;
    const from = s.state.G.players[target]!.currentLayer;
    const ctx = contextOf(s.state, s.me);
    expect(layerChoicesFor(URANUS_POWER, ctx, target)).toEqual(
      [1, 2, 3, 4].filter((l) => l !== from),
    );
    expect(apply(s.state, s.me, 'useUranusPower', [target, from])).toBeNull();
    // 贿赂牌全部派出
    const dealt = editG(s.state, (G) => ({
      ...G,
      bribePool: G.bribePool.map((b) => ({
        ...b,
        status: 'dealt' as const,
        heldBy: s.thieves[1]!,
      })),
    }));
    expect(entryOf(dealt, s.me, URANUS_POWER)!.enabled).toBe(false);
    expect(apply(dealt, s.me, 'useUranusPower', [target, from === 1 ? 2 : 1])).toBeNull();
  });

  it('黑洞·吸纳：只列有存活玩家的相邻层', () => {
    const s = asThief('thief_black_hole', cards('action_kick'));
    const myLayer = s.state.G.players[s.me]!.currentLayer;
    const ctx = contextOf(s.state, s.me);
    const choices = layerChoicesFor(BLACK_HOLE_ABSORB, ctx);
    for (const layer of choices) {
      expect(Math.abs(layer - myLayer)).toBe(1);
      expect(s.state.G.layers[layer]!.playersInLayer.length).toBeGreaterThan(0);
    }
    // 引擎拒绝没有人的相邻层与非相邻层
    const empty = [1, 2, 3, 4].find(
      (l) => Math.abs(l - myLayer) === 1 && s.state.G.layers[l]!.playersInLayer.length === 0,
    );
    if (empty !== undefined) {
      expect(apply(s.state, s.me, 'useBlackHoleAbsorb', [empty])).toBeNull();
    }
    expect(apply(s.state, s.me, 'useBlackHoleAbsorb', [myLayer])).toBeNull();
  });

  it('药剂师·注射：目标是同层玩家，层是目标所在层的相邻层；没有穿梭剂时置灰', () => {
    const s = asThief('thief_chemist', cards('action_kick'));
    expect(entryOf(s.state, s.me, CHEMIST_INJECT)!.reason?.key).toBe(
      'skill.reason.noTransitInHand',
    );
    expect(apply(s.state, s.me, 'playChemistInject', [s.others[0], 1])).toBeNull();
  });

  it('露娜·月蚀：只能选基础 SHOOT，需要两张；目标只列同层', () => {
    const s = asThief('thief_luna', cards('action_shoot', 'action_kick', 'action_unlock'));
    expect(entryOf(s.state, s.me, LUNA_ECLIPSE)!.reason?.key).toBe('skill.reason.needTwoShoot');
    const ok = asThief('thief_luna', cards('action_shoot', 'action_shoot', 'action_kick'));
    const ctx = contextOf(ok.state, ok.me);
    expect(pickableHandIndexes(LUNA_ECLIPSE, ctx)).toEqual([0, 1]);
    expect(LUNA_ECLIPSE.pickCount).toBe(2);
  });

  it('灵魂牧师·拯救：目标是迷失层的玩家', () => {
    const s = asThief('thief_paprik', cards('action_kick'));
    const dead = s.others[2]!;
    const state = patchPlayer(moveTo(s.state, dead, 0), dead, { isAlive: false });
    const view = viewOf(state, s.me);
    const ctx = contextOf(state, s.me);
    expect(
      targetIdsFor(
        PAPRIK_SALVATION,
        ctx,
        activeSkillTargetIds(view.players, s.me),
        activeSkillLostTargetIds(view.players, s.me),
      ),
    ).toEqual([dead]);
  });

  it('皇城·世界观：只有梦主是皇城且本人有机会才有；目标是没收到过贿赂牌的盗梦者', () => {
    const s = asThief('thief_aries', cards('action_kick'));
    const withCharge = patchPlayer(s.state, s.me, { bribeReceived: 1, imperialShootCharges: 1 });
    expect(entryOf(withCharge, s.me, IMPERIAL_WORLD_SHOOT)).toBeUndefined();
    const imperial = setCharacter(withCharge, s.master, 'dm_imperial_city');
    const withBribe = patchPlayer(imperial, s.others[0]!, { bribeReceived: 1 });
    const ctx = contextOf(withBribe, s.me);
    const ids = targetIdsFor(IMPERIAL_WORLD_SHOOT, ctx, [], []);
    expect(ids).not.toContain(s.others[0]);
    expect(ids).not.toContain(s.master);
    expect(ids).toContain(s.others[1]);
    // 引擎对收到过贿赂牌的人 / 梦主拒绝
    expect(apply(withBribe, s.me, 'useImperialCityWorldShoot', [s.others[0]!])).toBeNull();
    expect(apply(withBribe, s.me, 'useImperialCityWorldShoot', [s.master])).toBeNull();
    // 机会用完：入口消失
    const none = patchPlayer(imperial, s.me, { bribeReceived: 1, imperialShootCharges: 0 });
    expect(entryOf(none, s.me, IMPERIAL_WORLD_SHOOT)).toBeUndefined();
  });

  it('冥王星·业火：没有手牌不足 2 张的存活盗梦者时置灰，引擎也拒绝', () => {
    const s = asMaster('dm_pluto_hell', cards('action_kick'));
    let state = s.state;
    for (const t of s.thieves) state = setHand(state, t, cards('action_kick', 'action_unlock'));
    expect(entryOf(state, s.me, PLUTO_BURNING)!.reason?.key).toBe('skill.reason.noPlutoTarget');
    expect(apply(state, s.me, 'usePlutoBurning', ['action_kick'])).toBeNull();
  });

  it('空间女王·造物：只在弃牌阶段显示', () => {
    const s = asThief('thief_space_queen', cards('action_kick'));
    expect(entryOf(s.state, s.me, SPACE_QUEEN_STASH)).toBeUndefined();
    expect(entryOf(setPhase(s.state, 'discard'), s.me, SPACE_QUEEN_STASH)?.enabled).toBe(true);
  });

  it('双子·命运：本回合解封次数已用尽时置灰（减少心锁算一次解封），引擎也拒绝', () => {
    const s = asThief('thief_gemini', cards('action_kick'));
    const state = patchPlayer(setPhase(s.state, 'discard'), s.me, { successfulUnlocksThisTurn: 1 });
    expect(entryOf(state, s.me, GEMINI_SYNC)!.reason?.key).toBe('skill.reason.unlockLimit');
    expect(apply(state, s.me, 'playGeminiSync', [])).toBeNull();
  });

  it('双子·抉择：只有翻到背面才有；正面不显示', () => {
    const s = asThief('thief_gemini', cards('action_kick'));
    const state = moveTo(s.state, s.me, 4);
    expect(entryOf(state, s.me, GEMINI_CHOICE)).toBeUndefined();
    expect(apply(state, s.me, 'playGeminiChoice', [])).toBeNull();
  });
});

describe('技能上下文只含按座位裁剪的视图里有的信息', () => {
  it('盗梦者的上下文里看不到梦魇是什么，也没有他人的手牌内容', () => {
    const s = thiefScene();
    const ctx = contextOf(s.state, s.me);
    expect(Object.values(ctx.layers ?? {}).every((l) => l.nightmareId === null)).toBe(true);
    for (const [id, p] of Object.entries(ctx.players ?? {})) {
      expect(Object.keys(p).sort(), id).toEqual(
        ['bribeReceived', 'currentLayer', 'handCount', 'isAlive'].sort(),
      );
    }
    expect(ctx.seat).toBe(s.me);
    expect(ctx.isDreamMaster).toBe(false);
  });

  it('梦主的上下文里能看到各层梦魇', () => {
    const s = masterScene();
    const ctx = contextOf(s.state, s.me);
    expect(Object.values(ctx.layers ?? {}).every((l) => l.nightmareId !== null)).toBe(true);
    expect(ctx.isDreamMaster).toBe(true);
    expect(ctx.masterCharacterId).toBe(s.state.G.players[s.me]!.characterId);
  });

  it('梦主角色对所有人公开：盗梦者的上下文里也有', () => {
    const s = thiefScene();
    const ctx = contextOf(setCharacter(s.state, s.master, 'dm_saturn_territory'), s.me);
    expect(ctx.masterCharacterId).toBe('dm_saturn_territory');
  });
});
