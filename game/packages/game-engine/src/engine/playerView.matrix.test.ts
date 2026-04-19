// PlayerView 过滤快照测试矩阵
// 对照：plans/design/09-testing-quality.md W9 `PlayerView 过滤快照测试矩阵`
//
// 目标：
//   - N 个 scenario × M 个 viewer（master / thief / spectator）批量组合过滤
//   - 每个组合生成稳定的 snapshot，回归变更必须人工 review
//   - 显式断言关键隐私字段（手牌/金库/贿赂/牌库）被正确遮蔽

import { describe, it, expect } from 'vitest';
import type { CardID } from '@icgame/shared';
import { filterFor, assertNoLeakage, type FilteredState } from './playerView.js';
import { createTestState, withBribes, withHand } from '../testing/fixtures.js';
import {
  scenarioStartOfGame3p,
  scenarioMidGameThiefAtL3,
  scenarioThiefNearWin,
  scenarioMasterWin,
} from '../testing/scenarios.js';

// === 构造一组带隐私数据的 scenario ===
// 给 scenarioStartOfGame3p 补上手牌 / 贿赂 / 金库开关 / 牌库
function richScenario(): ReturnType<typeof scenarioStartOfGame3p> {
  const base = scenarioStartOfGame3p();
  const withHands = withHand(
    withHand(withHand(base, 'p1', ['c_a' as CardID, 'c_b' as CardID]), 'p2', [
      'c_c' as CardID,
      'c_d' as CardID,
    ]),
    'pM',
    ['c_m1' as CardID],
  );
  const withBribed = withBribes(withHands, [
    { id: 'bp-1', status: 'inPool', heldBy: null, originalOwnerId: null },
    { id: 'bp-2', status: 'dealt', heldBy: 'p1', originalOwnerId: 'pM' },
    { id: 'bp-3', status: 'deal', heldBy: 'p2', originalOwnerId: 'pM' },
  ]);
  const firstVault = withBribed.vaults[0]!;
  const rest = withBribed.vaults.slice(1);
  const vaults = [firstVault, { ...rest[0]!, isOpened: true, openedBy: 'p1' }, ...rest.slice(1)];
  return {
    ...withBribed,
    vaults,
    deck: {
      cards: ['d1' as CardID, 'd2' as CardID, 'd3' as CardID],
      discardPile: ['x1' as CardID],
    },
  };
}

// === 用于 snapshot 稳定化 ===
// 去掉可能因 Date 或字符串随机性不稳定的字段
function stabilize(filtered: FilteredState): Record<string, unknown> {
  return {
    _filteredFor: filtered._filteredFor,
    phase: filtered.phase,
    turnPhase: filtered.turnPhase,
    players: Object.fromEntries(
      Object.entries(filtered.players)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([pid, p]) => [
          pid,
          {
            hand: p.hand,
            handCount: p.handCount,
            characterId: p.characterId,
            faction: p.faction,
            isRevealed: p.isRevealed,
            currentLayer: p.currentLayer,
            isAlive: p.isAlive,
          },
        ]),
    ),
    vaults: filtered.vaults.map((v) => ({
      id: v.id,
      layer: v.layer,
      contentType: v.contentType,
      isOpened: v.isOpened,
      openedBy: v.openedBy,
    })),
    bribePool: filtered.bribePool.map((b) => ({
      id: b.id,
      status: b.status,
      heldBy: b.heldBy,
      originalOwnerId: b.originalOwnerId,
    })),
    deck: {
      cards: filtered.deck.cards,
      cardCount: filtered.deck.cardCount,
      discardPile: filtered.deck.discardPile,
    },
    winner: filtered.winner,
  };
}

const SCENARIOS = [
  { name: 'default', make: () => createTestState({ phase: 'playing' }) },
  { name: 'rich', make: richScenario },
  { name: 'mid-game-thief-at-l3', make: scenarioMidGameThiefAtL3 },
  { name: 'thief-near-win', make: scenarioThiefNearWin },
  { name: 'master-win', make: scenarioMasterWin },
];

