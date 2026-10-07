// 要塞·冷酷：梦主在自己的出牌阶段每移动到另一层一次，可视为对任一盗梦者使用 1 张 SHOOT。
// 对照：docs/manual/06-dream-master.md 要塞（118-127 行）；docs/manual/04-action-cards.md SHOOT 解析
// 没有实体牌，骰面按普通 SHOOT（死亡 [1]、移动 [2,3,4]），走与普通 SHOOT 共同的结算；
// 梦主是射手，所以 M4 卡宾枪（目标骰 -1）照常生效。经对局运行器驱动真实 move，骰值按调用顺序给出。

import { describe, it, expect } from 'vitest';
import type { CardID } from '@icgame/shared';
import { checkStateInvariants } from './engine/stateInvariants.js';
import { viewFor } from './engine/matchView.js';
import { FORTRESS_SKILL_ID, fortressColdnessChancesLeft } from './engine/skills.js';
import { InceptionCityGame } from './game.js';
import { applyMove, type MatchState } from './runner/matchRunner.js';
import type { SetupState } from './setup.js';
import { beginTurn, FORTRESS_COLDNESS_CHANCES_KEY, movePlayerToLayer } from './stateOps.js';
import {
  c,
  fixedRandom,
  game,
  KICK,
  load,
  scene,
  SHOOT,
  withPlayer,
} from './testing/runnerHarness.js';

const FORTRESS = c('dm_fortress');
const CHESS = c('dm_chess');
const NIGHTMARE = c('nightmare_despair_storm');

/** 梦主 pM（要塞）在第 1 层；p1 第 1 层、p2 第 2 层、p3 第 3 层、p4 第 4 层；轮到梦主的出牌阶段 */
function fortressScene(extra: Partial<SetupState> = {}): SetupState {
  const G = scene(
    {
      p1: { layer: 1, hand: [KICK] },
      p2: { layer: 2, hand: [KICK] },
      p3: { layer: 3, hand: [KICK] },
      p4: { layer: 4, hand: [KICK] },
      pM: { layer: 1, hand: [SHOOT, KICK] },
    },
    extra,
  );
  return withPlayer(G, 'pM', { characterId: FORTRESS });
}

function step(
  m: MatchState<SetupState>,
  playerID: string,
  move: string,
  args: unknown[],
  roll = 3,
): MatchState<SetupState> {
  const res = applyMove(game, m, { playerID, move, args }, { random: fixedRandom(roll) });
  expect(res.ok, `${move} 被拒绝：${res.ok ? '' : res.reason}`).toBe(true);
  if (!res.ok) throw new Error('unreachable');
  expect(checkStateInvariants(res.state.G)).toEqual([]);
  return res.state;
}

function isRejected(
  m: MatchState<SetupState>,
  playerID: string,
  move: string,
  args: unknown[],
): boolean {
  return !applyMove(game, m, { playerID, move, args }, { random: fixedRandom(3) }).ok;
}

/** 梦主移到第 2 层：产生 1 次发动机会 */
function afterMasterMove(G: SetupState = fortressScene()): MatchState<SetupState> {
  return step(load(G), 'pM', 'dreamMasterMove', [2]);
}

function withNightmare(G: SetupState, layer: 1 | 2 | 3 | 4): SetupState {
  return {
    ...G,
    layers: {
      ...G.layers,
      [layer]: { ...G.layers[layer]!, nightmareId: NIGHTMARE, nightmareRevealed: false },
    },
  };
}

