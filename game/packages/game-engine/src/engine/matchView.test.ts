// 白名单式对局视图：按字段表逐行断言「谁能看到什么」
// 对照：docs/manual/03-game-flow.md 贿赂（成败不对外公开）、docs/manual/06-dream-master.md 皇城、
//       docs/manual/04-action-cards.md 梦境窥视、docs/manual/08-appendix.md 背叛者的阵营不公开

import { describe, it, expect } from 'vitest';
import type { CardID, Faction } from '@icgame/shared';
import { InceptionCityGame } from '../game.js';
import type { PlayerSetup, SetupState } from '../setup.js';
import { createMatch, viewMatch, type GameDef, type MatchState } from '../runner/matchRunner.js';
import { buildViewScene, IMPERIAL_CITY, startedMatch } from '../testing/viewScene.js';
import { FIELD_DISPOSITION, viewFor, type MatchView, type Viewer } from './matchView.js';

const OPEN = { gameOver: false };
const OVER = { gameOver: true };

const scene = buildViewScene();
const { G, master, a, b, c, d } = scene;

function patchPlayer(state: SetupState, id: string, patch: Partial<PlayerSetup>): SetupState {
  return { ...state, players: { ...state.players, [id]: { ...state.players[id]!, ...patch } } };
}

function asImperial(state: SetupState): SetupState {
  return patchPlayer(state, master, { characterId: IMPERIAL_CITY });
}

const v = (state: SetupState, viewer: Viewer, over = false): MatchView =>
  viewFor(state, viewer, over ? OVER : OPEN);

describe('对局视图 · 元信息与种子', () => {
  it('所有人都能看到公开的对局信息', () => {
    for (const viewer of [a, b, master, null]) {
      const view = v(G, viewer);
      expect(view.matchId).toBe(G.matchId);
      expect(view.schemaVersion).toBe(G.schemaVersion);
      expect(view.phase).toBe(G.phase);
      expect(view.turnPhase).toBe('action');
      expect(view.turnNumber).toBe(G.turnNumber);
      expect(view.currentPlayerID).toBe(a);
      expect(view.dreamMasterID).toBe(master);
      expect(view.playerOrder).toEqual(G.playerOrder);
      expect(view.ruleVariant).toBe(G.ruleVariant);
      expect(view.exCardsEnabled).toBe(G.exCardsEnabled);
      expect(view.expansionEnabled).toBe(G.expansionEnabled);
    }
  });

  it('任何观察者、任何时候都拿不到随机种子；对局结束后也一样', () => {
    for (const over of [false, true]) {
      for (const viewer of [a, master, null]) {
        const json = JSON.stringify(v(G, viewer, over));
        expect(json).not.toContain(G.rngSeed);
        expect(json).not.toContain('rngSeed');
        expect(Object.keys(v(G, viewer, over))).not.toContain('rngSeed');
      }
    }
  });

  it('不在对局里的字符串按旁观者处理，字节上与 null 完全一致', () => {
    const spectator = JSON.stringify(v(G, null));
    for (const stranger of ['nobody', '', '__proto__', 'constructor', 'toString']) {
      expect(JSON.stringify(v(G, stranger))).toBe(spectator);
    }
  });

  it('视图不会改动传入的状态，也不与状态共用可变对象', () => {
    const before = JSON.stringify(G);
    const view = v(G, a);
    expect(JSON.stringify(G)).toBe(before);
    view.playerOrder.push('x');
    view.players[a]!.hand!.push('x' as CardID);
    view.deck.discardPile.push('x' as CardID);
    expect(JSON.stringify(G)).toBe(before);
  });
});

