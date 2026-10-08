import { describe, it, expect } from 'vitest';
import {
  MASTER_FREE_MOVE_KEY as ENGINE_FREE_MOVE_KEY,
  REVIVED_SELF_THIS_TURN_KEY as ENGINE_REVIVED_SELF_KEY,
} from '@icgame/game-engine';
import {
  MASTER_FREE_MOVE_KEY as CLIENT_FREE_MOVE_KEY,
  REVIVED_SELF_KEY as CLIENT_REVIVED_SELF_KEY,
  adjacentLayers,
  canConfirmRevive,
  deriveDockEntries,
  entryTestId,
  isSecretPassageActive,
  reviveArgs,
  reviveCardEligible,
  reviveRequirement,
  reviveTargetIds,
  type DockEntriesInput,
  type EntryPlayer,
} from './dockEntries';

const TRANSIT = 'action_dream_transit';
const KICK = 'action_kick';
const SHOOT = 'action_shoot';

function player(over: Partial<EntryPlayer> = {}): EntryPlayer {
  return { isAlive: true, currentLayer: 2, nickname: 'x', characterId: null, ...over };
}

/** 本人 p1（盗梦者）、p2 盗梦者、pM 梦主 */
function input(over: Partial<DockEntriesInput> = {}): DockEntriesInput {
  return {
    seat: 'p1',
    dreamMasterID: 'pM',
    players: {
      p1: player(),
      p2: player(),
      pM: player({ characterId: 'dm_neptune_ocean' }),
    },
    hand: [SHOOT, KICK, TRANSIT],
    isMyTurn: true,
    turnPhase: 'action',
    winner: null,
    busy: false,
    ...over,
  };
}

describe('与引擎的键对账', () => {
  it('梦主免费移动的计数键、复活自己的标记键与引擎一致', () => {
    expect(CLIENT_FREE_MOVE_KEY).toBe(ENGINE_FREE_MOVE_KEY);
    expect(CLIENT_REVIVED_SELF_KEY).toBe(ENGINE_REVIVED_SELF_KEY);
  });
});

describe('复活的代价与可选的牌', () => {
  it('基础规则弃 2 张任意手牌；密道世界观只弃 1 张梦境穿梭剂', () => {
    expect(reviveRequirement(false)).toEqual({ count: 2, onlyTransit: false });
    expect(reviveRequirement(true)).toEqual({ count: 1, onlyTransit: true });
  });

  it('密道世界观下只有梦境穿梭剂可选', () => {
    expect(reviveCardEligible(KICK, false)).toBe(true);
    expect(reviveCardEligible(KICK, true)).toBe(false);
    expect(reviveCardEligible(TRANSIT, true)).toBe(true);
  });

  it('梦主是密道才算世界观生效', () => {
    const players = { pM: player({ characterId: 'dm_secret_passage' }), p1: player() };
    expect(isSecretPassageActive(players, 'pM')).toBe(true);
    expect(
      isSecretPassageActive({ ...players, pM: player({ characterId: 'dm_chess' }) }, 'pM'),
    ).toBe(false);
    expect(isSecretPassageActive({ p1: player() }, 'pM')).toBe(false);
  });
});

describe('可复活的对象', () => {
  it('只列其他已死亡的玩家（含梦主，引擎不拒），不含自己与存活者', () => {
    const players = {
      p1: player(),
      p2: player({ isAlive: false, currentLayer: 0 }),
      p3: player(),
      p4: player({ isAlive: false, currentLayer: 0 }),
      pM: player({ isAlive: false, currentLayer: 0 }),
    };
    expect(reviveTargetIds(players, 'p1')).toEqual(['p2', 'p4', 'pM']);
  });
});

