// 回放 API 纯函数单测
// 对照：plans/tasks.md W21 回放系统启动 batch
//
// 覆盖：rowsToEventLogEntries / alignFilteredWithMeta 两纯函数

import { describe, it, expect } from 'vitest';
import { filterEventLog } from '@icgame/game-engine';
import { rowsToEventLogEntries, alignFilteredWithMeta, buildRangeWhere } from './replays.js';

const NOW = new Date('2026-04-23T12:00:00Z');

describe('replays · rowsToEventLogEntries', () => {
  it('正确转换 payload 中的 actor/targets/visibility', () => {
    const rows = [
      {
        moveCounter: 1,
        eventKind: 'move.unlock',
        payload: { actor: 'p1', visibility: 'public', cardId: 'unlock' },
        createdAt: NOW,
      },
      {
        moveCounter: 2,
        eventKind: 'master.peek',
        payload: { actor: 'pM', visibility: 'master', vaultLayer: 1 },
        createdAt: NOW,
      },
      {
        moveCounter: 3,
        eventKind: 'shoot.target',
        payload: { actor: 'p1', targets: ['p2'], visibility: 'actor+target' },
        createdAt: NOW,
      },
    ];
    const entries = rowsToEventLogEntries(rows);
    expect(entries).toHaveLength(3);
    expect(entries[0]!.actor).toBe('p1');
    expect(entries[0]!.visibility).toBe('public');
    expect(entries[1]!.visibility).toBe('master');
    expect(entries[2]!.targets).toEqual(['p2']);
  });

  it('payload 缺 visibility 时默认为 public', () => {
    const rows = [{ moveCounter: 1, eventKind: 'foo', payload: {}, createdAt: NOW }];
    const entries = rowsToEventLogEntries(rows);
    expect(entries[0]!.visibility).toBe('public');
  });

  it('payload null 时也安全处理', () => {
    const rows = [{ moveCounter: 1, eventKind: 'foo', payload: null, createdAt: NOW }];
    const entries = rowsToEventLogEntries(rows);
    expect(entries[0]!.actor).toBeUndefined();
    expect(entries[0]!.visibility).toBe('public');
  });

  it('targets 非数组时返回 undefined', () => {
    const rows = [{ moveCounter: 1, eventKind: 'foo', payload: { targets: 'p2' }, createdAt: NOW }];
    const entries = rowsToEventLogEntries(rows);
    expect(entries[0]!.targets).toBeUndefined();
  });
});

describe('replays · alignFilteredWithMeta', () => {
  function rows() {
    return [
      { moveCounter: 1, eventKind: 'a', payload: {}, createdAt: NOW },
      { moveCounter: 2, eventKind: 'b', payload: {}, createdAt: NOW },
      { moveCounter: 3, eventKind: 'c', payload: {}, createdAt: NOW },
    ];
  }

  it('全部保留 → meta 完整对齐', () => {
    const entries = rowsToEventLogEntries(rows());
    const result = alignFilteredWithMeta(rows(), entries);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.moveCounter)).toEqual([1, 2, 3]);
  });

  it('部分过滤掉 → 按顺序保留剩余', () => {
    const filtered = rowsToEventLogEntries([
      { moveCounter: 1, eventKind: 'a', payload: {}, createdAt: NOW },
      { moveCounter: 3, eventKind: 'c', payload: {}, createdAt: NOW },
    ]);
    const result = alignFilteredWithMeta(rows(), filtered);
    expect(result.map((r) => r.moveCounter)).toEqual([1, 3]);
    expect(result.map((r) => r.eventKind)).toEqual(['a', 'c']);
  });

  it('全部被过滤 → 空数组', () => {
    const result = alignFilteredWithMeta(rows(), []);
    expect(result).toEqual([]);
  });

  it('空 rows → 空数组', () => {
    const result = alignFilteredWithMeta([], rowsToEventLogEntries([]));
    expect(result).toEqual([]);
  });
});