describe('对局视图 · 玩家', () => {
  it('公开状态所有人可见：昵称、存活、所在层、是否翻开、是否 Bot、手牌张数、贿赂牌数量', () => {
    const state = patchPlayer(G, c, { type: 'bot', isAlive: false, deathTurn: 3 });
    for (const viewer of [a, b, master, null]) {
      const p = v(state, viewer).players[c]!;
      expect(p.id).toBe(c);
      expect(p.nickname).toBe(G.players[c]!.nickname);
      expect(p.type).toBe('bot');
      expect(p.isAlive).toBe(false);
      expect(p.deathTurn).toBe(3);
      expect(p.currentLayer).toBe(G.players[c]!.currentLayer);
      expect(p.isRevealed).toBe(false);
      expect(p.handCount).toBe(2);
      expect(v(state, viewer).players[a]!.bribeReceived).toBe(1);
      expect(v(state, viewer).players[b]!.bribeReceived).toBe(1);
      expect(v(state, viewer).players[c]!.bribeReceived).toBe(0);
    }
  });

  it('手牌：本人看到牌，别人（含梦主、旁观者）只有张数', () => {
    expect(v(G, a).players[a]!.hand).toEqual(['action_shoot', 'action_kick', 'action_unlock']);
    expect(v(G, master).players[master]!.hand).toEqual(['action_dream_peek', 'action_kick']);
    for (const viewer of [b, master, null]) {
      const p = v(G, viewer).players[a]!;
      expect(p.hand).toBeNull();
      expect(p.handCount).toBe(3);
    }
    expect(v(G, a).players[master]!.hand).toBeNull();
  });

  it('对局结束后手牌全部公开', () => {
    const view = v(G, null, true);
    expect(view.players[a]!.hand).toEqual(['action_shoot', 'action_kick', 'action_unlock']);
    expect(view.players[d]!.hand).toHaveLength(4);
  });

  it('角色与阵营：本人看到真实值；别人看到的未翻开玩家角色为空、阵营是盗梦者（梦主也一样）', () => {
    // a 因成功的贿赂牌已经转为梦主阵营，但没有翻开
    expect(G.players[a]!.faction).toBe('master');
    const own = v(G, a).players[a]!;
    expect(own.characterId).toBe(G.players[a]!.characterId);
    expect(own.faction).toBe('master');
    for (const viewer of [b, master, null]) {
      const p = v(G, viewer).players[a]!;
      expect(p.characterId).toBeNull();
      expect(p.faction).toBe('thief' satisfies Faction);
      expect(p.isRevealed).toBe(false);
    }
    // 对皇城梦主也是一样
    expect(v(asImperial(G), master).players[a]!.faction).toBe('thief');
  });

  it('已翻开的玩家（开局翻开的梦主）所有人都能看到真实角色与阵营', () => {
    expect(G.players[master]!.isRevealed).toBe(true);
    for (const viewer of [a, b, null]) {
      const p = v(G, viewer).players[master]!;
      expect(p.characterId).toBe(G.players[master]!.characterId);
      expect(p.faction).toBe('master');
    }
  });

  it('玩家被翻开后，别人也能看到他的真实角色与阵营', () => {
    const revealed = patchPlayer(G, b, { isRevealed: true });
    const p = v(revealed, c).players[b]!;
    expect(p.characterId).toBe(G.players[b]!.characterId);
    expect(p.faction).toBe('thief');
  });

  it('对局结束后全部角色与阵营公开', () => {
    const view = v(G, null, true);
    expect(view.players[a]!.faction).toBe('master');
    expect(view.players[a]!.characterId).toBe(G.players[a]!.characterId);
    expect(view.players[c]!.characterId).toBe(G.players[c]!.characterId);
  });

  it('本回合 / 本局用过的技能只有本人看到，对局结束后公开', () => {
    expect(v(G, a).players[a]!.skillUsedThisTurn).toEqual({ [`skill-turn-${a}`]: 1 });
    expect(v(G, a).players[a]!.skillUsedThisGame).toEqual({ [`skill-game-${a}`]: 2 });
    for (const viewer of [b, master, null]) {
      expect(v(G, viewer).players[a]!.skillUsedThisTurn).toBeNull();
      expect(v(G, viewer).players[a]!.skillUsedThisGame).toBeNull();
    }
    expect(v(G, null, true).players[a]!.skillUsedThisGame).toEqual({ [`skill-game-${a}`]: 2 });
  });

  it('小丑·赌博的预设弃牌标记按「用过的技能」处理：只有本人和对局结束后可见', () => {
    const state = patchPlayer(G, a, { forcedDiscardArmedAtTurn: 4 });
    expect(v(state, a).players[a]!.forcedDiscardArmedAtTurn).toBe(4);
    for (const viewer of [b, master, null]) {
      expect(v(state, viewer).players[a]!.forcedDiscardArmedAtTurn).toBeNull();
    }
    expect(v(state, null, true).players[a]!.forcedDiscardArmedAtTurn).toBe(4);
  });
});

describe('对局视图 · 梦境层与梦魇', () => {
  it('层号、心锁、层里的玩家、梦魇是否翻开：所有人可见', () => {
    for (const viewer of [a, master, null]) {
      const view = v(G, viewer);
      for (const key of Object.keys(G.layers)) {
        const l = Number(key);
        expect(view.layers[l]!.layer).toBe(l);
        expect(view.layers[l]!.heartLockValue).toBe(G.layers[l]!.heartLockValue);
        expect(view.layers[l]!.playersInLayer).toEqual(G.layers[l]!.playersInLayer);
        expect(view.layers[l]!.nightmareRevealed).toBe(l === 3);
        expect(view.layers[l]!.nightmareTriggered).toBe(false);
      }
    }
  });

  it('未翻开的梦魇是哪张：只有梦主看到', () => {
    expect(v(G, master).layers[1]!.nightmareId).toBe('nightmare_space_fall');
    expect(v(G, master).layers[4]!.nightmareId).toBe('nightmare_echo');
    for (const viewer of [a, b, null]) {
      expect(v(G, viewer).layers[1]!.nightmareId).toBeNull();
      expect(v(G, viewer).layers[2]!.nightmareId).toBeNull();
      expect(v(G, viewer).layers[4]!.nightmareId).toBeNull();
    }
  });

  it('已翻开的梦魇所有人都能看到', () => {
    for (const viewer of [a, master, null]) {
      expect(v(G, viewer).layers[3]!.nightmareId).toBe('nightmare_hunger_bite');
    }
  });

  it('对局结束后所有梦魇公开', () => {
    expect(v(G, null, true).layers[1]!.nightmareId).toBe('nightmare_space_fall');
  });

  it('已用掉的梦魇：梦主看到全部，别人只有数量', () => {
    expect(v(G, master).usedNightmareIds).toEqual(['nightmare_plague', 'nightmare_vortex']);
    expect(v(G, master).usedNightmareCount).toBe(2);
    for (const viewer of [a, null]) {
      expect(v(G, viewer).usedNightmareIds).toBeNull();
      expect(v(G, viewer).usedNightmareCount).toBe(2);
    }
    expect(v(G, null, true).usedNightmareIds).toEqual(['nightmare_plague', 'nightmare_vortex']);
  });
});