describe('发动机会：梦主在自己的出牌阶段每换一次层记一次', () => {
  it('还没换层：不能发动', () => {
    expect(isRejected(load(fortressScene()), 'pM', 'useFortressColdness', ['p1'])).toBe(true);
  });

  it('换层后可以发动', () => {
    const m = afterMasterMove();
    expect(fortressColdnessChancesLeft(m.G.players.pM!.skillUsedThisTurn)).toBe(1);
    const after = step(m, 'pM', 'useFortressColdness', ['p1']);
    expect(after.G.players.pM!.skillUsedThisTurn[FORTRESS_SKILL_ID]).toBe(1);
  });

  it('换一次层只能发动一次', () => {
    const m = step(afterMasterMove(), 'pM', 'useFortressColdness', ['p1']);
    expect(fortressColdnessChancesLeft(m.G.players.pM!.skillUsedThisTurn)).toBe(0);
    expect(isRejected(m, 'pM', 'useFortressColdness', ['p3'])).toBe(true);
  });

  it('换两次层可以发动两次，第三次被拒', () => {
    let m = afterMasterMove();
    m = step(m, 'pM', 'dreamMasterMove', [3]);
    m = step(m, 'pM', 'useFortressColdness', ['p1']);
    m = step(m, 'pM', 'useFortressColdness', ['p4']);
    expect(isRejected(m, 'pM', 'useFortressColdness', ['p1'])).toBe(true);
  });

  it('发动机会可以攒着：连换两次层后，先发动一次，之后再换层仍累计', () => {
    let m = afterMasterMove();
    m = step(m, 'pM', 'dreamMasterMove', [3]);
    m = step(m, 'pM', 'useFortressColdness', ['p1']);
    m = step(m, 'pM', 'dreamMasterMove', [4]);
    expect(fortressColdnessChancesLeft(m.G.players.pM!.skillUsedThisTurn)).toBe(2);
  });

  it('换层的各种途径都算：梦境穿梭剂、KICK 与盗梦者交换层数', () => {
    const transit = step(
      load(withPlayer(fortressScene(), 'pM', { hand: [c('action_dream_transit')] })),
      'pM',
      'playDreamTransit',
      [c('action_dream_transit'), 2],
    );
    expect(fortressColdnessChancesLeft(transit.G.players.pM!.skillUsedThisTurn)).toBe(1);

    const kick = step(load(withPlayer(fortressScene(), 'pM', { hand: [KICK] })), 'pM', 'playKick', [
      KICK,
      'p2',
    ]);
    expect(kick.G.players.pM!.currentLayer).toBe(2);
    expect(fortressColdnessChancesLeft(kick.G.players.pM!.skillUsedThisTurn)).toBe(1);
  });

  it('回合开始从迷失层复活不算：复活发生在抽牌阶段，复活后也没有发动机会', () => {
    const dead = withPlayer(fortressScene({ currentPlayerID: 'p4', turnPhase: 'turnEnd' }), 'pM', {
      isAlive: false,
      currentLayer: 0,
      layerBeforeLimbo: 2,
    });
    const onBegin = (
      InceptionCityGame as unknown as {
        phases: {
          playing: { turn: { onBegin: (a: { G: SetupState; ctx: unknown }) => SetupState } };
        };
      }
    ).phases.playing.turn.onBegin;
    const begun = onBegin({
      G: dead,
      ctx: { currentPlayer: 'pM', numPlayers: 5, playOrder: dead.playerOrder, playOrderPos: 4 },
    });
    expect(begun.players.pM!.isAlive).toBe(true);
    expect(begun.players.pM!.currentLayer).toBe(2);
    expect(begun.turnPhase).toBe('draw');
    expect(begun.players.pM!.skillUsedThisTurn[FORTRESS_COLDNESS_CHANCES_KEY] ?? 0).toBe(0);
    // 即使进入出牌阶段，也没有可发动的机会
    const action: SetupState = { ...begun, turnPhase: 'action' };
    expect(isRejected(load(action), 'pM', 'useFortressColdness', ['p1'])).toBe(true);
  });

  it('发动机会只在换层的那一刻记，层没变、进迷失层、非出牌阶段、别人的回合都不记', () => {
    const G = fortressScene();
    const chances = (s: SetupState) =>
      s.players.pM!.skillUsedThisTurn[FORTRESS_COLDNESS_CHANCES_KEY] ?? 0;
    expect(chances(movePlayerToLayer(G, 'pM', 1))).toBe(0); // 层没变
    expect(chances(movePlayerToLayer(G, 'pM', 0))).toBe(0); // 进迷失层
    expect(chances(movePlayerToLayer({ ...G, turnPhase: 'draw' }, 'pM', 2))).toBe(0);
    expect(chances(movePlayerToLayer({ ...G, turnPhase: 'discard' }, 'pM', 2))).toBe(0);
    expect(chances(movePlayerToLayer({ ...G, currentPlayerID: 'p1' }, 'pM', 2))).toBe(0);
    expect(chances(movePlayerToLayer(G, 'pM', 2))).toBe(1);
  });

  it('只有要塞梦主记发动机会：别的梦主、盗梦者换层都不记', () => {
    const chess = withPlayer(fortressScene(), 'pM', { characterId: CHESS });
    expect(
      movePlayerToLayer(chess, 'pM', 2).players.pM!.skillUsedThisTurn[
        FORTRESS_COLDNESS_CHANCES_KEY
      ],
    ).toBeUndefined();
    const thiefTurn = { ...fortressScene(), currentPlayerID: 'p1' };
    const moved = movePlayerToLayer(thiefTurn, 'p1', 2);
    expect(moved.players.p1!.skillUsedThisTurn[FORTRESS_COLDNESS_CHANCES_KEY]).toBeUndefined();
  });

  it('下个回合开始时机会随回合清零', () => {
    const m = afterMasterMove();
    expect(fortressColdnessChancesLeft(m.G.players.pM!.skillUsedThisTurn)).toBe(1);
    const next = beginTurn(m.G, 'pM');
    expect(fortressColdnessChancesLeft(next.players.pM!.skillUsedThisTurn)).toBe(0);
  });
});

