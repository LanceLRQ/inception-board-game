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
  AQUARIUS_COHERENCE,
  ARIES_GLOW,
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
  GREEN_RAY_ARREST,
  HALEY_IMPACT,
  IMPERIAL_WORLD_SHOOT,
  LIBRA_BALANCE,
  LORD_OF_WAR_BLACK_MARKET,
  LUNA_ECLIPSE,
  LUNA_FULL_MOON,
  MARS_BATTLEFIELD_EXCHANGE,
  MARS_KILL,
  MASTER_ACTIVATE_NIGHTMARE,
  MASTER_DISCARD_NIGHTMARE,
  PAPRIK_SALVATION,
  PISCES_BLESSING,
  PLUTO_BURNING,
  SAGITTARIUS_HEART_LOCK,
  SATURN_FREE_MOVE,
  SECRET_PASSAGE_TELEPORT,
  SPACE_QUEEN_STASH,
  URANUS_POWER,
  VENUS_DOUBLE,
  VENUS_MIRROR_COPY,
  EMPTY_PICKS,
  getSkillEntries,
  layerChoicesFor,
  pickableHandIndexes,
  skillUsage,
  targetIdsFor,
  type ActiveSkillDescriptor,
} from '../../lib/activeSkills';
import { activeSkillLostTargetIds, activeSkillTargetIds } from '../MatchRuntime/controllerDerive';
import {
  buildStepArgs,
  choicesFor,
  handChoicesFor,
  layerStepChoices,
  nightmareKindAt,
  playerChoicesFor,
  discardChoicesFor,
} from '../../lib/skillSteps';
import {
  EMPTY_NIGHTMARE_DRAFT,
  nightmareParamsOf,
  type NightmareParamDraft,
} from '../../lib/nightmareParams';

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
    name: '盖亚·撼动',
    skill: GAIA_SHIFT,
    build: () => {
      const s = asThief('thief_gaia', cards('action_kick'));
      const mate = s.others[0]!;
      const state = moveTo(s.state, mate, s.state.G.players[s.me]!.currentLayer);
      const args = buildStepArgs(GAIA_SHIFT, contextOf(state, s.me), {
        ...EMPTY_PICKS,
        choice: 'increase',
      })!;
      return { state, seat: s.me, args };
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
    name: '露娜·满月（背面）',
    skill: LUNA_FULL_MOON,
    build: () => {
      const s = asThief('thief_luna_back', cards('action_kick', 'action_unlock', 'action_shoot'));
      const dead = s.others[2]!;
      const state = patchPlayer(moveTo(s.state, dead, 0), dead, { isAlive: false });
      const ctx = contextOf(state, s.me);
      // 界面：手牌里只有非 SHOOT 牌（位置 0、1）能选，复活对象从迷失层的玩家里点名
      const args = buildStepArgs(LUNA_FULL_MOON, ctx, {
        ...EMPTY_PICKS,
        cards: handChoicesFor(LUNA_FULL_MOON, ctx),
        players: [dead],
      })!;
      return { state, seat: s.me, args };
    },
  },
  {
    name: '双鱼·洗礼（背面）',
    skill: PISCES_BLESSING,
    build: () => {
      const s = asThief('thief_pisces_back', cards('action_kick'));
      const dead = s.others[2]!;
      const state = patchPlayer(moveTo(s.state, dead, 0), dead, { isAlive: false });
      const args = buildStepArgs(PISCES_BLESSING, contextOf(state, s.me), {
        ...EMPTY_PICKS,
        players: [dead],
      })!;
      return { state, seat: s.me, args };
    },
  },
  {
    name: '白羊·闪耀（抽牌阶段）',
    skill: ARIES_GLOW,
    build: () => {
      const s = asThief('thief_aries', cards('action_kick'));
      let state = setPhase(s.state, 'draw');
      state = editG(state, (G) => ({
        ...G,
        usedNightmareIds: cards('nightmare_echo', 'nightmare_plague'),
      }));
      const args = buildStepArgs(ARIES_GLOW, contextOf(state, s.me), {
        ...EMPTY_PICKS,
        choice: '1',
      })!;
      return { state, seat: s.me, args };
    },
  },
  {
    name: '格林射线·缉捕',
    skill: GREEN_RAY_ARREST,
    build: () => {
      const s = asThief('thief_green_ray', cards('action_dream_transit', 'action_shoot'));
      const target = s.others[2]!;
      const layer = s.state.G.players[target]!.currentLayer;
      const ctx = contextOf(s.state, s.me);
      const args = buildStepArgs(GREEN_RAY_ARREST, ctx, {
        ...EMPTY_PICKS,
        cards: [1],
        layer,
        players: [target],
      })!;
      return { state: s.state, seat: s.me, args };
    },
  },
  {
    name: '水瓶·凝聚',
    skill: AQUARIUS_COHERENCE,
    build: () => {
      const s = asThief('thief_aquarius', cards('action_kick'));
      let state = setDiscard(s.state, cards('action_kick', 'action_unlock'));
      state = editG(state, (G) => ({
        ...G,
        playedCardsThisTurn: cards('action_kick', 'action_kick'),
      }));
      const args = buildStepArgs(AQUARIUS_COHERENCE, contextOf(state, s.me), {
        ...EMPTY_PICKS,
        discardCard: 'action_unlock',
      })!;
      return { state, seat: s.me, args };
    },
  },
  {
    name: '射手·穿心',
    skill: SAGITTARIUS_HEART_LOCK,
    build: () => {
      const s = asThief('thief_sagittarius', cards('action_kick'));
      const layer = s.state.G.players[s.me]!.currentLayer;
      const state = patchPlayer(s.state, s.me, {
        skillUsedThisTurn: { 'thief_sagittarius.kills': 1 },
      });
      const args = buildStepArgs(SAGITTARIUS_HEART_LOCK, contextOf(state, s.me), {
        ...EMPTY_PICKS,
        choice: 'decrease',
        layer,
      })!;
      return { state, seat: s.me, args };
    },
  },
  {
    name: '金星·镜界：复制',
    skill: VENUS_MIRROR_COPY,
    build: () => {
      const s = asThief('thief_aries', cards('action_kick', 'action_unlock'));
      let state = setCharacter(s.state, s.master, 'dm_venus_mirror');
      state = editG(state, (G) => ({ ...G, playedCardsThisTurn: cards('action_kick') }));
      const args = buildStepArgs(VENUS_MIRROR_COPY, contextOf(state, s.me), {
        ...EMPTY_PICKS,
        players: [s.others[0]!],
        cards: [0, 1],
      })!;
      return { state, seat: s.me, args };
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

  it('梦魇：弃掉 / 发动都列已翻开的梦魇所在层；回音萦绕不带参数发动被引擎拒绝，带参数则接受', () => {
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
    expect(layerChoicesFor(MASTER_ACTIVATE_NIGHTMARE, ctx)).toEqual([2, 3]);
    // 第 3 层的回音萦绕要附加参数，第 2 层的致命漩涡不要
    expect(nightmareKindAt(ctx, 3)).toBe('echo');
    expect(nightmareKindAt(ctx, 2)).toBe('none');
    // 引擎：回音萦绕不带参数发动被拒，弃掉被接受
    expect(apply(state, s.me, 'masterActivateNightmare', [3])).toBeNull();
    expect(apply(state, s.me, 'masterDiscardNightmare', [3])).not.toBeNull();
    // 没翻开的层引擎拒绝
    expect(apply(state, s.me, 'masterDiscardNightmare', [1])).toBeNull();
    // 界面按参数形态拼出的参数引擎接受，心锁按所选方式改变
    const echo: NightmareParamDraft = { ...EMPTY_NIGHTMARE_DRAFT, echoLayer: 1, echoAction: 'add' };
    const args = buildStepArgs(MASTER_ACTIVATE_NIGHTMARE, ctx, {
      ...EMPTY_PICKS,
      layer: 3,
      params: nightmareParamsOf('echo', echo)!,
    })!;
    expect(args).toEqual([3, { targetLayer: 1, action: 'add' }]);
    const after = apply(state, s.me, 'masterActivateNightmare', args)!;
    expect(after).not.toBeNull();
    expect(after.G.layers[1]!.heartLockValue).toBe(state.G.layers[1]!.heartLockValue + 1);
    // 参数没选完时拼不出参数
    expect(
      buildStepArgs(MASTER_ACTIVATE_NIGHTMARE, ctx, { ...EMPTY_PICKS, layer: 3 }, false),
    ).toBeNull();
  });

  it('梦魇：邪念瘟疫点名的盗梦者收到贿赂牌，没点名又没有贿赂牌的进迷失层', () => {
    const s = asMaster('dm_neptune_ocean', cards('action_kick'));
    const onLayer2 = s.thieves.filter((id) => s.state.G.players[id]!.currentLayer === 2);
    expect(onLayer2.length).toBeGreaterThanOrEqual(2);
    const state = setLayer(s.state, 2, {
      nightmareId: 'nightmare_plague' as CardID,
      nightmareRevealed: true,
    });
    const ctx = contextOf(state, s.me);
    expect(nightmareKindAt(ctx, 2)).toBe('plague');
    const [named, ...unnamed] = onLayer2;
    const args = buildStepArgs(MASTER_ACTIVATE_NIGHTMARE, ctx, {
      ...EMPTY_PICKS,
      layer: 2,
      params: nightmareParamsOf('plague', { ...EMPTY_NIGHTMARE_DRAFT, bribed: [named!] })!,
    })!;
    expect(args).toEqual([2, { bribedTargets: [named] }]);
    const after = apply(state, s.me, 'masterActivateNightmare', args)!;
    expect(after).not.toBeNull();
    expect(after.G.players[named!]!.bribeReceived).toBe(1);
    expect(after.G.players[named!]!.isAlive).toBe(true);
    for (const id of unnamed) expect(after.G.players[id]!.isAlive).toBe(false);
  });

  it('火星·杀戮：需要手里有【解封】，层列出所有还有梦魇的层（回音萦绕、邪念瘟疫发动时另选参数）', () => {
    const noUnlock = asMaster('dm_mars_battlefield', cards('action_kick'));
    expect(entryOf(noUnlock.state, noUnlock.me, MARS_KILL)!.reason?.key).toBe(
      'skill.reason.noUnlockCard',
    );
    const s = asMaster('dm_mars_battlefield', cards('action_unlock'));
    const withNightmares = [1, 2, 3, 4].filter((l) => s.state.G.layers[l]!.nightmareId);
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

  it('空间女王·造物：别人的弃牌阶段也显示，引擎以空间女王本人的名义接受；别的阶段 / 别的技能不显示', () => {
    const s = asThief('thief_space_queen', cards('action_kick', 'action_unlock'));
    const owner = s.others[0]!;
    const offTurn = (phase: SetupState['turnPhase']) =>
      editG(s.state, (G) => ({ ...G, currentPlayerID: owner, turnPhase: phase }));

    const discard = offTurn('discard');
    expect(contextOf(discard, s.me).isHumanTurn).toBe(false);
    expect(entryOf(discard, s.me, SPACE_QUEEN_STASH)).toMatchObject({
      enabled: true,
      reason: null,
    });
    const after = apply(discard, s.me, 'useSpaceQueenStashTop', ['action_kick']);
    expect(after).not.toBeNull();
    expect(after!.G.deck.cards[0]).toBe('action_kick');
    expect(after!.G.currentPlayerID).toBe(owner);
    // 不限次数：连着发动第二次，界面仍然可用，引擎也接受
    expect(entryOf(after!, s.me, SPACE_QUEEN_STASH)?.enabled).toBe(true);
    expect(apply(after!, s.me, 'useSpaceQueenStashTop', ['action_unlock'])).not.toBeNull();

    // 别人的出牌 / 抽牌阶段：界面不显示，引擎也拒绝
    for (const phase of ['action', 'draw'] as const) {
      const other = offTurn(phase);
      expect(entryOf(other, s.me, SPACE_QUEEN_STASH), phase).toBeUndefined();
      expect(apply(other, s.me, 'useSpaceQueenStashTop', ['action_kick']), phase).toBeNull();
    }
    // 别人回合里其他角色的主动技能一概不显示
    const chemist = setCharacter(discard, s.me, 'thief_chemist');
    expect(getSkillEntries(contextOf(chemist, s.me))).toEqual([]);
  });

  it('盖亚·撼动：同层其余玩家全部随方向移动，只选方向；第 1 层不能 -1、第 4 层不能 +1，引擎也拒绝', () => {
    const s = asThief('thief_gaia', cards('action_kick'));
    const [a, b] = s.others;
    let state = moveTo(moveTo(moveTo(s.state, s.me, 2), a!, 2), b!, 2);
    const ctx = contextOf(state, s.me);
    expect(choicesFor(GAIA_SHIFT, ctx).map((c) => [c.value, c.disabled])).toEqual([
      ['decrease', null],
      ['increase', null],
    ]);
    expect(buildStepArgs(GAIA_SHIFT, ctx, EMPTY_PICKS), '没选方向').toBeNull();
    const down = buildStepArgs(GAIA_SHIFT, ctx, { ...EMPTY_PICKS, choice: 'decrease' })!;
    expect(down).toEqual([-1]);
    const after = apply(state, s.me, 'playGaiaShift', down)!;
    expect(after).not.toBeNull();
    const here = state.G.layers[2]!.playersInLayer.filter((id) => id !== s.me);
    expect(here.length).toBeGreaterThanOrEqual(2);
    for (const id of here) expect(after.G.players[id]!.currentLayer).toBe(1);
    expect(after.G.players[s.me]!.currentLayer).toBe(2);

    // 第 1 层：-1 置灰并说明原因；引擎拒绝
    state = moveTo(moveTo(state, s.me, 1), a!, 1);
    const at1 = choicesFor(GAIA_SHIFT, contextOf(state, s.me));
    expect(at1.find((c) => c.value === 'decrease')!.disabled?.key).toBe(
      'skill.reason.gaiaBottomLayer',
    );
    expect(apply(state, s.me, 'playGaiaShift', [-1])).toBeNull();
    expect(apply(state, s.me, 'playGaiaShift', [1])).not.toBeNull();
    // 第 4 层：+1 置灰；引擎拒绝
    state = moveTo(moveTo(state, s.me, 4), a!, 4);
    const at4 = choicesFor(GAIA_SHIFT, contextOf(state, s.me));
    expect(at4.find((c) => c.value === 'increase')!.disabled?.key).toBe(
      'skill.reason.gaiaTopLayer',
    );
    expect(apply(state, s.me, 'playGaiaShift', [1])).toBeNull();
    expect(apply(state, s.me, 'playGaiaShift', [-1])).not.toBeNull();
  });

  it('白羊·闪耀：界面列出 0 到已弃梦魇数，每个选项引擎都接受；超出上限引擎拒绝；不带参数抽满', () => {
    const s = asThief('thief_aries', cards('action_kick'));
    const used = cards('nightmare_echo', 'nightmare_plague');
    let state = setPhase(s.state, 'draw');
    expect(entryOf(state, s.me, ARIES_GLOW), '没弃过梦魇不显示').toBeUndefined();
    state = editG(state, (G) => ({ ...G, usedNightmareIds: used }));
    const ctx = contextOf(state, s.me);
    const values = choicesFor(ARIES_GLOW, ctx).map((c) => c.value);
    expect(values).toEqual(['2', '1', '0']);
    const handAfter = (args: unknown[]) =>
      apply(state, s.me, 'doDraw', args)?.G.players[s.me]!.hand.length;
    const base = s.state.G.players[s.me]!.hand.length;
    for (const v of values) {
      const args = buildStepArgs(ARIES_GLOW, ctx, { ...EMPTY_PICKS, choice: v })!;
      expect(args).toEqual([Number(v)]);
      expect(handAfter(args), `多抽 ${v} 张`).toBe(base + 2 + Number(v));
    }
    expect(handAfter([]), '不带参数抽满').toBe(base + 2 + 2);
    expect(handAfter([3]), '超出上限').toBeUndefined();
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

describe('分步表单技能 · 界面可选项与引擎一致', () => {
  it('火星·杀戮：回音萦绕带参数发动被引擎接受，不带参数被拒', () => {
    const s = asMaster('dm_mars_battlefield', cards('action_unlock', 'action_kick'));
    const state = setLayer(s.state, 3, { nightmareId: 'nightmare_echo' as CardID });
    const ctx = contextOf(state, s.me);
    expect(nightmareKindAt(ctx, 3)).toBe('echo');
    expect(apply(state, s.me, 'useMarsKill', [3])).toBeNull();
    const args = buildStepArgs(MARS_KILL, ctx, {
      ...EMPTY_PICKS,
      layer: 3,
      params: nightmareParamsOf('echo', {
        ...EMPTY_NIGHTMARE_DRAFT,
        echoLayer: 2,
        echoAction: 'restore',
      })!,
    })!;
    expect(args).toEqual([3, { targetLayer: 2, action: 'restore' }]);
    expect(apply(state, s.me, 'useMarsKill', args)).not.toBeNull();
  });

  it('露娜·满月：手牌只能选非 SHOOT，对象是迷失层的玩家；不复活任何人也能发动', () => {
    const s = asThief('thief_luna_back', cards('action_shoot', 'action_kick', 'action_unlock'));
    const dead = s.others[2]!;
    const state = patchPlayer(moveTo(s.state, dead, 0), dead, { isAlive: false });
    const view = viewOf(state, s.me);
    const ctx = contextOf(state, s.me);
    expect(handChoicesFor(LUNA_FULL_MOON, ctx)).toEqual([1, 2]);
    expect(
      playerChoicesFor(
        LUNA_FULL_MOON,
        ctx,
        EMPTY_PICKS,
        activeSkillTargetIds(view.players, s.me),
        activeSkillLostTargetIds(view.players, s.me),
      ),
    ).toEqual([dead]);
    // 复活 0 人：引擎接受，并且翻面
    const args = buildStepArgs(LUNA_FULL_MOON, ctx, { ...EMPTY_PICKS, cards: [1, 2] })!;
    expect(args).toEqual([['action_kick', 'action_unlock'], []]);
    const after = apply(state, s.me, 'playLunaFullMoon', args)!;
    expect(after).not.toBeNull();
    expect(after.G.players[s.me]!.characterId).toBe('thief_luna');
    // 弃 SHOOT 或只选一张：引擎拒绝（界面也拼不出参数）
    expect(
      apply(state, s.me, 'playLunaFullMoon', [['action_shoot', 'action_kick'], []]),
    ).toBeNull();
    expect(buildStepArgs(LUNA_FULL_MOON, ctx, { ...EMPTY_PICKS, cards: [1] })).toBeNull();
  });

  it('露娜·满月：非 SHOOT 牌不足 2 张时置灰，引擎也拒绝', () => {
    const s = asThief('thief_luna_back', cards('action_shoot', 'action_shoot', 'action_kick'));
    expect(entryOf(s.state, s.me, LUNA_FULL_MOON)!.reason?.key).toBe(
      'skill.reason.needTwoNonShoot',
    );
    expect(
      apply(s.state, s.me, 'playLunaFullMoon', [['action_shoot', 'action_kick'], []]),
    ).toBeNull();
  });

  it('双鱼·洗礼：不复活也能发动；在第 4 层置灰，引擎也拒绝', () => {
    const s = asThief('thief_pisces_back', cards('action_kick'));
    const ctx = contextOf(s.state, s.me);
    expect(buildStepArgs(PISCES_BLESSING, ctx, EMPTY_PICKS)).toEqual([null]);
    const moved = apply(s.state, s.me, 'playPiscesBlessing', [null])!;
    expect(moved.G.players[s.me]!.currentLayer).toBe(s.state.G.players[s.me]!.currentLayer + 1);
    const top = moveTo(s.state, s.me, 4);
    expect(entryOf(top, s.me, PISCES_BLESSING)!.reason?.key).toBe('skill.reason.piscesTopLayer');
    expect(apply(top, s.me, 'playPiscesBlessing', [null])).toBeNull();
  });

  it('双鱼·洗礼：复活的对象必须已死亡；点名活人引擎拒绝', () => {
    const s = asThief('thief_pisces_back', cards('action_kick'));
    expect(apply(s.state, s.me, 'playPiscesBlessing', [s.others[0]!])).toBeNull();
  });

  it('格林射线·缉捕：缺梦境穿梭剂或 SHOOT 类牌时置灰，引擎也拒绝', () => {
    const noTransit = asThief('thief_green_ray', cards('action_shoot', 'action_kick'));
    expect(entryOf(noTransit.state, noTransit.me, GREEN_RAY_ARREST)!.reason?.key).toBe(
      'skill.reason.noTransitInHand',
    );
    const mate = noTransit.others[0]!;
    expect(
      apply(noTransit.state, noTransit.me, 'playGreenRayArrest', ['action_shoot', mate, 2]),
    ).toBeNull();
    const noShoot = asThief('thief_green_ray', cards('action_dream_transit', 'action_kick'));
    expect(entryOf(noShoot.state, noShoot.me, GREEN_RAY_ARREST)!.reason?.key).toBe(
      'skill.reason.noShootCard',
    );
  });

  it('格林射线·缉捕：只能选 SHOOT 类牌；任意层都能去，本人所在层表示不移动；目标是移动后同层的存活玩家', () => {
    const s = asThief(
      'thief_green_ray',
      cards('action_dream_transit', 'action_kick', 'action_shoot'),
    );
    const ctx = contextOf(s.state, s.me);
    expect(handChoicesFor(GREEN_RAY_ARREST, ctx)).toEqual([2]);
    const picks = { ...EMPTY_PICKS, cards: [2] };
    // 只移动不射击也是合法的，所以每一层都列（包括没人的层）
    expect(layerStepChoices(GREEN_RAY_ARREST, ctx, picks)).toEqual([1, 2, 3, 4]);
    const layer = [1, 2, 3, 4].find(
      (l) => s.state.G.layers[l]!.playersInLayer.filter((id) => id !== s.me).length > 0,
    )!;
    const targets = playerChoicesFor(GREEN_RAY_ARREST, ctx, { ...picks, layer }, [], []);
    expect(targets).toEqual(s.state.G.layers[layer]!.playersInLayer.filter((id) => id !== s.me));
    // 引擎对不在该层的目标拒绝
    const elsewhere = Object.keys(s.state.G.players).find(
      (id) => id !== s.me && !targets.includes(id),
    )!;
    expect(
      apply(s.state, s.me, 'playGreenRayArrest', ['action_shoot', elsewhere, layer]),
    ).toBeNull();
  });

  it('格林射线·缉捕：只移动（不选目标）界面拼出 [牌, null, 层]，引擎接受且不射击', () => {
    const s = asThief('thief_green_ray', cards('action_dream_transit', 'action_shoot'));
    const ctx = contextOf(s.state, s.me);
    const myLayer = s.state.G.players[s.me]!.currentLayer;
    const layer = myLayer === 4 ? 3 : myLayer + 1;
    const args = buildStepArgs(GREEN_RAY_ARREST, ctx, { ...EMPTY_PICKS, cards: [1], layer })!;
    expect(args).toEqual(['action_shoot', null, layer]);
    const after = apply(s.state, s.me, 'playGreenRayArrest', args)!;
    expect(after).not.toBeNull();
    expect(after.G.players[s.me]!.currentLayer).toBe(layer);
    // 代价照付：穿梭剂和 SHOOT 都弃了
    expect(after.G.players[s.me]!.hand).toEqual([]);
    // 没有射击：所有人都还活着
    for (const id of Object.keys(after.G.players)) expect(after.G.players[id]!.isAlive).toBe(true);
  });

  it('格林射线·缉捕：只射击（层选本人所在层）界面拼出 [牌, 目标, 本层]，引擎接受且不移动', () => {
    const s = asThief('thief_green_ray', cards('action_dream_transit', 'action_shoot_assassin'));
    const ctx = contextOf(s.state, s.me);
    const myLayer = s.state.G.players[s.me]!.currentLayer;
    const target = s.others[2]!;
    const args = buildStepArgs(GREEN_RAY_ARREST, ctx, {
      ...EMPTY_PICKS,
      cards: [1],
      layer: myLayer,
      players: [target],
    })!;
    expect(args).toEqual(['action_shoot_assassin', target, myLayer]);
    const after = apply(s.state, s.me, 'playGreenRayArrest', args)!;
    expect(after).not.toBeNull();
    expect(after.G.players[s.me]!.currentLayer).toBe(myLayer);
    expect(after.G.players[s.me]!.hand).toEqual([]);
  });

  it('格林射线·缉捕：既不移动也不射击，界面不让确认并说明，引擎也拒绝', () => {
    const s = asThief('thief_green_ray', cards('action_dream_transit', 'action_shoot'));
    const ctx = contextOf(s.state, s.me);
    const myLayer = s.state.G.players[s.me]!.currentLayer;
    const nothing = { ...EMPTY_PICKS, cards: [1], layer: myLayer };
    expect(buildStepArgs(GREEN_RAY_ARREST, ctx, nothing)).toBeNull();
    expect(GREEN_RAY_ARREST.confirmBlocked!(ctx, nothing)?.key).toBe(
      'skill.reason.greenRayNothing',
    );
    // 换一层，或者选一个目标，就放行
    expect(GREEN_RAY_ARREST.confirmBlocked!(ctx, { ...nothing, players: ['x'] })).toBeNull();
    expect(GREEN_RAY_ARREST.confirmBlocked!(ctx, { ...nothing, layer: myLayer + 1 })).toBeNull();
    expect(apply(s.state, s.me, 'playGreenRayArrest', ['action_shoot', null, myLayer])).toBeNull();
    expect(apply(s.state, s.me, 'playGreenRayArrest', ['action_shoot'])).toBeNull();
  });

  it('格林射线·缉捕：刺客之王不限层，所有存活的其他玩家都可选', () => {
    const s = asThief('thief_green_ray', cards('action_dream_transit', 'action_shoot_assassin'));
    const ctx = contextOf(s.state, s.me);
    const targets = playerChoicesFor(
      GREEN_RAY_ARREST,
      ctx,
      { ...EMPTY_PICKS, cards: [1], layer: 4 },
      [],
      [],
    );
    expect([...targets].sort()).toEqual(
      Object.keys(s.state.G.players)
        .filter((id) => id !== s.me)
        .sort(),
    );
    const far = targets.find((id) => s.state.G.players[id]!.currentLayer !== 4)!;
    expect(
      apply(s.state, s.me, 'playGreenRayArrest', ['action_shoot_assassin', far, 4]),
    ).not.toBeNull();
  });

  it('水瓶·凝聚：本回合没有同名牌对时置灰并说明，引擎也拒绝', () => {
    const s = asThief('thief_aquarius', cards('action_kick'));
    const state = setDiscard(s.state, cards('action_unlock'));
    const entry = entryOf(state, s.me, AQUARIUS_COHERENCE)!;
    expect(entry.enabled).toBe(false);
    expect(entry.reason?.key).toBe('skill.reason.needSameNamePair');
    expect(apply(state, s.me, 'playAquariusCoherence', ['action_unlock'])).toBeNull();
  });

  it('水瓶·凝聚：弃牌堆里本回合已用过的牌不可选，引擎也拒绝；同名牌合并显示张数', () => {
    const s = asThief('thief_aquarius', cards('action_kick'));
    let state = setDiscard(s.state, cards('action_kick', 'action_unlock', 'action_unlock'));
    state = editG(state, (G) => ({
      ...G,
      playedCardsThisTurn: cards('action_kick', 'action_kick'),
    }));
    const ctx = contextOf(state, s.me);
    expect(discardChoicesFor(AQUARIUS_COHERENCE, ctx)).toEqual([
      { card: 'action_unlock', count: 2 },
    ]);
    expect(apply(state, s.me, 'playAquariusCoherence', ['action_kick'])).toBeNull();
    expect(entryOf(state, s.me, AQUARIUS_COHERENCE)).toMatchObject({ enabled: true, remaining: 1 });
  });

  it('水瓶·凝聚：弃牌堆里全是本回合用过的牌时置灰', () => {
    const s = asThief('thief_aquarius', cards('action_kick'));
    let state = setDiscard(s.state, cards('action_kick'));
    state = editG(state, (G) => ({
      ...G,
      playedCardsThisTurn: cards('action_kick', 'action_kick'),
    }));
    expect(entryOf(state, s.me, AQUARIUS_COHERENCE)!.reason?.key).toBe(
      'skill.reason.noFreshInDiscard',
    );
  });

  it('射手·穿心：本回合没有击杀过玩家时置灰，引擎也拒绝', () => {
    const s = asThief('thief_sagittarius', cards('action_kick'));
    const layer = s.state.G.players[s.me]!.currentLayer;
    expect(entryOf(s.state, s.me, SAGITTARIUS_HEART_LOCK)!.reason?.key).toBe(
      'skill.reason.noKillThisTurn',
    );
    expect(apply(s.state, s.me, 'useSagittariusHeartLock', [layer, -1])).toBeNull();
  });

  it('射手·穿心：解封次数用尽时不能减少，只能增加；减少只列还有心锁的层，增加只列没满的层', () => {
    const s = asThief('thief_sagittarius', cards('action_kick'));
    const layer = s.state.G.players[s.me]!.currentLayer;
    let state = patchPlayer(s.state, s.me, {
      skillUsedThisTurn: { 'thief_sagittarius.kills': 1 },
      successfulUnlocksThisTurn: 1,
    });
    const ctx = contextOf(state, s.me);
    const choices = SAGITTARIUS_HEART_LOCK.choices!(ctx);
    expect(choices.find((c) => c.value === 'decrease')!.disabled?.key).toBe(
      'skill.reason.unlockLimit',
    );
    expect(choices.find((c) => c.value === 'increase')!.disabled).toBeNull();
    // 引擎：减少被拒
    expect(apply(state, s.me, 'useSagittariusHeartLock', [layer, -1])).toBeNull();
    // 开局每层都是原有数量：增加没有可选的层（界面不列），减少四层都可选
    expect(
      layerStepChoices(SAGITTARIUS_HEART_LOCK, ctx, { ...EMPTY_PICKS, choice: 'increase' }),
    ).toEqual([]);
    expect(
      layerStepChoices(SAGITTARIUS_HEART_LOCK, ctx, { ...EMPTY_PICKS, choice: 'decrease' }),
    ).toEqual([1, 2, 3, 4]);
    // 把第 2 层心锁削掉 1 个后，增加只列这一层，引擎接受
    state = setLayer(state, 2, { heartLockValue: state.G.layers[2]!.heartLockValue - 1 });
    const ctx2 = contextOf(state, s.me);
    expect(
      layerStepChoices(SAGITTARIUS_HEART_LOCK, ctx2, { ...EMPTY_PICKS, choice: 'increase' }),
    ).toEqual([2]);
    const after = apply(state, s.me, 'useSagittariusHeartLock', [2, 1])!;
    expect(after.G.layers[2]!.heartLockValue).toBe(state.G.layers[2]!.heartLockValue + 1);
  });

  it('金星·镜界复制：只有梦主是金星才有；本回合没有 SHOOT / KICK 时置灰，引擎也拒绝', () => {
    const s = asThief('thief_aries', cards('action_kick', 'action_unlock'));
    expect(entryOf(s.state, s.me, VENUS_MIRROR_COPY)).toBeUndefined();
    const venus = setCharacter(s.state, s.master, 'dm_venus_mirror');
    expect(entryOf(venus, s.me, VENUS_MIRROR_COPY)!.reason?.key).toBe(
      'skill.reason.nothingToMirror',
    );
    expect(
      apply(venus, s.me, 'useVenusMirrorWorld', [s.others[0], ['action_kick', 'action_unlock']]),
    ).toBeNull();
  });

  it('金星·镜界复制：梦主本人也能用（世界观对所有存活玩家生效）', () => {
    const s = asMaster('dm_venus_mirror', cards('action_kick', 'action_unlock'));
    const state = editG(s.state, (G) => ({ ...G, playedCardsThisTurn: cards('action_kick') }));
    const entry = entryOf(state, s.me, VENUS_MIRROR_COPY)!;
    expect(entry.enabled).toBe(true);
    expect(
      apply(state, s.me, 'useVenusMirrorWorld', [s.thieves[0], ['action_kick', 'action_unlock']]),
    ).not.toBeNull();
  });

  it('达尔文·淘汰：必须刚好放回 2 张，手牌不足 2 张时置灰', () => {
    expect(DARWIN_EVOLUTION.pickCount).toBe(2);
    const one = asThief('thief_darwin', cards('action_kick'));
    expect(entryOf(one.state, one.me, DARWIN_EVOLUTION)!.reason?.key).toBe(
      'skill.reason.needTwoInHand',
    );
    const three = asThief('thief_darwin', cards('action_kick', 'action_unlock', 'action_shoot'));
    expect(entryOf(three.state, three.me, DARWIN_EVOLUTION)!.enabled).toBe(true);
    // 引擎要求恰好 2 张：1 张或 3 张都拒绝
    expect(apply(three.state, three.me, 'playDarwinEvolution', [['action_kick']])).toBeNull();
    expect(
      apply(three.state, three.me, 'playDarwinEvolution', [
        ['action_kick', 'action_unlock', 'action_shoot'],
      ]),
    ).toBeNull();
    // 放回的顺序：先选的在最顶
    const after = apply(three.state, three.me, 'playDarwinEvolution', [
      ['action_unlock', 'action_kick'],
    ])!;
    expect(after.G.deck.cards.slice(0, 2)).toEqual(['action_unlock', 'action_kick']);
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