describe('底部坞入口 · 复活（本人在迷失层）', () => {
  const dead = (over: Partial<DockEntriesInput> = {}) =>
    input({
      players: {
        p1: player({ isAlive: false, currentLayer: 0 }),
        p2: player(),
        pM: player({ characterId: 'dm_neptune_ocean' }),
      },
      ...over,
    });

  it('自己回合的出牌阶段，手牌够 2 张：出现「复活」且可用', () => {
    const entries = deriveDockEntries(dead());
    expect(entries).toEqual([{ kind: 'reviveSelf', enabled: true, reason: null }]);
  });

  it('手牌不够 2 张：入口仍在，但禁用并说明差几张', () => {
    const [e] = deriveDockEntries(dead({ hand: [KICK] }));
    expect(e).toMatchObject({ kind: 'reviveSelf', enabled: false });
    expect(e!.reason).toEqual({ key: 'entries.reason.handShort', params: { count: 2, have: 1 } });
  });

  it('密道世界观：手里没有梦境穿梭剂就禁用，有就可用', () => {
    const passage = {
      p1: player({ isAlive: false, currentLayer: 0 }),
      pM: player({ characterId: 'dm_secret_passage' }),
    };
    const none = deriveDockEntries(dead({ players: passage, hand: [KICK, SHOOT, KICK] }));
    expect(none[0]).toMatchObject({ kind: 'reviveSelf', enabled: false });
    expect(none[0]!.reason).toEqual({ key: 'entries.reason.transitShort' });
    const has = deriveDockEntries(dead({ players: passage, hand: [KICK, TRANSIT] }));
    expect(has[0]).toMatchObject({ kind: 'reviveSelf', enabled: true });
  });

  it('有别的待办占着界面：禁用并说明', () => {
    const [e] = deriveDockEntries(dead({ busy: true }));
    expect(e).toMatchObject({ enabled: false });
    expect(e!.reason).toEqual({ key: 'entries.reason.busy' });
  });

  it('不在自己的回合 / 弃牌阶段 / 对局已结束：没有复活入口', () => {
    expect(deriveDockEntries(dead({ isMyTurn: false }))).toEqual([]);
    expect(deriveDockEntries(dead({ turnPhase: 'discard' }))).toEqual([]);
    expect(deriveDockEntries(dead({ winner: 'thief' }))).toEqual([]);
    // 抽牌阶段不能复活，只有略过抽牌的入口
    expect(deriveDockEntries(dead({ turnPhase: 'draw' })).map((e) => e.kind)).toEqual(['skipDraw']);
  });

  it('迷失层里不会同时出现「复活同伴」', () => {
    const kinds = deriveDockEntries(
      dead({
        players: {
          p1: player({ isAlive: false, currentLayer: 0 }),
          p2: player({ isAlive: false, currentLayer: 0 }),
          pM: player(),
        },
      }),
    ).map((e) => e.kind);
    expect(kinds).toEqual(['reviveSelf']);
  });
});

describe('底部坞入口 · 复活同伴（本人存活）', () => {
  const withDeadMate = (over: Partial<DockEntriesInput> = {}) =>
    input({
      players: {
        p1: player(),
        p2: player({ isAlive: false, currentLayer: 0 }),
        pM: player({ characterId: 'dm_neptune_ocean' }),
      },
      ...over,
    });

  it('场上有人在迷失层且手牌够：出现「复活同伴」', () => {
    expect(deriveDockEntries(withDeadMate())).toEqual([
      { kind: 'reviveOther', enabled: true, reason: null },
    ]);
  });

  it('场上没人在迷失层：没有入口', () => {
    expect(deriveDockEntries(input())).toEqual([]);
  });

  it('手牌不够：禁用并说明', () => {
    const [e] = deriveDockEntries(withDeadMate({ hand: [KICK] }));
    expect(e).toMatchObject({ kind: 'reviveOther', enabled: false });
    expect(e!.reason).toEqual({ key: 'entries.reason.handShort', params: { count: 2, have: 1 } });
  });
});

describe('底部坞入口 · 梦主的移动', () => {
  const asMaster = (over: Partial<DockEntriesInput> = {}) => input({ seat: 'pM', ...over });

  it('梦主自己回合的出牌阶段、本回合没移动过：「移动」可用', () => {
    expect(deriveDockEntries(asMaster())).toEqual([
      { kind: 'masterMove', enabled: true, reason: null },
    ]);
  });

  it('本回合已移动过：禁用并说明每回合限一次', () => {
    const players = {
      p1: player(),
      p2: player(),
      pM: player({
        characterId: 'dm_neptune_ocean',
        skillUsedThisTurn: { [CLIENT_FREE_MOVE_KEY]: 1 },
      }),
    };
    const [e] = deriveDockEntries(asMaster({ players }));
    expect(e).toMatchObject({ kind: 'masterMove', enabled: false });
    expect(e!.reason).toEqual({ key: 'entries.move.reason.used' });
  });

  it('盗梦者没有「移动」', () => {
    expect(deriveDockEntries(input()).map((e) => e.kind)).not.toContain('masterMove');
  });

  it('梦主既能移动又有同伴待复活：两个入口都在', () => {
    const players = {
      p1: player({ isAlive: false, currentLayer: 0 }),
      p2: player(),
      pM: player({ characterId: 'dm_neptune_ocean' }),
    };
    expect(deriveDockEntries(asMaster({ players })).map((e) => e.kind)).toEqual([
      'masterMove',
      'reviveOther',
    ]);
  });

  it('梦主移动的目标层是相邻层，第 1、4 层各只有一个', () => {
    expect(adjacentLayers(1)).toEqual([2]);
    expect(adjacentLayers(2)).toEqual([1, 3]);
    expect(adjacentLayers(3)).toEqual([2, 4]);
    expect(adjacentLayers(4)).toEqual([3]);
  });
});