describe('谁能发动、能选谁', () => {
  it('不在出牌阶段被拒', () => {
    const m = afterMasterMove();
    for (const turnPhase of ['draw', 'discard'] as const) {
      expect(isRejected(load({ ...m.G, turnPhase }), 'pM', 'useFortressColdness', ['p1'])).toBe(
        true,
      );
    }
  });

  it('不是梦主的回合被拒', () => {
    const m = afterMasterMove();
    expect(
      isRejected(load({ ...m.G, currentPlayerID: 'p1' }), 'pM', 'useFortressColdness', ['p2']),
    ).toBe(true);
  });

  it('梦主不是要塞被拒（即使状态里有发动机会）', () => {
    const m = afterMasterMove();
    const chess = withPlayer(m.G, 'pM', { characterId: CHESS });
    expect(isRejected(load(chess), 'pM', 'useFortressColdness', ['p1'])).toBe(true);
  });

  it('盗梦者调用被拒：回合主人是梦主时没有行动权；轮到他自己时也不是梦主', () => {
    const m = afterMasterMove();
    expect(isRejected(m, 'p1', 'useFortressColdness', ['p2'])).toBe(true);
    const own = withPlayer({ ...m.G, currentPlayerID: 'p1' }, 'p1', {
      skillUsedThisTurn: { [FORTRESS_COLDNESS_CHANCES_KEY]: 1 },
    });
    expect(isRejected(load(own), 'p1', 'useFortressColdness', ['p2'])).toBe(true);
  });

  it('目标是梦主自己被拒', () => {
    expect(isRejected(afterMasterMove(), 'pM', 'useFortressColdness', ['pM'])).toBe(true);
  });

  it('目标已死亡被拒', () => {
    const m = afterMasterMove();
    const dead = withPlayer(m.G, 'p1', { isAlive: false, currentLayer: 0 });
    expect(isRejected(load(dead), 'pM', 'useFortressColdness', ['p1'])).toBe(true);
  });

  it('目标不是对局里的玩家、参数不是字符串被拒', () => {
    const m = afterMasterMove();
    expect(isRejected(m, 'pM', 'useFortressColdness', ['nobody'])).toBe(true);
    expect(isRejected(m, 'pM', 'useFortressColdness', [42])).toBe(true);
    expect(isRejected(m, 'pM', 'useFortressColdness', [])).toBe(true);
  });

  it('身份没公开的背叛者也可以被选（按对外身份算，选得中不泄露阵营）', () => {
    const m = afterMasterMove();
    const traitor = withPlayer(m.G, 'p1', { faction: 'master', isRevealed: false });
    const after = step(load(traitor), 'pM', 'useFortressColdness', ['p1'], 2);
    expect(after.G.players.p1!.isAlive).toBe(false);
  });

  it('不限层：第 4 层的盗梦者也可以选，梦主不必同层', () => {
    const after = step(afterMasterMove(), 'pM', 'useFortressColdness', ['p4'], 2);
    expect(after.G.players.p4!.isAlive).toBe(false);
  });
});

