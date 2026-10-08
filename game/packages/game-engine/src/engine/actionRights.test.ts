// 行动权表：谁在什么时候可以发哪个 move

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from '../game.js';
import type { SetupState } from '../setup.js';
import { createTestState } from '../testing/fixtures.js';
import {
  BLOCKING_FIELDS,
  OFF_TURN_MOVES,
  RESTRICTED_MOVES,
  denyAction,
  listAwaiting,
} from './actionRights.js';

// 默认状态：玩家顺序 p1 p2 p3 p4 pM，回合主人 p1，梦主 pM
const OWNER = 'p1';

/** 在默认响应窗口上标记已响应的玩家 */
function respondedWindow(responded: string[]): NonNullable<SetupState['pendingResponseWindow']> {
  return { ...responseWindow.pendingResponseWindow!, responded };
}

function base(patch: Partial<SetupState> = {}): SetupState {
  return createTestState({ phase: 'playing', turnPhase: 'action', ...patch });
}

const graft: Partial<SetupState> = { pendingGraft: { playerID: 'p2' } };
const gravity: Partial<SetupState> = {
  pendingGravity: {
    bonderPlayerID: 'p2',
    targetIds: ['p3', 'p4'],
    pool: [],
    pickOrder: ['p2', 'p3', 'p4'],
    pickCursor: 0,
  },
};
const shootMove: Partial<SetupState> = {
  pendingShootMove: {
    shooterID: 'p2',
    targetPlayerID: 'p3',
    cardId: 'action_shoot_1',
    extraOnMove: null,
    choices: [1, 3],
  },
};
const sudger: Partial<SetupState> = {
  pendingSudgerRolls: {
    rollA: 2,
    rollB: 5,
    targetPlayerID: 'p3',
    cardId: 'action_shoot_1',
    deathFaces: [1],
    moveFaces: [2],
    extraOnMove: null,
  },
};
const libraBefore: Partial<SetupState> = {
  pendingLibra: { bonderPlayerID: 'p2', targetPlayerID: 'p3', split: null },
};
const libraAfter: Partial<SetupState> = {
  pendingLibra: {
    bonderPlayerID: 'p2',
    targetPlayerID: 'p3',
    split: { pile1: [], pile2: [] },
  },
};
const responseWindow: Pick<SetupState, 'pendingResponseWindow'> = {
  pendingResponseWindow: {
    sourceAbilityID: 'action_unlock',
    responders: ['p3', 'p4'],
    responded: [],
    timeoutMs: 30000,
    validResponseAbilityIDs: ['action_cancel_unlock'],
    onTimeout: 'resolve',
    parentWindow: null,
  },
};
const unlockOnly: Partial<SetupState> = {
  pendingUnlock: { playerID: 'p2', layer: 1, cardId: 'action_unlock_1' },
};
const peekDecision: Partial<SetupState> = {
  pendingPeekDecision: { peekerID: 'p2', targetLayer: 2 },
};
const vaultDecision: Partial<SetupState> = {
  pendingVaultDecision: { layer: 2, openerID: 'p2' },
};
const peekReveal: Partial<SetupState> = {
  peekReveal: { peekerID: 'p3', revealKind: 'vault', vaultLayer: 2 },
};
const virgo: Partial<SetupState> = {
  pendingVirgoChoice: { virgoID: 'p4', triggerRoll: 6, shooterID: 'p2' },
};
const shootResponse: Partial<SetupState> = {
  pendingShootResponse: {
    shooterID: 'p2',
    targetPlayerID: 'p3',
    cardId: 'action_shoot_1',
    sameLayerRequired: false,
    deathFaces: [1],
    moveFaces: [2],
    extraOnMove: null,
  },
};
const blackHoleLevy: Partial<SetupState> = {
  pendingBlackHoleLevy: { blackHoleID: 'p1', waiting: ['p2', 'p3'] },
};
const athenaWit: Partial<SetupState> = {
  pendingAthenaWit: {
    athenaID: 'p3',
    userID: 'p1',
    cardId: 'action_kick',
    move: 'playKick',
    args: ['action_kick', 'p3'],
  },
};
const saturnDecree: Partial<SetupState> = {
  pendingSaturnDecree: {
    masterID: 'pM',
    userID: 'p1',
    cardId: 'action_kick',
    move: 'playKick',
    args: ['action_kick', 'p3'],
  },
};
const darwinReturn: Partial<SetupState> = {
  pendingDarwinReturn: { playerID: 'p1' },
};
const aries: Partial<SetupState> = {
  pendingAriesChoice: { ariesID: 'p3', victimLayer: 2, victimID: 'p4' },
};