describe('对局视图 · 金库', () => {
  it('标识、所在层、是否已开、谁开的：所有人可见', () => {
    const opened: SetupState = {
      ...G,
      vaults: G.vaults.map((vault, i) =>
        i === 0 ? { ...vault, isOpened: true, openedBy: b } : { ...vault },
      ),
    };
    for (const viewer of [a, master, null]) {
      const view = v(opened, viewer);
      expect(view.vaults.map((x) => x.id)).toEqual(G.vaults.map((x) => x.id));
      expect(view.vaults.map((x) => x.layer)).toEqual(G.vaults.map((x) => x.layer));
      expect(view.vaults[0]!.isOpened).toBe(true);
      expect(view.vaults[0]!.openedBy).toBe(b);
      expect(view.vaults[1]!.isOpened).toBe(false);
      expect(view.vaults[1]!.openedBy).toBeNull();
    }
  });

  it('已开的金库内容所有人可见', () => {
    const opened: SetupState = {
      ...G,
      vaults: G.vaults.map((vault, i) => (i === 0 ? { ...vault, isOpened: true } : { ...vault })),
    };
    for (const viewer of [a, master, null]) {
      expect(v(opened, viewer).vaults[0]!.contentType).toBe(G.vaults[0]!.contentType);
    }
  });

  it('未开的金库内容：梦主看到，盗梦者与旁观者看不到', () => {
    expect(v(G, master).vaults.map((x) => x.contentType)).toEqual(
      G.vaults.map((x) => x.contentType),
    );
    for (const viewer of [a, b, null]) {
      expect(v(G, viewer).vaults.every((x) => x.contentType === null)).toBe(true);
    }
  });

  it('梦境窥视（看金库）：看牌者只能看到被看的那一层，别人仍看不到', () => {
    const peeked = G.vaults[2]!;
    const state: SetupState = {
      ...G,
      peekReveal: { peekerID: b, revealKind: 'vault', vaultLayer: peeked.layer },
    };
    const own = v(state, b).vaults;
    for (const vault of own) {
      expect(vault.contentType).toBe(vault.layer === peeked.layer ? peeked.contentType : null);
    }
    for (const viewer of [a, c, null]) {
      expect(v(state, viewer).vaults.every((x) => x.contentType === null)).toBe(true);
    }
  });

  it('对局结束后金库内容全部公开', () => {
    expect(v(G, null, true).vaults.map((x) => x.contentType)).toEqual(
      G.vaults.map((x) => x.contentType),
    );
  });
});