describe('结算：与普通 SHOOT 走同一套，梦主是射手', () => {
  it('M4 卡宾枪生效：原始 2 → 1 击杀；原始 3 → 2 移动；原始 1 仍是 1 击杀', () => {
    const killed = step(afterMasterMove(), 'pM', 'useFortressColdness', ['p1'], 2);
    expect(killed.G.players.p1!.isAlive).toBe(false);
    expect(killed.G.lastShootRoll).toBe(2);

    const moved = step(afterMasterMove(), 'pM', 'useFortressColdness', ['p1'], 3);
    expect(moved.G.players.p1!.isAlive).toBe(true);
    expect(moved.G.players.p1!.currentLayer).toBe(2);

    const one = step(afterMasterMove(), 'pM', 'useFortressColdness', ['p1'], 1);
    expect(one.G.players.p1!.isAlive).toBe(false);
  });

  it('原始 6 → 5：躲过；梦主所在层、目标所在层都不变', () => {
    const m = afterMasterMove();
    const after = step(m, 'pM', 'useFortressColdness', ['p1'], 6);
    expect(after.G.players.p1!.isAlive).toBe(true);
    expect(after.G.players.p1!.currentLayer).toBe(1);
    expect(after.G.players.pM!.currentLayer).toBe(2);
  });

  it('击杀：被害者把 2 张手牌交给梦主', () => {
    const base = withPlayer(fortressScene(), 'p1', { hand: [KICK, SHOOT, KICK] });
    const m = afterMasterMove(base);
    const handBefore = m.G.players.pM!.hand.length;
    const after = step(m, 'pM', 'useFortressColdness', ['p1'], 2);
    expect(after.G.players.pM!.hand).toHaveLength(handBefore + 2);
  });

  it('没有实体牌：手牌、弃牌堆、出牌记录都不变', () => {
    const m = afterMasterMove();
    const after = step(m, 'pM', 'useFortressColdness', ['p1'], 3);
    expect(after.G.players.pM!.hand).toEqual(m.G.players.pM!.hand);
    expect(after.G.deck.discardPile).toEqual(m.G.deck.discardPile);
    expect(after.G.playedCardsThisTurn).toEqual(m.G.playedCardsThisTurn);
    expect(after.G.lastPlayedCardThisTurn).toBe(m.G.lastPlayedCardThisTurn);
  });

  it('命中移动：目标在第 1 层或第 4 层时自动移到唯一的相邻层', () => {
    const l1 = step(afterMasterMove(), 'pM', 'useFortressColdness', ['p1'], 3);
    expect(l1.G.players.p1!.currentLayer).toBe(2);
    const l4 = step(afterMasterMove(), 'pM', 'useFortressColdness', ['p4'], 3);
    expect(l4.G.players.p4!.currentLayer).toBe(3);
  });

  it.each([
    ['p2', 2, [1, 3]],
    ['p3', 3, [2, 4]],
  ] as const)('命中移动：目标在第 %s 层挂起选层，由梦主决定去向', (target, _layer, choices) => {
    let m = afterMasterMove();
    m = step(m, 'pM', 'useFortressColdness', [target], 3);
    expect(m.G.pendingShootMove).toMatchObject({
      shooterID: 'pM',
      targetPlayerID: target,
      cardId: null,
      choices,
    });
    // 目标不能替梦主选
    expect(isRejected(m, target, 'resolveShootMove', [choices[0]])).toBe(true);
    m = step(m, 'pM', 'resolveShootMove', [choices[1]]);
    expect(m.G.players[target]!.currentLayer).toBe(choices[1]);
    expect(m.G.pendingShootMove ?? null).toBeNull();
  });

  it('击杀触发白羊·星尘：被害者所在层有未翻开的梦魇时挂起白羊的选择', () => {
    const base = withPlayer(withNightmare(fortressScene(), 2), 'p3', {
      characterId: c('thief_aries'),
    });
    const m = afterMasterMove(base);
    const after = step(m, 'pM', 'useFortressColdness', ['p2'], 2);
    expect(after.G.players.p2!.isAlive).toBe(false);
    expect(after.G.pendingAriesChoice).toMatchObject({
      ariesID: 'p3',
      victimID: 'p2',
      victimLayer: 2,
    });
  });
});