interface BlockingRow {
  name: string;
  patch: Partial<SetupState>;
  actor: string;
  moves: string[];
  /** 不在表里的另一个玩家（用来验证"别人发表里的 move"） */
  other: string;
}

const blockingRows: BlockingRow[] = [
  { name: 'pendingGraft', patch: graft, actor: 'p2', moves: ['resolveGraft'], other: 'p3' },
  {
    name: 'pendingGravity',
    patch: gravity,
    actor: 'p2',
    moves: ['resolveGravityPick'],
    other: 'p3',
  },
  {
    name: 'pendingShootMove',
    patch: shootMove,
    actor: 'p2',
    moves: ['resolveShootMove'],
    other: 'p3',
  },
  {
    name: 'pendingSudgerRolls',
    patch: sudger,
    actor: OWNER,
    moves: ['resolveSudgerPick'],
    other: 'p3',
  },
  {
    name: 'pendingLibra（未分牌）',
    patch: libraBefore,
    actor: 'p3',
    moves: ['resolveLibraSplit'],
    other: 'p2',
  },
  {
    name: 'pendingLibra（已分牌）',
    patch: libraAfter,
    actor: 'p2',
    moves: ['resolveLibraPick'],
    other: 'p3',
  },
  {
    name: 'pendingResponseWindow',
    patch: responseWindow,
    actor: 'p3',
    moves: ['passResponse', 'respondCancelUnlock'],
    other: 'p2',
  },
  {
    name: 'pendingUnlock（无响应窗口）',
    patch: unlockOnly,
    actor: 'p2',
    moves: ['resolveUnlock'],
    other: 'p3',
  },
  {
    name: 'pendingPeekDecision',
    patch: peekDecision,
    actor: 'pM',
    moves: ['masterPeekBribeDecision'],
    other: 'p2',
  },
  {
    name: 'pendingVaultDecision',
    patch: vaultDecision,
    actor: 'pM',
    moves: ['masterVaultDecision'],
    other: 'p2',
  },
  { name: 'peekReveal', patch: peekReveal, actor: 'p3', moves: ['peekerAcknowledge'], other: 'p2' },
  {
    name: 'pendingVirgoChoice',
    patch: virgo,
    actor: 'p4',
    moves: ['respondVirgoPerfect'],
    other: 'p2',
  },
  {
    name: 'pendingShootResponse',
    patch: shootResponse,
    actor: 'p3',
    moves: [
      'respondShootEvade',
      'respondShootPass',
      'respondTerroristDiscard',
      'respondTerroristAccept',
    ],
    other: 'p2',
  },
  {
    name: 'pendingBlackHoleLevy（名单里的人都可以交牌）',
    patch: blackHoleLevy,
    actor: 'p3',
    moves: ['respondBlackHoleLevy'],
    other: 'p4',
  },
  {
    name: 'pendingAthenaWit',
    patch: athenaWit,
    actor: 'p3',
    moves: ['respondAthenaWit'],
    other: 'p2',
  },
  {
    name: 'pendingSaturnDecree（只有梦主可以应答）',
    patch: saturnDecree,
    actor: 'pM',
    moves: ['respondSaturnDecree'],
    other: 'p2',
  },
  {
    name: 'pendingDarwinReturn',
    patch: darwinReturn,
    actor: 'p1',
    moves: ['respondDarwinReturn'],
    other: 'p2',
  },
];

describe('行动权表 · 阻塞型待结算', () => {
  describe.each(blockingRows)('$name', ({ patch, actor, moves, other }) => {
    const s = base(patch);

    it('表里的人发表里的 move 放行', () => {
      for (const move of moves) expect(denyAction(s, actor, move), move).toBeNull();
    });

    it('表里的人发别的 move 被拒', () => {
      expect(denyAction(s, actor, 'endActionPhase')).toBe('awaiting_other');
    });

    it('别人发表里的 move 被拒', () => {
      for (const move of moves) {
        expect(denyAction(s, other, move), `${other}:${move}`).toBe('awaiting_other');
      }
      // 回合主人在不是表里的人时同样被拒
      if (actor !== OWNER) {
        for (const move of moves) {
          expect(denyAction(s, OWNER, move), `owner:${move}`).toBe('awaiting_other');
        }
      }
    });
  });

  it('已经响应过的响应者再发 passResponse 被拒', () => {
    const s = base({
      pendingResponseWindow: respondedWindow(['p3']),
    });
    expect(denyAction(s, 'p3', 'passResponse')).toBe('awaiting_other');
    expect(denyAction(s, 'p4', 'passResponse')).toBeNull();
  });

  it('响应窗口存在时，pendingUnlock 的发起者不能发 resolveUnlock', () => {
    const s = base({ ...unlockOnly, ...responseWindow });
    expect(denyAction(s, 'p2', 'resolveUnlock')).toBe('awaiting_other');
    expect(denyAction(s, 'p3', 'resolveUnlock')).toBe('awaiting_other');
    expect(denyAction(s, 'p3', 'passResponse')).toBeNull();
  });

  it('天秤：分牌前发动者不能选牌，分牌后目标不能再分牌', () => {
    expect(denyAction(base(libraBefore), 'p2', 'resolveLibraPick')).toBe('awaiting_other');
    expect(denyAction(base(libraAfter), 'p3', 'resolveLibraSplit')).toBe('awaiting_other');
  });

  it('两个阻塞型字段并存：各自的人发各自的 move 放行，回合主人出牌被拒', () => {
    const s = base({ ...graft, ...shootResponse });
    expect(denyAction(s, 'p2', 'resolveGraft')).toBeNull();
    expect(denyAction(s, 'p3', 'respondShootPass')).toBeNull();
    expect(denyAction(s, OWNER, 'playKick')).toBe('awaiting_other');
    // 交叉发：嫁接的人发闪避响应、目标发嫁接结算，都不行
    expect(denyAction(s, 'p2', 'respondShootPass')).toBe('awaiting_other');
    expect(denyAction(s, 'p3', 'resolveGraft')).toBe('awaiting_other');
  });
});