describe('对局视图 · 贿赂池', () => {
  it('标识、是否还在池里、被谁持有：所有人可见，且不区分成败', () => {
    for (const viewer of [a, b, c, master, null]) {
      const pool = v(G, viewer).bribePool;
      expect(pool.map((x) => x.id)).toEqual(G.bribePool.map((x) => x.id));
      expect(pool.map((x) => x.status)).toEqual([
        'inPool',
        'inPool',
        'dispatched',
        'dispatched',
        'inPool',
        'inPool',
      ]);
      expect(pool.map((x) => x.heldBy)).toEqual([null, null, a, b, null, null]);
    }
  });

  it('公开状态不区分成败：成功 / 失败 / 碎裂三种已派出的状态对外都是「已派出」', () => {
    for (const status of ['deal', 'dealt', 'shattered'] as const) {
      const state: SetupState = {
        ...G,
        bribePool: G.bribePool.map((x) => (x.id === 'bribe-3' ? { ...x, status } : { ...x })),
      };
      for (const viewer of [c, master, null]) {
        expect(v(state, viewer).bribePool[3]!.status).toBe('dispatched');
      }
    }
  });

  it('持有者本人能看到自己持有的贿赂牌的成败，看不到别人的，也看不到池里的', () => {
    const own = v(G, a).bribePool;
    expect(own[2]!.kind).toBe('deal');
    expect(own[3]!.kind).toBeNull();
    expect(own.filter((x) => x.status === 'inPool').every((x) => x.kind === null)).toBe(true);
    const ownB = v(G, b).bribePool;
    expect(ownB[3]!.kind).toBe('fail');
    expect(ownB[2]!.kind).toBeNull();
  });

  it('普通梦主、其他盗梦者、旁观者都看不到任何一张贿赂牌的成败', () => {
    for (const viewer of [c, d, master, null]) {
      expect(v(G, viewer).bribePool.every((x) => x.kind === null)).toBe(true);
    }
  });

  it('「皇城」梦主能看到还在池里的牌的成败，但看不到已派出的', () => {
    const imperial = asImperial(G);
    const pool = v(imperial, master).bribePool;
    expect(pool.map((x) => x.kind)).toEqual(['deal', 'fail', null, null, 'deal', 'fail']);
    // 别人看不到，即使梦主是皇城
    for (const viewer of [a, c, null]) {
      expect(v(imperial, viewer).bribePool[0]!.kind).toBeNull();
    }
  });

  it('梦境窥视（梦主看贿赂牌）：梦主能看到被看那名玩家持有的牌，其他人仍看不到', () => {
    const state: SetupState = {
      ...G,
      peekReveal: { peekerID: master, revealKind: 'bribe', targetThiefID: b },
    };
    const pool = v(state, master).bribePool;
    expect(pool.map((x) => x.kind)).toEqual([null, null, null, 'fail', null, null]);
    for (const viewer of [a, b, c, null]) {
      const p = v(state, viewer).bribePool;
      // 持有者 b 看自己的牌是本来就有的权限；a 只能看自己的
      expect(p[3]!.kind).toBe(viewer === b ? 'fail' : null);
      expect(p[2]!.kind).toBe(viewer === a ? 'deal' : null);
    }
  });

  it('贿赂类的窥视不会让梦主以外的人看到牌，也不会让梦主看到别人持有的牌', () => {
    const state: SetupState = {
      ...G,
      peekReveal: { peekerID: master, revealKind: 'bribe', targetThiefID: b },
    };
    expect(v(state, master).bribePool[2]!.kind).toBeNull();
  });

  it('对局结束后所有贿赂牌的成败公开', () => {
    expect(v(G, null, true).bribePool.map((x) => x.kind)).toEqual(G.bribePool.map((x) => x.kind));
  });
});

describe('对局视图 · 牌库与公开牌区', () => {
  it('牌库只有张数，永远没有牌；对局结束后也一样', () => {
    for (const over of [false, true]) {
      for (const viewer of [a, master, null]) {
        const deck = v(G, viewer, over).deck;
        expect(deck.cardCount).toBe(G.deck.cards.length);
        expect(Object.keys(deck).sort()).toEqual(['cardCount', 'discardPile']);
      }
    }
  });

  it('弃牌堆、移出游戏的牌、本回合打出的牌、上一张打出的牌、上一次 SHOOT 骰值：所有人可见', () => {
    const state: SetupState = {
      ...G,
      deck: { cards: G.deck.cards, discardPile: ['action_kick', 'action_shoot'] },
      removedFromGame: ['action_time_storm'],
      playedCardsThisTurn: ['action_shoot', 'action_kick'],
      lastPlayedCardThisTurn: 'action_kick',
      lastShootRoll: 5,
    };
    for (const viewer of [a, master, null]) {
      const view = v(state, viewer);
      expect(view.deck.discardPile).toEqual(['action_kick', 'action_shoot']);
      expect(view.removedFromGame).toEqual(['action_time_storm']);
      expect(view.playedCardsThisTurn).toEqual(['action_shoot', 'action_kick']);
      expect(view.lastPlayedCardThisTurn).toBe('action_kick');
      expect(view.lastShootRoll).toBe(5);
    }
  });

  it('获胜方与原因所有人可见', () => {
    const state: SetupState = { ...G, winner: 'master', winReason: 'deck_exhausted', endTurn: 7 };
    for (const viewer of [a, null]) {
      const view = v(state, viewer, true);
      expect(view.winner).toBe('master');
      expect(view.winReason).toBe('deck_exhausted');
      expect(view.endTurn).toBe(7);
    }
  });
});