describe('目标是可闪避的双鱼：先开应答窗口，重入后仍按梦主射手结算', () => {
  const pisces = c('thief_pisces');

  it('先挂起应答窗口，只有双鱼能答；放弃闪避后 M4 照常生效', () => {
    const base = withPlayer(fortressScene(), 'p2', { characterId: pisces });
    let m = step(afterMasterMove(base), 'pM', 'useFortressColdness', ['p2']);
    expect(m.G.pendingShootResponse).toMatchObject({
      shooterID: 'pM',
      targetPlayerID: 'p2',
      cardId: null,
      skill: 'fortress_coldness',
      responseType: 'pisces',
    });
    // 窗口开着，梦主已记一次发动，不能再发动，也不能替双鱼答
    expect(isRejected(m, 'pM', 'useFortressColdness', ['p1'])).toBe(true);
    expect(isRejected(m, 'pM', 'respondShootPass', [])).toBe(true);

    m = step(m, 'p2', 'respondShootPass', [], 2);
    expect(m.G.pendingShootResponse).toBeNull();
    expect(m.G.players.p2!.isAlive).toBe(false);
  });

  it('双鱼闪避：移到下一层并翻面，没有牌可弃', () => {
    const base = withPlayer(fortressScene(), 'p2', { characterId: pisces });
    let m = step(afterMasterMove(base), 'pM', 'useFortressColdness', ['p2']);
    const discardBefore = m.G.deck.discardPile.length;
    m = step(m, 'p2', 'respondShootEvade', []);
    expect(m.G.pendingShootResponse).toBeNull();
    expect(m.G.players.p2!.isAlive).toBe(true);
    expect(m.G.players.p2!.currentLayer).toBe(1);
    expect(m.G.deck.discardPile).toHaveLength(discardBefore);
    expect(m.G.players.pM!.hand).toEqual([SHOOT, KICK]);
  });
});

describe('信息可见性', () => {
  it('发动机会计数只给梦主本人看到，别人看到的技能记录为 null', () => {
    const m = afterMasterMove();
    const opts = { gameOver: false } as const;
    const own = viewFor(m.G, 'pM', opts);
    expect(own.players.pM!.skillUsedThisTurn?.[FORTRESS_COLDNESS_CHANCES_KEY]).toBe(1);
    expect(viewFor(m.G, 'p1', opts).players.pM!.skillUsedThisTurn).toBeNull();
    expect(viewFor(m.G, null, opts).players.pM!.skillUsedThisTurn).toBeNull();
  });

  it('应答窗口里的技能来源对所有人公开，没有实体牌', () => {
    const base = withPlayer(fortressScene(), 'p2', { characterId: c('thief_pisces') });
    const m = step(afterMasterMove(base), 'pM', 'useFortressColdness', ['p2']);
    for (const viewer of ['pM', 'p2', 'p3', null]) {
      const view = viewFor(m.G, viewer, { gameOver: false }).pendingShootResponse;
      expect(view).toMatchObject({ skill: 'fortress_coldness', cardId: null });
    }
    // 目标身份（双鱼）仍只有目标本人看得到：响应类型对其他人遮住
    expect(viewFor(m.G, 'p3', { gameOver: false }).pendingShootResponse!.responseType).toBeNull();
  });
});

describe('状态不变量', () => {
  it('没有实体牌当且仅当技能来源是哈雷或要塞：要塞来源配了牌、普通出牌没有牌都会被报出', () => {
    const base = withPlayer(fortressScene(), 'p2', { characterId: c('thief_pisces') });
    const m = step(afterMasterMove(base), 'pM', 'useFortressColdness', ['p2']);
    const pending = m.G.pendingShootResponse!;
    expect(checkStateInvariants(m.G)).toEqual([]);
    const withCard = { ...m.G, pendingShootResponse: { ...pending, cardId: SHOOT as CardID } };
    expect(checkStateInvariants(withCard).length).toBeGreaterThan(0);
    const noSkill = { ...m.G, pendingShootResponse: { ...pending, skill: undefined } };
    expect(checkStateInvariants(noSkill).length).toBeGreaterThan(0);
  });
});