describe('PlayerView 矩阵 · 关键隐私字段断言', () => {
  for (const sc of SCENARIOS) {
    describe(`scenario: ${sc.name}`, () => {
      it('thief viewer: 非自己的手牌必须为 null', () => {
        const s = sc.make();
        const viewer = Object.keys(s.players).find((p) => s.players[p]!.faction === 'thief');
        if (!viewer) return;
        const f = filterFor(s, viewer);
        for (const [pid, p] of Object.entries(f.players)) {
          if (pid !== viewer) expect(p.hand).toBeNull();
          else expect(Array.isArray(p.hand)).toBe(true);
        }
      });

      it('master viewer: 所有盗梦者手牌必须为 null', () => {
        const s = sc.make();
        const master = s.dreamMasterID;
        if (!master || !s.players[master]) return;
        const f = filterFor(s, master);
        for (const [pid, p] of Object.entries(f.players)) {
          if (pid === master) expect(Array.isArray(p.hand)).toBe(true);
          else expect(p.hand).toBeNull();
        }
      });

      it('spectator viewer: 所有 hand 必须为 null', () => {
        const s = sc.make();
        const f = filterFor(s, null);
        for (const p of Object.values(f.players)) expect(p.hand).toBeNull();
      });

      it('thief viewer: 未开金库 contentType 必须为 hidden', () => {
        const s = sc.make();
        const viewer = Object.keys(s.players).find((p) => s.players[p]!.faction === 'thief');
        if (!viewer) return;
        const f = filterFor(s, viewer);
        for (const v of f.vaults) {
          if (!v.isOpened) expect(v.contentType).toBe('hidden');
          else expect(v.contentType).not.toBe('hidden');
        }
      });

      it('master viewer: 所有金库 contentType 必须可见（非 hidden）', () => {
        const s = sc.make();
        const master = s.dreamMasterID;
        if (!master || !s.players[master]) return;
        const f = filterFor(s, master);
        for (const v of f.vaults) expect(v.contentType).not.toBe('hidden');
      });

      it('任何 viewer: deck.cards 必须为 null', () => {
        const s = sc.make();
        for (const viewer of [...Object.keys(s.players), null] as Array<string | null>) {
          const f = filterFor(s, viewer);
          expect(f.deck.cards).toBeNull();
          expect(() => assertNoLeakage(f, viewer)).not.toThrow();
        }
      });
    });
  }
});

describe('PlayerView 矩阵 · snapshot 回归', () => {
  for (const sc of SCENARIOS) {
    it(`snapshot: ${sc.name} / spectator`, () => {
      const s = sc.make();
      const f = filterFor(s, null);
      expect(stabilize(f)).toMatchSnapshot();
    });
    it(`snapshot: ${sc.name} / master`, () => {
      const s = sc.make();
      if (!s.dreamMasterID) return;
      const f = filterFor(s, s.dreamMasterID);
      expect(stabilize(f)).toMatchSnapshot();
    });
    it(`snapshot: ${sc.name} / first-thief`, () => {
      const s = sc.make();
      const thief = Object.keys(s.players).find((p) => s.players[p]!.faction === 'thief');
      if (!thief) return;
      const f = filterFor(s, thief);
      expect(stabilize(f)).toMatchSnapshot();
    });
  }
});

describe('PlayerView 矩阵 · 贿赂池对称性', () => {
  it('inPool 贿赂对非梦主呈 hidden', () => {
    const s = richScenario();
    const thief = 'p1';
    const f = filterFor(s, thief);
    const inPool = f.bribePool.find((b) => b.id === 'bp-1')!;
    expect(inPool.status).toBe('hidden');
    expect(inPool.heldBy).toBeNull();
  });

  it('inPool 贿赂对梦主保留原样', () => {
    const s = richScenario();
    const f = filterFor(s, 'pM');
    const inPool = f.bribePool.find((b) => b.id === 'bp-1')!;
    expect(inPool.status).toBe('inPool');
  });

  it('持有者可见自己的 deal 细节', () => {
    const s = richScenario();
    const f = filterFor(s, 'p2');
    const mine = f.bribePool.find((b) => b.id === 'bp-3')!;
    expect(mine.status).toBe('deal');
    expect(mine.originalOwnerId).toBe('pM');
  });

  it('非持有者看别人的 deal 退化为 dealt', () => {
    const s = richScenario();
    const f = filterFor(s, 'p1');
    const others = f.bribePool.find((b) => b.id === 'bp-3')!;
    expect(others.status).toBe('dealt');
    expect(others.originalOwnerId).toBeNull();
  });
});

describe('PlayerView 矩阵 · 泄漏 fuzzer', () => {
  it('随机选 10 个 thief viewer 后都能通过 assertNoLeakage', () => {
    const s = richScenario();
    const thieves = Object.keys(s.players).filter((p) => s.players[p]!.faction === 'thief');
    for (let i = 0; i < 10; i++) {
      const viewer = thieves[i % thieves.length]!;
      const f = filterFor(s, viewer);
      expect(() => assertNoLeakage(f, viewer)).not.toThrow();
    }
  });

  it('filter 两次结果保持一致（幂等）', () => {
    const s = richScenario();
    const f1 = filterFor(s, 'p1');
    const f2 = filterFor(s, 'p1');
    expect(stabilize(f1)).toEqual(stabilize(f2));
  });

  it('filter 不会修改原 state', () => {
    const s = richScenario();
    const before = JSON.stringify(s);
    filterFor(s, 'p1');
    filterFor(s, 'pM');
    filterFor(s, null);
    expect(JSON.stringify(s)).toBe(before);
  });
});