describe('复活弹层的确认条件与参数', () => {
  const hand = [SHOOT, SHOOT, KICK];

  it('复活自己：按手牌位置选 2 张（同名牌各一张），参数是 [null, 牌 id 列表]', () => {
    expect(
      canConfirmRevive({ mode: 'self', target: null, hand, picked: [0, 1], passage: false }),
    ).toBe(true);
    expect(reviveArgs(null, hand, [0, 1])).toEqual([null, [SHOOT, SHOOT]]);
  });

  it('张数不对不能确认', () => {
    expect(
      canConfirmRevive({ mode: 'self', target: null, hand, picked: [0], passage: false }),
    ).toBe(false);
    expect(
      canConfirmRevive({ mode: 'self', target: null, hand, picked: [0, 1, 2], passage: false }),
    ).toBe(false);
  });

  it('复活同伴：必须先选对象', () => {
    expect(
      canConfirmRevive({ mode: 'other', target: null, hand, picked: [0, 2], passage: false }),
    ).toBe(false);
    expect(
      canConfirmRevive({ mode: 'other', target: 'p2', hand, picked: [0, 2], passage: false }),
    ).toBe(true);
    expect(reviveArgs('p2', hand, [2, 0])).toEqual(['p2', [KICK, SHOOT]]);
  });

  it('密道世界观：只能是 1 张梦境穿梭剂', () => {
    const h = [KICK, TRANSIT];
    expect(
      canConfirmRevive({ mode: 'self', target: null, hand: h, picked: [1], passage: true }),
    ).toBe(true);
    expect(
      canConfirmRevive({ mode: 'self', target: null, hand: h, picked: [0], passage: true }),
    ).toBe(false);
  });
});

describe('底部坞入口 · 抽牌阶段', () => {
  const drawing = (over: Partial<DockEntriesInput> = {}) => input({ turnPhase: 'draw', ...over });

  it('自己回合的抽牌阶段：出现「跳过抽牌」且可用', () => {
    expect(deriveDockEntries(drawing())).toEqual([
      { kind: 'skipDraw', enabled: true, reason: null },
    ]);
  });

  it('小丑存活：多一个「小丑·失控」；其他角色没有', () => {
    const joker = drawing({
      players: {
        p1: player({ characterId: 'thief_joker' }),
        p2: player(),
        pM: player({ characterId: 'dm_neptune_ocean' }),
      },
    });
    expect(deriveDockEntries(joker).map((e) => [e.kind, e.enabled])).toEqual([
      ['skipDraw', true],
      ['jokerGamble', true],
    ]);
    expect(deriveDockEntries(drawing()).map((e) => e.kind)).toEqual(['skipDraw']);
  });

  it('小丑在迷失层：没有「小丑·失控」，仍可略过抽牌', () => {
    const dead = drawing({
      players: {
        p1: player({ characterId: 'thief_joker', isAlive: false, currentLayer: 0 }),
        p2: player(),
        pM: player({ characterId: 'dm_neptune_ocean' }),
      },
    });
    expect(deriveDockEntries(dead).map((e) => e.kind)).toEqual(['skipDraw']);
  });

  it('有别的待办占着界面：入口仍在，但禁用并说明', () => {
    const [e] = deriveDockEntries(drawing({ busy: true }));
    expect(e).toMatchObject({ kind: 'skipDraw', enabled: false });
    expect(e!.reason).toEqual({ key: 'entries.reason.busy' });
  });

  it('不是自己的回合 / 对局已结束：没有入口', () => {
    expect(deriveDockEntries(drawing({ isMyTurn: false }))).toEqual([]);
    expect(deriveDockEntries(drawing({ winner: 'master' }))).toEqual([]);
  });

  it('入口的 data-testid', () => {
    expect(entryTestId('skipDraw')).toBe('dock-entry-skip-draw');
    expect(entryTestId('jokerGamble')).toBe('dock-entry-joker');
  });
});