describe('行动权表 · 白羊·星尘', () => {
  const s = base(aries);

  it('白羊（不是回合主人）可以发两个白羊 move', () => {
    expect(denyAction(s, 'p3', 'playAriesStardustActivate')).toBeNull();
    expect(denyAction(s, 'p3', 'playAriesStardustDiscard')).toBeNull();
  });

  it('不阻塞回合主人', () => {
    expect(denyAction(s, OWNER, 'endActionPhase')).toBeNull();
    expect(denyAction(s, OWNER, 'playKick')).toBeNull();
  });

  it('第三个人发白羊 move 被拒', () => {
    expect(denyAction(s, 'p4', 'playAriesStardustActivate')).toBe('not_turn_owner');
    expect(denyAction(s, 'p4', 'playAriesStardustDiscard')).toBe('not_turn_owner');
  });

  it('与阻塞型字段并存时，白羊发白羊 move 被拒', () => {
    const blocked = base({ ...aries, ...graft });
    expect(denyAction(blocked, 'p3', 'playAriesStardustActivate')).toBe('awaiting_other');
    expect(denyAction(blocked, 'p2', 'resolveGraft')).toBeNull();
  });

  it('回合主人不是白羊时发白羊 move，视为没有可结算的事项', () => {
    expect(denyAction(s, OWNER, 'playAriesStardustActivate')).toBe('nothing_to_settle');
  });

  it('白羊本人恰好是回合主人时可以发白羊 move', () => {
    const own = base({ ...aries, currentPlayerID: 'p3' });
    expect(denyAction(own, 'p3', 'playAriesStardustDiscard')).toBeNull();
  });
});

describe('行动权表 · 没有待结算', () => {
  const s = base();

  it('回合主人可以发普通 move', () => {
    expect(denyAction(s, OWNER, 'doDraw')).toBeNull();
    expect(denyAction(s, OWNER, 'playShoot')).toBeNull();
  });

  it('别人发普通 move 被拒', () => {
    expect(denyAction(s, 'p2', 'doDraw')).toBe('not_turn_owner');
    expect(denyAction(s, 'pM', 'playKick')).toBe('not_turn_owner');
  });

  it('雅典娜·急智不再是回合外随时可发的 move：没有挂起时别人发应答被拒', () => {
    expect(denyAction(s, 'p2', 'respondAthenaWit')).toBe('not_turn_owner');
    expect(denyAction(s, OWNER, 'respondAthenaWit')).toBe('nothing_to_settle');
  });

  it('土星·律令的应答只在挂起时才有人能发：没有挂起时梦主与回合主人发都被拒', () => {
    expect(denyAction(s, 'pM', 'respondSaturnDecree')).toBe('not_turn_owner');
    expect(denyAction(s, OWNER, 'respondSaturnDecree')).toBe('nothing_to_settle');
  });

  it('回合外只有空间女王·造物可以不经待结算而发', () => {
    expect(denyAction(s, 'p2', 'useSpaceQueenStashTop')).toBeNull();
    expect(OFF_TURN_MOVES).toEqual(['useSpaceQueenStashTop']);
  });

  it('回合主人发「仅限待结算时」的 move 被拒', () => {
    expect(denyAction(s, OWNER, 'resolveGraft')).toBe('nothing_to_settle');
    expect(denyAction(s, OWNER, 'passResponse')).toBe('nothing_to_settle');
    expect(denyAction(s, OWNER, 'playAriesStardustDiscard')).toBe('nothing_to_settle');
  });

  it('「仅限待结算时」的每个 move 在没有待结算时都被回合主人的请求拒绝', () => {
    for (const move of RESTRICTED_MOVES) {
      expect(denyAction(s, OWNER, move), move).toBe('nothing_to_settle');
    }
  });

  it('只有别的字段待结算时，回合主人发另一个字段的结算 move 被拒', () => {
    // 白羊待选择、回合主人发嫁接结算：嫁接并不在等
    expect(denyAction(base(aries), OWNER, 'resolveGraft')).toBe('nothing_to_settle');
  });
});