describe('对局视图 · 待结算', () => {
  const pending: SetupState = {
    ...G,
    unlockThisTurn: 1,
    maxUnlockPerTurn: 2,
    pendingUnlock: { playerID: a, layer: 1, cardId: 'action_unlock' },
    pendingGraft: { playerID: b },
    pendingResonance: { bonderPlayerID: a, targetPlayerID: c },
    pendingGravity: {
      bonderPlayerID: a,
      targetIds: [b, c],
      pool: ['action_shoot', 'action_kick', 'action_unlock'],
      pickOrder: [a, b, c],
      pickCursor: 1,
    },
    pendingResponseWindow: {
      sourceAbilityID: 'action_unlock_effect_1',
      sourceType: 'unlock',
      responders: [b, c],
      responded: [b],
      timeoutMs: 30000,
      validResponseAbilityIDs: ['action_unlock_effect_2'],
      onTimeout: 'resolve',
      parentWindow: {
        sourceAbilityID: 'outer',
        responders: [d],
        responded: [],
        timeoutMs: 1000,
        validResponseAbilityIDs: ['x'],
        onTimeout: 'cancel',
        parentWindow: null,
      },
    },
    pendingPeekDecision: { peekerID: b, targetLayer: 2 },
    peekReveal: { peekerID: c, revealKind: 'vault', vaultLayer: 4 },
    pendingSudgerRolls: {
      rollA: 2,
      rollB: 5,
      targetPlayerID: c,
      cardId: 'action_shoot',
      deathFaces: [1, 2],
      moveFaces: [3],
      extraOnMove: null,
    },
    pendingShootMove: {
      shooterID: a,
      targetPlayerID: c,
      cardId: 'action_shoot',
      extraOnMove: 'discard_shoots',
      choices: [1, 3],
    },
    mazeState: { mazedPlayerID: d, untilTurnNumber: 9 },
  };

  it('是谁的、在等谁、关于哪一层 / 哪张牌：所有人可见', () => {
    for (const viewer of [b, c, master, null]) {
      const view = v(pending, viewer);
      expect(view.unlockThisTurn).toBe(1);
      expect(view.maxUnlockPerTurn).toBe(2);
      expect(view.pendingUnlock).toEqual({ playerID: a, layer: 1, cardId: 'action_unlock' });
      expect(view.pendingGraft).toEqual({ playerID: b });
      expect(view.pendingResonance).toEqual({ bonderPlayerID: a, targetPlayerID: c });
      expect(view.pendingPeekDecision).toEqual({ peekerID: b, targetLayer: 2 });
      expect(view.pendingShootMove).toEqual({
        shooterID: a,
        targetPlayerID: c,
        cardId: 'action_shoot',
        extraOnMove: 'discard_shoots',
        choices: [1, 3],
      });
      expect(view.mazeState).toEqual({ mazedPlayerID: d, untilTurnNumber: 9 });
    }
  });

  it('响应窗口连同嵌套的父窗口一起可见', () => {
    const w = v(pending, null).pendingResponseWindow!;
    expect(w.sourceAbilityID).toBe('action_unlock_effect_1');
    expect(w.sourceType).toBe('unlock');
    expect(w.responders).toEqual([b, c]);
    expect(w.responded).toEqual([b]);
    expect(w.timeoutMs).toBe(30000);
    expect(w.validResponseAbilityIDs).toEqual(['action_unlock_effect_2']);
    expect(w.onTimeout).toBe('resolve');
    expect(w.parentWindow!.sourceAbilityID).toBe('outer');
    expect(w.parentWindow!.sourceType).toBeNull();
    expect(w.parentWindow!.parentWindow).toBeNull();
  });

  it('万有引力翻开的牌池、定罪的两个骰值：所有人可见', () => {
    for (const viewer of [b, master, null]) {
      const view = v(pending, viewer);
      expect(view.pendingGravity).toEqual({
        bonderPlayerID: a,
        targetIds: [b, c],
        pool: ['action_shoot', 'action_kick', 'action_unlock'],
        pickOrder: [a, b, c],
        pickCursor: 1,
      });
      expect(view.pendingSudgerRolls).toEqual({
        rollA: 2,
        rollB: 5,
        targetPlayerID: c,
        cardId: 'action_shoot',
        deathFaces: [1, 2],
        moveFaces: [3],
        extraOnMove: null,
      });
    }
  });

  it('梦境窥视：谁在看、看哪一层 / 哪个人，所有人可见', () => {
    const byThief: SetupState = {
      ...G,
      peekReveal: { peekerID: c, revealKind: 'vault', vaultLayer: 4 },
    };
    const byMaster: SetupState = {
      ...G,
      peekReveal: { peekerID: master, revealKind: 'bribe', targetThiefID: b },
    };
    for (const viewer of [a, d, null]) {
      expect(v(byThief, viewer).peekReveal).toEqual({
        peekerID: c,
        revealKind: 'vault',
        vaultLayer: 4,
      });
      expect(v(byMaster, viewer).peekReveal).toEqual({
        peekerID: master,
        revealKind: 'bribe',
        targetThiefID: b,
      });
    }
  });

  it('没有待结算时各字段都是 null', () => {
    const view = v(G, null);
    expect(view.pendingUnlock).toBeNull();
    expect(view.pendingGraft).toBeNull();
    expect(view.pendingResponseWindow).toBeNull();
    expect(view.pendingLibra).toBeNull();
    expect(view.pendingSudgerRolls).toBeNull();
    expect(view.pendingShootMove).toBeNull();
    expect(view.pendingShootResponse).toBeNull();
    expect(view.pendingAriesChoice).toBeNull();
    expect(view.pendingVirgoChoice).toBeNull();
    expect(view.mazeState).toBeNull();
    expect(view.shiftSnapshot).toBeNull();
  });

  it('白羊、处女、SHOOT 响应窗口：能暴露角色的字段只给本人（和对局结束后）', () => {
    const state: SetupState = {
      ...G,
      pendingAriesChoice: { ariesID: b, victimLayer: 2, victimID: c },
      pendingVirgoChoice: { virgoID: d, triggerRoll: 6, shooterID: a },
      pendingShootResponse: {
        shooterID: a,
        targetPlayerID: c,
        cardId: 'action_shoot',
        sameLayerRequired: true,
        deathFaces: [1],
        moveFaces: [2],
        extraOnMove: null,
        responseType: 'terrorist',
      },
    };
    expect(v(state, b).pendingAriesChoice).toEqual({ ariesID: b, victimLayer: 2, victimID: c });
    expect(v(state, d).pendingVirgoChoice).toEqual({ virgoID: d, triggerRoll: 6, shooterID: a });
    expect(v(state, c).pendingShootResponse!.responseType).toBe('terrorist');
    for (const viewer of [a, c, master, null]) {
      expect(v(state, viewer).pendingAriesChoice).toEqual({
        ariesID: null,
        victimLayer: 2,
        victimID: c,
      });
    }
    for (const viewer of [a, b, master, null]) {
      expect(v(state, viewer).pendingVirgoChoice!.virgoID).toBeNull();
      expect(v(state, viewer).pendingVirgoChoice!.triggerRoll).toBe(6);
    }
    for (const viewer of [a, b, master, null]) {
      const r = v(state, viewer).pendingShootResponse!;
      expect(r.responseType).toBeNull();
      expect(r.targetPlayerID).toBe(c);
      expect(r.shooterID).toBe(a);
    }
    expect(v(state, null, true).pendingAriesChoice!.ariesID).toBe(b);
    expect(v(state, null, true).pendingVirgoChoice!.virgoID).toBe(d);
    expect(v(state, null, true).pendingShootResponse!.responseType).toBe('terrorist');
  });

  it('SHOOT 响应窗口没有写明类型时，对本人按默认的双鱼处理', () => {
    const state: SetupState = {
      ...G,
      pendingShootResponse: {
        shooterID: a,
        targetPlayerID: c,
        cardId: 'action_shoot',
        sameLayerRequired: false,
        deathFaces: [],
        moveFaces: [],
        extraOnMove: null,
      },
    };
    expect(v(state, c).pendingShootResponse!.responseType).toBe('pisces');
    expect(v(state, c).pendingShootResponse!.decreeId).toBeNull();
    expect(v(state, c).pendingShootResponse!.preventMove).toBe(false);
  });
});