describe('replays · buildRangeWhere', () => {
  it('未传 from/to → 仅 matchId 条件', () => {
    expect(buildRangeWhere('m1')).toEqual({ matchId: 'm1' });
  });

  it('仅 from → moveCounter.gte', () => {
    expect(buildRangeWhere('m1', 5)).toEqual({ matchId: 'm1', moveCounter: { gte: 5 } });
  });

  it('仅 to → moveCounter.lte', () => {
    expect(buildRangeWhere('m1', undefined, 10)).toEqual({
      matchId: 'm1',
      moveCounter: { lte: 10 },
    });
  });

  it('from + to → 闭区间', () => {
    expect(buildRangeWhere('m1', 5, 10)).toEqual({
      matchId: 'm1',
      moveCounter: { gte: 5, lte: 10 },
    });
  });

  it('单帧 from === to', () => {
    expect(buildRangeWhere('m1', 7, 7)).toEqual({
      matchId: 'm1',
      moveCounter: { gte: 7, lte: 7 },
    });
  });

  it('from = 0 也走条件分支（不能因 falsy 误判为 undefined）', () => {
    expect(buildRangeWhere('m1', 0, 3)).toEqual({
      matchId: 'm1',
      moveCounter: { gte: 0, lte: 3 },
    });
  });
});

describe('replays · 集成 · filterEventLog 视角过滤端到端', () => {
  function makeRows() {
    return [
      {
        moveCounter: 1,
        eventKind: 'move.unlock',
        payload: { actor: 'p1', visibility: 'public' },
        createdAt: NOW,
      },
      {
        moveCounter: 2,
        eventKind: 'master.peek',
        payload: { actor: 'pM', visibility: 'master' },
        createdAt: NOW,
      },
      {
        moveCounter: 3,
        eventKind: 'self.draw',
        payload: { actor: 'p1', visibility: 'self' },
        createdAt: NOW,
      },
      {
        moveCounter: 4,
        eventKind: 'shoot.target',
        payload: { actor: 'p1', targets: ['p2'], visibility: 'actor+target' },
        createdAt: NOW,
      },
    ];
  }

  it('观战视角：仅 public 可见', () => {
    const rows = makeRows();
    const entries = rowsToEventLogEntries(rows);
    const filtered = filterEventLog(entries, null, 'pM');
    const result = alignFilteredWithMeta(rows, filtered);
    expect(result.map((r) => r.eventKind)).toEqual(['move.unlock']);
  });

  it('梦主视角：public + master 可见', () => {
    const rows = makeRows();
    const entries = rowsToEventLogEntries(rows);
    const filtered = filterEventLog(entries, 'pM', 'pM');
    const result = alignFilteredWithMeta(rows, filtered);
    expect(result.map((r) => r.eventKind)).toEqual(['move.unlock', 'master.peek']);
  });

  it('p1 视角：public + self（actor=p1） + actor+target 可见', () => {
    const rows = makeRows();
    const entries = rowsToEventLogEntries(rows);
    const filtered = filterEventLog(entries, 'p1', 'pM');
    const result = alignFilteredWithMeta(rows, filtered);
    expect(result.map((r) => r.eventKind)).toEqual(['move.unlock', 'self.draw', 'shoot.target']);
  });

  it('p2 视角：public + 自己作 target 的 actor+target 可见', () => {
    const rows = makeRows();
    const entries = rowsToEventLogEntries(rows);
    const filtered = filterEventLog(entries, 'p2', 'pM');
    const result = alignFilteredWithMeta(rows, filtered);
    expect(result.map((r) => r.eventKind)).toEqual(['move.unlock', 'shoot.target']);
  });

  it('p3 视角：仅 public 可见（既非 actor 也非 target）', () => {
    const rows = makeRows();
    const entries = rowsToEventLogEntries(rows);
    const filtered = filterEventLog(entries, 'p3', 'pM');
    const result = alignFilteredWithMeta(rows, filtered);
    expect(result.map((r) => r.eventKind)).toEqual(['move.unlock']);
  });

  it('moveCounter / createdAt 元字段在过滤后仍正确保留', () => {
    const rows = makeRows();
    const entries = rowsToEventLogEntries(rows);
    const filtered = filterEventLog(entries, 'pM', 'pM');
    const result = alignFilteredWithMeta(rows, filtered);
    expect(result[0]!.moveCounter).toBe(1);
    expect(result[1]!.moveCounter).toBe(2);
    expect(result[0]!.createdAt).toBe(NOW);
  });
});