describe('行动权表 · 发起者身份', () => {
  it('不在对局里的发起者被拒', () => {
    const s = base();
    expect(denyAction(s, 'ghost', 'doDraw')).toBe('unknown_player');
    expect(denyAction(s, '', 'doDraw')).toBe('unknown_player');
  });

  it('身份检查先于待结算检查', () => {
    expect(denyAction(base(graft), 'ghost', 'resolveGraft')).toBe('unknown_player');
  });
});

describe('listAwaiting', () => {
  it('没有待结算时返回空数组', () => {
    expect(listAwaiting(base())).toEqual([]);
  });

  it('响应窗口的 actors 恰好是还没响应的人', () => {
    const s = base({
      pendingResponseWindow: respondedWindow(['p3']),
    });
    const [entry] = listAwaiting(s);
    expect(entry?.field).toBe('pendingResponseWindow');
    expect(entry?.actors).toEqual(['p4']);
  });

  it('响应窗口与 pendingUnlock 并存时，只列窗口', () => {
    const entries = listAwaiting(base({ ...unlockOnly, ...responseWindow }));
    expect(entries.map((e) => e.field)).toEqual(['pendingResponseWindow']);
  });

  it('白羊那条 blocking 为 false，其余为 true', () => {
    const all = base({
      ...graft,
      ...gravity,
      ...shootMove,
      ...sudger,
      ...libraBefore,
      ...unlockOnly,
      ...peekDecision,
      ...vaultDecision,
      ...peekReveal,
      ...virgo,
      ...shootResponse,
      ...aries,
    });
    const entries = listAwaiting(all);
    for (const e of entries) {
      expect(e.blocking, e.field).toBe(e.field !== 'pendingAriesChoice');
    }
    expect(entries.map((e) => e.field)).toContain('pendingAriesChoice');
  });

  it('每条的 actors 与 moves 都非空（响应窗口除外）', () => {
    for (const row of blockingRows) {
      const entries = listAwaiting(base(row.patch));
      expect(entries.length, row.name).toBeGreaterThan(0);
      for (const e of entries) expect(e.moves.length).toBeGreaterThan(0);
    }
  });
});

describe('行动权表 · 一致性', () => {
  describe('BLOCKING_FIELDS', () => {
    it('不含重复项，也不含不阻塞的白羊待选择', () => {
      expect(new Set(BLOCKING_FIELDS).size).toBe(BLOCKING_FIELDS.length);
      expect(BLOCKING_FIELDS).not.toContain('pendingAriesChoice');
    });

    it('与行动权表里实际挡住行动的字段一致', () => {
      const states = [
        base({
          ...graft,
          ...gravity,
          ...shootMove,
          ...sudger,
          ...libraBefore,
          ...peekDecision,
          ...vaultDecision,
          ...peekReveal,
          ...virgo,
          ...shootResponse,
          ...blackHoleLevy,
          ...darwinReturn,
          ...athenaWit,
          ...saturnDecree,
          ...responseWindow,
        }),
        base(unlockOnly),
      ];
      const blocking = states.flatMap((st) => listAwaiting(st).filter((entry) => entry.blocking));
      expect([...new Set(blocking.map((entry) => entry.field))].sort()).toEqual(
        [...BLOCKING_FIELDS].sort(),
      );
    });
  });

  const real = new Set(Object.keys(InceptionCityGame.phases.playing.moves));

  it('listAwaiting 用到的 move 都是引擎里真实存在的', () => {
    const all = base({
      ...graft,
      ...gravity,
      ...shootMove,
      ...sudger,
      ...libraBefore,
      ...peekDecision,
      ...vaultDecision,
      ...peekReveal,
      ...virgo,
      ...shootResponse,
      ...aries,
    });
    const states = [
      all,
      base(libraAfter),
      base(unlockOnly),
      base(responseWindow),
      base({ ...unlockOnly, ...responseWindow }),
    ];
    for (const st of states) {
      for (const e of listAwaiting(st)) {
        for (const move of e.moves) expect(real.has(move), `${e.field} → ${move}`).toBe(true);
      }
    }
    for (const move of RESTRICTED_MOVES) expect(real.has(move), move).toBe(true);
  });
});