describe('对局视图 · 没有实体牌的 SHOOT（哈雷·冲击）', () => {
  const haleyWindow: SetupState = {
    ...G,
    pendingShootResponse: {
      shooterID: a,
      targetPlayerID: c,
      cardId: null,
      sameLayerRequired: false,
      deathFaces: [1],
      moveFaces: [2, 3, 4],
      extraOnMove: null,
      responseType: 'pisces',
      skill: 'haley_impact',
    },
    pendingShootMove: {
      shooterID: a,
      targetPlayerID: c,
      cardId: null,
      extraOnMove: null,
      choices: [1, 3],
    },
  };

  it('牌为 null 与技能来源原样给出；双鱼类型仍只给应答者', () => {
    for (const viewer of [a, b, c, master, null]) {
      const r = v(haleyWindow, viewer).pendingShootResponse!;
      expect(r.cardId).toBeNull();
      expect(r.skill).toBe('haley_impact');
      expect(r.responseType).toBe(viewer === c ? 'pisces' : null);
      expect(v(haleyWindow, viewer).pendingShootMove!.cardId).toBeNull();
    }
  });

  it('普通出牌的窗口没有技能来源', () => {
    const state: SetupState = {
      ...G,
      pendingShootResponse: {
        shooterID: a,
        targetPlayerID: c,
        cardId: 'action_shoot',
        sameLayerRequired: true,
        deathFaces: [1],
        moveFaces: [2],
        extraOnMove: null,
      },
    };
    expect(v(state, c).pendingShootResponse!.skill).toBeNull();
  });
});

describe('对局视图 · 天秤分出的两堆牌', () => {
  const split: SetupState = {
    ...G,
    pendingLibra: {
      bonderPlayerID: a,
      targetPlayerID: c,
      split: { pile1: ['action_shoot', 'action_kick'], pile2: ['action_unlock'] },
    },
  };

  it('发动者和被要求分牌的人看到两堆的内容', () => {
    for (const viewer of [a, c]) {
      expect(v(split, viewer).pendingLibra).toEqual({
        bonderPlayerID: a,
        targetPlayerID: c,
        split: {
          pile1: ['action_shoot', 'action_kick'],
          pile2: ['action_unlock'],
          pile1Count: 2,
          pile2Count: 1,
        },
      });
    }
  });

  it('别人（含梦主、旁观者）只看到两堆的张数', () => {
    for (const viewer of [b, d, master, null]) {
      expect(v(split, viewer).pendingLibra).toEqual({
        bonderPlayerID: a,
        targetPlayerID: c,
        split: { pile1: null, pile2: null, pile1Count: 2, pile2Count: 1 },
      });
    }
  });

  it('还没分牌时没有 split；对局结束后全部公开', () => {
    const notYet: SetupState = {
      ...G,
      pendingLibra: { bonderPlayerID: a, targetPlayerID: c, split: null },
    };
    expect(v(notYet, b).pendingLibra).toEqual({
      bonderPlayerID: a,
      targetPlayerID: c,
      split: null,
    });
    expect(v(split, null, true).pendingLibra!.split!.pile1).toEqual([
      'action_shoot',
      'action_kick',
    ]);
  });
});

