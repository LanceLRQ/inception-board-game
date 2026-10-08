// 抽牌阶段的入口、【解封】与【梦魇解封】的预判、SHOOT 跨层目标与射手·禁足，经真实引擎对账：
// 界面推导出「可用」的，按界面拼的 move 与参数引擎接受；界面推导出「不可用」的，引擎也拒绝。

import { describe, it, expect } from 'vitest';
import {
  HEART_LOCK_REDUCED_BY_SKILL_KEY as ENGINE_REDUCED_KEY,
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
import { computeTargetOptions } from '../TargetPlayerPickerDialog/logic';
import { buildPlayArgs, derivePlayRules, nightmareUnlockLayers } from './controllerDerive';
import { deriveDockEntries } from './model/dockEntries';
import { playBlockReason } from './model/handDerive';
import { HEART_LOCK_REDUCED_BY_SKILL_KEY } from '../../lib/unlockLimit';

const game: GameDef<SetupState> = InceptionCityGame;
type S = MatchState<SetupState>;
const cards = (...ids: string[]): CardID[] => ids as CardID[];

function editG(state: S, fn: (G: SetupState) => SetupState): S {
  return { ...state, G: fn(state.G) };
}
const patchPlayer = (state: S, seat: string, patch: Partial<PlayerSetup>): S =>
  editG(state, (G) => ({
    ...G,
    players: { ...G.players, [seat]: { ...G.players[seat]!, ...patch } },
  }));
const setHand = (state: S, seat: string, hand: CardID[]): S => patchPlayer(state, seat, { hand });
const setCharacter = (state: S, seat: string, characterId: string): S =>
  patchPlayer(state, seat, { characterId: characterId as CardID });
const moveTo = (state: S, seat: string, layer: number): S =>
  editG(state, (G) => movePlayerToLayer(G, seat, layer));
const setPhase = (state: S, phase: SetupState['turnPhase']): S =>
  editG(state, (G) => ({ ...G, turnPhase: phase }));
const setLayer = (state: S, layer: number, patch: Partial<SetupState['layers'][number]>): S =>
  editG(state, (G) => ({
    ...G,
    layers: { ...G.layers, [layer]: { ...G.layers[layer]!, ...patch } },
  }));

function apply(state: S, seat: string, move: string, args: unknown[]): S | null {
  const res = applyMove(game, state, { playerID: seat, move, args });
  return res.ok ? res.state : null;
}
const viewOf = (state: S, seat: string): MatchView => viewMatch(game, state, seat).G as MatchView;

function thiefScene() {
  const { state, viewer } = buildFixtureMatch('thief');
  const others = state.G.playerOrder.filter((id) => id !== viewer && id !== state.G.dreamMasterID);
  return { state, me: viewer, others, master: state.G.dreamMasterID };
}

function entriesFor(state: S, seat: string) {
  const G = viewOf(state, seat);
  return deriveDockEntries({
    seat,
    dreamMasterID: G.dreamMasterID,
    players: G.players,
    hand: G.players[seat]!.hand ?? [],
    isMyTurn: G.currentPlayerID === seat,
    turnPhase: G.turnPhase,
    winner: null,
    busy: false,
  });
}

describe('抽牌阶段入口：与引擎一致', () => {
  it('略过抽牌：界面给出入口，引擎接受并进入出牌阶段', () => {
    const s = thiefScene();
    const state = setPhase(s.state, 'draw');
    expect(entriesFor(state, s.me).map((e) => [e.kind, e.enabled])).toEqual([['skipDraw', true]]);
    const after = apply(state, s.me, 'skipDraw', []);
    expect(after).not.toBeNull();
    expect(after!.G.turnPhase).toBe('action');
  });

  it('出牌阶段没有略过抽牌的入口，引擎也拒绝', () => {
    const s = thiefScene();
    expect(entriesFor(s.state, s.me).some((e) => e.kind === 'skipDraw')).toBe(false);
    expect(apply(s.state, s.me, 'skipDraw', [])).toBeNull();
  });

  it('小丑·失控：界面给出入口，引擎接受；抽牌后当回合的弃牌阶段要全弃', () => {
    const s = thiefScene();
    let state = setCharacter(s.state, s.me, 'thief_joker');
    state = setPhase(state, 'draw');
    expect(entriesFor(state, s.me).map((e) => [e.kind, e.enabled])).toEqual([
      ['skipDraw', true],
      ['jokerGamble', true],
    ]);
    const before = state.G.players[s.me]!.hand.length;
    const after = apply(state, s.me, 'playJokerGamble', []);
    expect(after).not.toBeNull();
    expect(after!.G.players[s.me]!.hand.length).toBeGreaterThan(before);
    expect(after!.G.players[s.me]!.forcedDiscardArmedAtTurn).toBe(state.G.turnNumber);
    expect(after!.G.turnPhase).toBe('action');
  });

  it('不是小丑：界面没有这个入口，引擎也拒绝', () => {
    const s = thiefScene();
    const state = setPhase(setCharacter(s.state, s.me, 'thief_aries'), 'draw');
    expect(entriesFor(state, s.me).some((e) => e.kind === 'jokerGamble')).toBe(false);
    expect(apply(state, s.me, 'playJokerGamble', [])).toBeNull();
  });

  it('小丑在迷失层：界面没有这个入口，引擎也拒绝', () => {
    const s = thiefScene();
    let state = setCharacter(s.state, s.me, 'thief_joker');
    state = patchPlayer(state, s.me, { isAlive: false });
    state = setPhase(state, 'draw');
    expect(entriesFor(state, s.me).some((e) => e.kind === 'jokerGamble')).toBe(false);
    expect(apply(state, s.me, 'playJokerGamble', [])).toBeNull();
  });
});

describe('【解封】的预判：与引擎一致', () => {
  const rulesOf = (state: S, seat: string) => derivePlayRules(viewOf(state, seat), seat);

  it('次数键与引擎的 HEART_LOCK_REDUCED_BY_SKILL_KEY 一致', () => {
    expect(HEART_LOCK_REDUCED_BY_SKILL_KEY).toBe(ENGINE_REDUCED_KEY);
  });

  it('什么限制都没有：不置灰，引擎接受', () => {
    const s = thiefScene();
    expect(playBlockReason('action_unlock', rulesOf(s.state, s.me))).toBeNull();
    expect(apply(s.state, s.me, 'playUnlock', ['action_unlock'])).not.toBeNull();
  });

  it('所在层的心锁已是 0：置灰，引擎拒绝', () => {
    const s = thiefScene();
    const layer = s.state.G.players[s.me]!.currentLayer;
    const state = setLayer(s.state, layer, { heartLockValue: 0 });
    expect(playBlockReason('action_unlock', rulesOf(state, s.me))).toBe('noHeartLock');
    expect(apply(state, s.me, 'playUnlock', ['action_unlock'])).toBeNull();
  });

  it('本回合已成功解封（上限读视图的 maxUnlockPerTurn）：置灰，引擎拒绝', () => {
    const s = thiefScene();
    const state = patchPlayer(s.state, s.me, { successfulUnlocksThisTurn: 1 });
    expect(viewOf(state, s.me).maxUnlockPerTurn).toBe(1);
    expect(playBlockReason('action_unlock', rulesOf(state, s.me))).toBe('unlockLimit');
    expect(apply(state, s.me, 'playUnlock', ['action_unlock'])).toBeNull();
  });

  it('技能减少心锁也占用同一份次数：置灰，引擎拒绝', () => {
    const s = thiefScene();
    const state = patchPlayer(s.state, s.me, {
      skillUsedThisTurn: { [HEART_LOCK_REDUCED_BY_SKILL_KEY]: 1 },
    });
    expect(playBlockReason('action_unlock', rulesOf(state, s.me))).toBe('unlockLimit');
    expect(apply(state, s.me, 'playUnlock', ['action_unlock'])).toBeNull();
  });

  it('黑洞世界观把上限提到 2：解封一次后仍可再用，解封两次后置灰', () => {
    const s = thiefScene();
    let state = setCharacter(s.state, s.master, 'dm_black_hole');
    state = patchPlayer(state, s.me, { successfulUnlocksThisTurn: 1 });
    expect(viewOf(state, s.me).maxUnlockPerTurn).toBe(2);
    expect(playBlockReason('action_unlock', rulesOf(state, s.me))).toBeNull();
    expect(apply(state, s.me, 'playUnlock', ['action_unlock'])).not.toBeNull();
    const twice = patchPlayer(state, s.me, { successfulUnlocksThisTurn: 2 });
    expect(playBlockReason('action_unlock', rulesOf(twice, s.me))).toBe('unlockLimit');
    expect(apply(twice, s.me, 'playUnlock', ['action_unlock'])).toBeNull();
  });

  it('水瓶·同流、摩羯·节奏（手牌数不小于所在层）不受次数限制：不置灰，引擎接受', () => {
    const s = thiefScene();
    const used = patchPlayer(s.state, s.me, { successfulUnlocksThisTurn: 1 });
    const aquarius = setCharacter(used, s.me, 'thief_aquarius');
    expect(playBlockReason('action_unlock', rulesOf(aquarius, s.me))).toBeNull();
    expect(apply(aquarius, s.me, 'playUnlock', ['action_unlock'])).not.toBeNull();

    const layer = used.G.players[s.me]!.currentLayer;
    const handFull = setHand(
      setCharacter(used, s.me, 'thief_capricornus'),
      s.me,
      cards('action_unlock', ...Array.from({ length: layer }, () => 'action_kick')),
    );
    expect(playBlockReason('action_unlock', rulesOf(handFull, s.me))).toBeNull();
    expect(apply(handFull, s.me, 'playUnlock', ['action_unlock'])).not.toBeNull();
    // 摩羯手牌不够：不豁免
    const handShort = setHand(
      setCharacter(used, s.me, 'thief_capricornus'),
      s.me,
      cards('action_unlock'),
    );
    expect(playBlockReason('action_unlock', rulesOf(handShort, s.me))).toBe('unlockLimit');
    expect(apply(handShort, s.me, 'playUnlock', ['action_unlock'])).toBeNull();
  });
});

describe('【梦魇解封】的层：只列还盖着暗置梦魇的层', () => {
  const NIGHTMARE_UNLOCK = 'action_nightmare_unlock';

  it('每层引擎是否接受，与界面列出的层逐层一致', () => {
    const s = thiefScene();
    let state = setHand(s.state, s.me, cards(NIGHTMARE_UNLOCK));
    // 第 2 层的梦魇已翻开（等梦主处理），第 3 层的梦魇已被发动掉
    state = setLayer(state, 2, { nightmareRevealed: true });
    state = setLayer(state, 3, {
      nightmareId: null,
      nightmareRevealed: false,
      nightmareTriggered: true,
    });
    const listed = nightmareUnlockLayers(viewOf(state, s.me).layers);
    expect(listed).toEqual([1, 4]);
    for (const layer of [1, 2, 3, 4]) {
      const accepted =
        apply(state, s.me, 'playNightmareUnlock', [NIGHTMARE_UNLOCK, layer]) !== null;
      expect(accepted, `第 ${layer} 层`).toBe(listed.includes(layer));
    }
  });

  it('没有一层可翻时，这张牌被标为打不出，引擎也拒绝所有层', () => {
    const s = thiefScene();
    let state = setHand(s.state, s.me, cards(NIGHTMARE_UNLOCK));
    for (const layer of [1, 2, 3, 4]) {
      state = setLayer(state, layer, {
        nightmareId: null,
        nightmareRevealed: false,
        nightmareTriggered: true,
      });
    }
    expect(nightmareUnlockLayers(viewOf(state, s.me).layers)).toEqual([]);
    expect(playBlockReason(NIGHTMARE_UNLOCK, derivePlayRules(viewOf(state, s.me), s.me))).toBe(
      'noNightmareTarget',
    );
    for (const layer of [1, 2, 3, 4]) {
      expect(apply(state, s.me, 'playNightmareUnlock', [NIGHTMARE_UNLOCK, layer])).toBeNull();
    }
  });

  it('梦主和盗梦者的视图列出同样的层（梦魇是什么对盗梦者保密，不影响判断）', () => {
    const s = thiefScene();
    const asThief = nightmareUnlockLayers(viewOf(s.state, s.me).layers);
    const asMaster = nightmareUnlockLayers(viewOf(s.state, s.master).layers);
    expect(asThief).toEqual(asMaster);
    expect(asThief).toEqual([1, 2, 3, 4]);
    // 盗梦者的视图里确实看不到梦魇是什么
    expect(Object.values(viewOf(s.state, s.me).layers).every((l) => l.nightmareId === null)).toBe(
      true,
    );
  });
});

describe('SHOOT 跨层目标：界面与引擎一致', () => {
  /** 本人与几个不同层的目标；返回 [同层, 低一层, 高一层, 隔两层] 的座位 */
  function shootScene(characterId: string, hand: CardID[], masterCharacter?: string) {
    const s = thiefScene();
    let state = setCharacter(s.state, s.me, characterId);
    state = setHand(state, s.me, hand);
    if (masterCharacter) state = setCharacter(state, s.master, masterCharacter);
    // 本人在第 2 层：把几个盗梦者摆到第 2、1、3、4 层
    state = moveTo(state, s.me, 2);
    state = moveTo(state, s.others[0]!, 2);
    state = moveTo(state, s.others[1]!, 1);
    state = moveTo(state, s.others[2]!, 3);
    state = moveTo(state, s.others[3]!, 4);
    return {
      ...s,
      state,
      same: s.others[0]!,
      down: s.others[1]!,
      up: s.others[2]!,
      far: s.others[3]!,
    };
  }

  function optionsOf(state: S, seat: string, card = 'action_shoot') {
    const G = viewOf(state, seat);
    const me = G.players[seat]!;
    return computeTargetOptions({
      cardId: card,
      viewerLayer: me.currentLayer,
      viewerPlayerID: seat,
      players: G.players,
      dreamMasterID: G.dreamMasterID,
      viewerCharacterId: me.characterId,
      viewerHandCount: me.hand?.length ?? 0,
      masterCharacterId: G.players[G.dreamMasterID]?.characterId ?? null,
    });
  }

  /** 每个目标：界面可选与否，和引擎是否接受 SHOOT 完全一致 */
  function expectUiMatchesEngine(state: S, seat: string, targets: string[]) {
    const options = optionsOf(state, seat);
    for (const id of targets) {
      const opt = options.find((o) => o.id === id)!;
      const accepted = apply(state, seat, 'playShoot', [id, 'action_shoot']) !== null;
      expect(!opt.disabled, `目标 ${id}`).toBe(accepted);
    }
  }

  it('普通盗梦者：只能射同层', () => {
    const s = shootScene('thief_aries', cards('action_shoot', 'action_kick'));
    expectUiMatchesEngine(s.state, s.me, [s.same, s.down, s.up, s.far]);
    const options = optionsOf(s.state, s.me);
    expect(options.find((o) => o.id === s.same)!.disabled).toBe(false);
    expect(options.find((o) => o.id === s.far)!.disabled).toBe(true);
  });

  it('恐怖分子·远程：任意层都能射', () => {
    const s = shootScene('thief_terrorist', cards('action_shoot'));
    expectUiMatchesEngine(s.state, s.me, [s.same, s.down, s.up, s.far]);
    expect(optionsOf(s.state, s.me).find((o) => o.id === s.far)).toMatchObject({
      disabled: false,
      crossLayerAllowed: true,
    });
  });

  it('摩羯·节奏：手牌数不小于所在层数字时任意层都能射，否则只能同层', () => {
    const enough = shootScene('thief_capricornus', cards('action_shoot', 'action_kick'));
    expectUiMatchesEngine(enough.state, enough.me, [
      enough.same,
      enough.down,
      enough.up,
      enough.far,
    ]);
    expect(optionsOf(enough.state, enough.me).find((o) => o.id === enough.far)!.disabled).toBe(
      false,
    );

    const short = shootScene('thief_capricornus', cards('action_shoot'));
    expectUiMatchesEngine(short.state, short.me, [short.same, short.down, short.up, short.far]);
    expect(optionsOf(short.state, short.me).find((o) => o.id === short.far)!.disabled).toBe(true);
  });

  it('木星·巅峰世界观：相邻层也能射，隔层不行', () => {
    const s = shootScene('thief_aries', cards('action_shoot'), 'dm_jupiter_peak');
    expectUiMatchesEngine(s.state, s.me, [s.same, s.down, s.up, s.far]);
    const options = optionsOf(s.state, s.me);
    expect(options.find((o) => o.id === s.up)).toMatchObject({
      disabled: false,
      crossLayerAllowed: true,
    });
    expect(options.find((o) => o.id === s.far)!.disabled).toBe(true);
  });

  it('刺客之王本来就不限层：不算豁免', () => {
    const s = shootScene('thief_aries', cards('action_shoot_assassin'));
    const options = optionsOf(s.state, s.me, 'action_shoot_assassin');
    expect(options.every((o) => !o.disabled && !o.crossLayerAllowed)).toBe(true);
    expect(apply(s.state, s.me, 'playShootKing', [s.far, 'action_shoot_assassin'])).not.toBeNull();
  });
});

describe('射手·禁足', () => {
  const pendingShoot = { card: 'action_shoot', move: 'playShoot', needsTarget: 'player' as const };

  function sagittariusScene(characterId: string) {
    const s = thiefScene();
    let state = setCharacter(s.state, s.me, characterId);
    state = setHand(state, s.me, cards('action_shoot'));
    state = moveTo(state, s.others[0]!, state.G.players[s.me]!.currentLayer);
    return { ...s, state, target: s.others[0]! };
  }

  it('射手勾选「禁足」：参数形状被引擎接受（经 JSON 往返也一样）', () => {
    const s = sagittariusScene('thief_sagittarius');
    const args = buildPlayArgs(pendingShoot, s.target, null, true);
    expect(args).toEqual([s.target, 'action_shoot', undefined, true]);
    expect(apply(s.state, s.me, 'playShoot', args)).not.toBeNull();
    const wire = JSON.parse(JSON.stringify(args)) as unknown[];
    expect(apply(s.state, s.me, 'playShoot', wire)).not.toBeNull();
  });

  it('射手同时附死亡宣言：参数顺序是 (目标, 牌, 宣言, true)', () => {
    const s = sagittariusScene('thief_sagittarius');
    const state = setHand(s.state, s.me, cards('action_shoot', 'action_death_decree_3'));
    const args = buildPlayArgs(pendingShoot, s.target, 'action_death_decree_3', true);
    expect(args).toEqual([s.target, 'action_shoot', 'action_death_decree_3', true]);
    expect(apply(state, s.me, 'playShoot', args)).not.toBeNull();
  });

  it('不勾选时参数与原来一样', () => {
    expect(buildPlayArgs(pendingShoot, '3', null, false)).toEqual(['3', 'action_shoot']);
    expect(buildPlayArgs(pendingShoot, '3', 'action_death_decree_3', false)).toEqual([
      '3',
      'action_shoot',
      'action_death_decree_3',
    ]);
  });

  it('只有普通 SHOOT 带禁足参数：刺客之王等不附加', () => {
    const king = {
      card: 'action_shoot_assassin',
      move: 'playShootKing',
      needsTarget: 'player' as const,
    };
    expect(buildPlayArgs(king, '3', null, true)).toEqual(['3', 'action_shoot_assassin']);
  });
});
