import { describe, it, expect } from 'vitest';
import type { MineAwaited } from '../response/awaitedResponse';
import { awaitedCopy } from './awaitedCopy';

const deps = {
  nicknameOf: (id: string) => `玩家${id}`,
  cardNameOf: (id: string) => `牌:${id}`,
};

describe('awaitedCopy', () => {
  it('SHOOT 响应：说明里带发动者与牌名；双鱼不能闪避时给出原因', () => {
    const can: MineAwaited = {
      mine: true,
      kind: 'shoot-evade',
      shooterID: '2',
      cardId: 'action_shoot',
      canEvade: true,
      evadeLayer: 1,
    };
    expect(awaitedCopy(can, deps)).toEqual({
      titleKey: 'awaited.shootEvade.title',
      bodyKey: 'awaited.shootEvade.body',
      bodyParams: { name: '玩家2', card: '牌:action_shoot' },
      notes: [],
    });
    const cannot = awaitedCopy({ ...can, canEvade: false, evadeLayer: null }, deps);
    expect(cannot.notes).toEqual([{ key: 'awaited.shootEvade.cannot' }]);
  });

  it('哈雷·冲击没有实体牌：改用不带牌名的说明', () => {
    const copy = awaitedCopy(
      {
        mine: true,
        kind: 'shoot-evade',
        shooterID: '2',
        cardId: null,
        canEvade: true,
        evadeLayer: 1,
      },
      deps,
    );
    expect(copy.bodyKey).toBe('awaited.shootEvade.bodyNoCard');
    expect(copy.bodyParams).toEqual({ name: '玩家2', card: 'SHOOT' });
  });

  it('狂热没有手牌时提示无牌可弃', () => {
    const copy = awaitedCopy(
      { mine: true, kind: 'shoot-zealot', shooterID: '1', cardId: 'a', hand: [] },
      deps,
    );
    expect(copy.notes).toEqual([{ key: 'awaited.zealot.noHand' }]);
  });

  it('天秤分牌与挑牌：说明里是对方昵称', () => {
    expect(
      awaitedCopy({ mine: true, kind: 'libra-split', bonderID: '3', hand: ['x'] }, deps).bodyParams,
    ).toEqual({ name: '玩家3' });
    expect(
      awaitedCopy({ mine: true, kind: 'libra-pick', targetID: '4', pile1: [], pile2: [] }, deps)
        .bodyParams,
    ).toEqual({ name: '玩家4' });
  });

  it('处女：已死亡与没有可复活者各自给出提示', () => {
    const base = {
      mine: true,
      kind: 'virgo',
      triggerRoll: 6,
      shooterID: '1',
      alive: true,
      reviveTargets: [] as string[],
      teleportLayers: [1, 2, 3, 4],
    } as const;
    expect(awaitedCopy(base, deps).notes).toEqual([{ key: 'awaited.virgo.noRevive' }]);
    expect(awaitedCopy({ ...base, alive: false }, deps).notes).toEqual([
      { key: 'awaited.virgo.dead' },
    ]);
    expect(awaitedCopy({ ...base, reviveTargets: ['2'] }, deps).notes).toEqual([]);
    expect(awaitedCopy(base, deps).bodyParams).toEqual({ roll: 6 });
  });

  it('白羊：写出梦魇名称；邪念瘟疫另有说明；看不到梦魇时给出原因', () => {
    const base = {
      mine: true,
      kind: 'aries',
      victimID: '2',
      victimLayer: 3,
      nightmareId: 'nightmare_plague',
      params: 'plague',
      candidates: [],
      bribePoolCount: 0,
    } as const;
    const copy = awaitedCopy(base, deps);
    expect(copy.bodyParams).toEqual({ name: '玩家2', layer: 3 });
    expect(copy.notes.map((n) => n.key)).toEqual([
      'awaited.aries.nightmare',
      'awaited.aries.plague',
      'awaited.aries.scope',
    ]);
    expect(copy.notes[0]!.params).toEqual({ name: '牌:nightmare_plague' });
    expect(
      awaitedCopy({ ...base, nightmareId: null, params: 'none' }, deps).notes.map((n) => n.key),
    ).toEqual(['awaited.aries.unknown', 'awaited.aries.scope']);
  });

  it('意念判官：说明里是目标昵称与牌名', () => {
    const copy = awaitedCopy(
      {
        mine: true,
        kind: 'sudger',
        targetID: '5',
        cardId: 'action_shoot',
        rolls: [
          { pick: 'A', roll: 1, result: 'kill' },
          { pick: 'B', roll: 2, result: 'move' },
        ],
      },
      deps,
    );
    expect(copy.bodyParams).toEqual({ name: '玩家5', card: '牌:action_shoot' });
  });

  it('黑洞·吞噬：说明里带黑洞的昵称；没有手牌时提示无牌可交', () => {
    const copy = awaitedCopy({ mine: true, kind: 'levy', blackHoleID: '3', hand: ['a'] }, deps);
    expect(copy).toEqual({
      titleKey: 'awaited.levy.title',
      bodyKey: 'awaited.levy.body',
      bodyParams: { name: '玩家3' },
      notes: [],
    });
    expect(
      awaitedCopy({ mine: true, kind: 'levy', blackHoleID: '3', hand: [] }, deps).notes,
    ).toEqual([{ key: 'awaited.levy.noHand' }]);
  });

  it('达尔文·淘汰：固定文案，没有参数', () => {
    expect(awaitedCopy({ mine: true, kind: 'darwin', hand: ['a', 'b'] }, deps)).toEqual({
      titleKey: 'awaited.darwin.title',
      bodyKey: 'awaited.darwin.body',
      bodyParams: {},
      notes: [],
    });
  });

  it('雅典娜·急智：说明里带出牌者与那张牌的名字', () => {
    const copy = awaitedCopy(
      { mine: true, kind: 'athena', userID: '1', cardId: 'action_kick', discard: ['x'] },
      deps,
    );
    expect(copy).toEqual({
      titleKey: 'awaited.athena.title',
      bodyKey: 'awaited.athena.body',
      bodyParams: { name: '玩家1', card: '牌:action_kick' },
      notes: [],
    });
  });

  it('土星·律令：说明里带出牌者与牌名；没有同名牌时给出原因', () => {
    const base: MineAwaited = {
      mine: true,
      kind: 'saturn',
      userID: '2',
      cardId: 'action_kick',
      hand: ['action_kick', 'action_shoot'],
      matches: [0],
    };
    expect(awaitedCopy(base, deps)).toEqual({
      titleKey: 'awaited.saturn.title',
      bodyKey: 'awaited.saturn.body',
      bodyParams: { name: '玩家2', card: '牌:action_kick' },
      notes: [],
    });
    const none = awaitedCopy({ ...base, matches: [] }, deps);
    expect(none.notes).toEqual([{ key: 'awaited.saturn.noMatch' }]);
  });
});