describe('对局视图 · 移形换影的角色快照', () => {
  const snapshot: SetupState = {
    ...G,
    players: { ...G.players, [d]: { ...G.players[d]!, isRevealed: true } },
    shiftSnapshot: {
      [master]: G.players[master]!.characterId,
      [a]: G.players[a]!.characterId,
      [b]: G.players[b]!.characterId,
      [c]: G.players[c]!.characterId,
      [d]: G.players[d]!.characterId,
    },
  };

  it('只保留已翻开玩家和本人的条目', () => {
    const forB = v(snapshot, b).shiftSnapshot!;
    expect(Object.keys(forB).sort()).toEqual([master, b, d].sort());
    expect(forB[b]).toBe(G.players[b]!.characterId);
    const forSpectator = v(snapshot, null).shiftSnapshot!;
    expect(Object.keys(forSpectator).sort()).toEqual([master, d].sort());
    const forMaster = v(snapshot, master).shiftSnapshot!;
    expect(Object.keys(forMaster).sort()).toEqual([master, d].sort());
  });

  it('已翻开玩家换牌前的角色此刻在未翻开的别人身上时，该条目不给无关观察者', () => {
    // d 已翻开，他换牌前的角色现在在未翻开的 a 手上
    const swapped: SetupState = {
      ...snapshot,
      shiftSnapshot: { [d]: G.players[a]!.characterId },
    };
    expect(v(swapped, b).shiftSnapshot).toEqual({});
    expect(v(swapped, null).shiftSnapshot).toEqual({});
    // 持有者本人与对局结束后的视图不受影响
    expect(Object.keys(v(swapped, a).shiftSnapshot!)).toEqual([d]);
    expect(Object.keys(v(swapped, null, true).shiftSnapshot!)).toEqual([d]);
  });

  it('对局结束后全部公开', () => {
    expect(Object.keys(v(snapshot, null, true).shiftSnapshot!).sort()).toEqual(
      [master, a, b, c, d].sort(),
    );
  });
});

describe('对局视图 · 对局结束后', () => {
  it('旁观者看到真实的手牌、角色、阵营、金库内容、贿赂牌成败、梦魇，但仍没有种子和牌库顺序', () => {
    const view = v(asImperial(G), null, true);
    expect(view.gameOver).toBe(true);
    expect(view.players[a]!.hand).not.toBeNull();
    expect(view.players[a]!.characterId).not.toBeNull();
    expect(view.players[a]!.faction).toBe('master');
    expect(view.vaults.every((x) => x.contentType !== null)).toBe(true);
    expect(view.bribePool.every((x) => x.kind !== null)).toBe(true);
    expect(Object.values(view.layers).every((l) => l.nightmareId !== null)).toBe(true);
    expect(view.usedNightmareIds).not.toBeNull();
    const json = JSON.stringify(view);
    expect(json).not.toContain(G.rngSeed);
    expect(Object.keys(view.deck).sort()).toEqual(['cardCount', 'discardPile']);
  });

  it('对局进行中 gameOver 为 false', () => {
    expect(v(G, null).gameOver).toBe(false);
  });
});

describe('对局视图 · 字段白名单', () => {
  const real = startedMatch(6, 'whitelist').G;

  it('状态里的每个顶层字段都有明确的处置，没有遗漏也没有多余', () => {
    expect(Object.keys(real).sort()).toEqual(Object.keys(FIELD_DISPOSITION).sort());
  });

  it('标为「不进视图」的字段不会出现在任何观察者的视图里', () => {
    const withheld = Object.entries(FIELD_DISPOSITION)
      .filter(([, how]) => how === 'withheld')
      .map(([key]) => key);
    expect(withheld.sort()).toEqual(['moveCounter', 'rngSeed']);
    for (const viewer of [null, real.dreamMasterID]) {
      for (const over of [false, true]) {
        const keys = Object.keys(v(real, viewer, over));
        for (const key of withheld) expect(keys).not.toContain(key);
      }
    }
  });

  it('视图的顶层字段恰好是白名单：状态里除不进视图的字段之外的全部，加上视图自己的派生字段', () => {
    const expected = Object.entries(FIELD_DISPOSITION)
      .filter(([, how]) => how !== 'withheld')
      .map(([key]) => key)
      .concat(['gameOver', 'usedNightmareCount']);
    expect(Object.keys(v(real, null)).sort()).toEqual(expected.sort());
  });

  it('状态里以后多出来的未知字段不会进视图', () => {
    const extra = { ...real, futureSecret: 'leak-me', moveCounter: 123 } as SetupState;
    for (const viewer of [null, real.dreamMasterID, real.playerOrder[1]!]) {
      const json = JSON.stringify(v(extra, viewer, true));
      expect(json).not.toContain('leak-me');
      expect(json).not.toContain('futureSecret');
    }
  });

  it('玩家、层、金库、贿赂牌对象里以后多出来的未知字段也不会进视图', () => {
    const id = real.playerOrder[1]!;
    const polluted = {
      ...real,
      players: { ...real.players, [id]: { ...real.players[id]!, secretNote: 'leak-player' } },
      layers: { ...real.layers, 1: { ...real.layers[1]!, secretNote: 'leak-layer' } },
      vaults: real.vaults.map((x) => ({ ...x, secretNote: 'leak-vault' })),
      bribePool: real.bribePool.map((x) => ({ ...x, secretNote: 'leak-bribe' })),
    } as SetupState;
    for (const viewer of [null, real.dreamMasterID, id]) {
      const json = JSON.stringify(v(polluted, viewer, true));
      expect(json).not.toContain('leak-');
    }
  });
});

describe('对局视图 · 运行器的 viewMatch', () => {
  const base: GameDef<SetupState> = InceptionCityGame;

  it('引擎定义挂了视图钩子，viewMatch 返回视图，且永远没有 rngState', () => {
    const state = startedMatch(5, 'view-match');
    for (const viewer of [null, '0', state.G.dreamMasterID]) {
      const out = viewMatch(base, state, viewer);
      expect(Object.keys(out).sort()).toEqual(['G', 'ctx', 'stateID']);
      expect(JSON.stringify(out)).not.toContain('rngState');
      expect(JSON.stringify(out)).not.toContain(state.G.rngSeed);
      expect(out.stateID).toBe(state.stateID);
      expect(out.ctx.currentPlayer).toBe(state.ctx.currentPlayer);
      expect((out.G as MatchView).gameOver).toBe(false);
    }
  });

  it('钩子收到观察者和 ctx；对局结束的标记取自 ctx.gameover', () => {
    const state = startedMatch(5, 'view-match-over');
    const calls: { viewer: string | null; gameover: unknown }[] = [];
    const spy: GameDef<SetupState> = {
      ...base,
      view: ({ G: g, ctx, viewer }) => {
        calls.push({ viewer, gameover: ctx.gameover });
        return viewFor(g, viewer, { gameOver: ctx.gameover !== undefined });
      },
    };
    viewMatch(spy, state, '1');
    const over: MatchState<SetupState> = {
      ...state,
      ctx: { ...state.ctx, gameover: { winner: 'thief', reason: 'x' } },
    };
    const out = viewMatch(spy, over, null);
    expect(calls.map((x) => x.viewer)).toEqual(['1', null]);
    expect((out.G as MatchView).gameOver).toBe(true);
    expect(out.ctx.gameover).toEqual({ winner: 'thief', reason: 'x' });
    // 引擎自带的钩子取同一个标记
    expect((viewMatch(base, over, null).G as MatchView).gameOver).toBe(true);
  });

  it('没有视图钩子时返回完整的 G，同样不带 rngState', () => {
    const state = startedMatch(4, 'no-hook');
    const withoutHook = Object.fromEntries(
      Object.entries(base).filter(([key]) => key !== 'view'),
    ) as unknown as GameDef<SetupState>;
    const out = viewMatch(withoutHook, state, '0');
    expect(out.G).toEqual(state.G);
    expect(Object.keys(out).sort()).toEqual(['G', 'ctx', 'stateID']);
    expect(JSON.stringify(out)).not.toContain('rngState');
  });

  it('观察者不是字符串或 null 时按旁观者处理（失败时关闭，不返回完整状态）', () => {
    const state = startedMatch(4, 'bad-viewer');
    const spectator = JSON.stringify(viewMatch(base, state, null));
    expect(JSON.stringify(viewMatch(base, state, undefined as never))).toBe(spectator);
    expect(JSON.stringify(viewMatch(base, state, 7 as never))).toBe(spectator);
  });

  it('直接调用钩子且不传 viewer：得到旁观者视图，没有种子，手牌为 null', () => {
    const state = startedMatch(4, 'no-viewer');
    const hook = base.view as unknown as (args: object) => MatchView;
    const out = hook({ G: state.G, ctx: state.ctx });
    expect(JSON.stringify(out)).not.toContain(state.G.rngSeed);
    expect(JSON.stringify(out)).toBe(JSON.stringify(viewFor(state.G, null, { gameOver: false })));
    for (const id of state.G.playerOrder) expect(out.players[id]!.hand).toBeNull();
  });

  it('新建的对局（开局布置前）也能取视图', () => {
    const created = createMatch(base, { numPlayers: 5, setupData: { rngSeed: 's' }, seed: 's' });
    const out = viewMatch(base, created, null);
    expect((out.G as MatchView).phase).toBe('setup');
  });
});
