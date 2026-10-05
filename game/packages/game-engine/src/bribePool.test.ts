// 贿赂池：成败只存在 kind 字段里，标识不透明，顺序开局洗乱

import { describe, it, expect } from 'vitest';
import { createInitialState } from './setup.js';
import { migrateGameState } from './migrations.js';

function buildPool(seed: string) {
  return createInitialState({
    playerCount: 4,
    playerIds: ['0', '1', '2', '3'],
    nicknames: ['a', 'b', 'c', 'd'],
    rngSeed: seed,
  }).bribePool;
}

describe('贿赂池', () => {
  it('每张牌带 kind，成功 3 张、失败 3 张', () => {
    const pool = buildPool('s');
    expect(pool).toHaveLength(6);
    expect(pool.filter((b) => b.kind === 'deal')).toHaveLength(3);
    expect(pool.filter((b) => b.kind === 'fail')).toHaveLength(3);
  });

  it('标识不含成败字样，形如 bribe-0 … bribe-5', () => {
    const pool = buildPool('s');
    expect(pool.map((b) => b.id)).toEqual([0, 1, 2, 3, 4, 5].map((i) => `bribe-${i}`));
    for (const b of pool) expect(b.id).not.toMatch(/deal|fail/);
  });

  it('不同种子下成功牌所在的下标组合不全相同', () => {
    const combos = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const pool = buildPool(`seed-${i}`);
      combos.add(
        pool
          .map((b, idx) => (b.kind === 'deal' ? idx : -1))
          .filter((idx) => idx >= 0)
          .join(','),
      );
    }
    expect(combos.size).toBeGreaterThan(1);
  });

  it('同一个标识在不同种子下对应的成败不固定', () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 20; i++) {
      kinds.add(buildPool(`seed-${i}`).find((b) => b.id === 'bribe-0')!.kind);
    }
    expect(kinds.size).toBe(2);
  });

  it('同一个种子两次建局结果相同', () => {
    expect(buildPool('same')).toEqual(buildPool('same'));
  });

  it('迁移：旧快照里没有 kind 的贿赂牌按旧标识前缀补上，标识不变', () => {
    const fresh = createInitialState({
      playerCount: 4,
      playerIds: ['0', '1', '2', '3'],
      nicknames: ['a', 'b', 'c', 'd'],
      rngSeed: 'v',
    }) as unknown as Record<string, unknown>;
    const old = {
      ...fresh,
      schemaVersion: 8,
      bribePool: [
        { id: 'bribe-deal-0', status: 'inPool', heldBy: null, originalOwnerId: null },
        { id: 'bribe-fail-1', status: 'inPool', heldBy: null, originalOwnerId: null },
        { id: 'bribe-fail-mercury', status: 'inPool', heldBy: null, originalOwnerId: null },
      ],
    };
    const migrated = migrateGameState(old);
    expect(migrated.bribePool.map((b) => [b.id, b.kind])).toEqual([
      ['bribe-deal-0', 'deal'],
      ['bribe-fail-1', 'fail'],
      ['bribe-fail-mercury', 'fail'],
    ]);
  });

  it('迁移：已有 kind 的贿赂牌保持原值', () => {
    const migrated = migrateGameState({
      schemaVersion: 8,
      bribePool: [{ id: 'bribe-deal-0', kind: 'fail', status: 'inPool' }],
    });
    expect(migrated.bribePool[0]!.kind).toBe('fail');
  });
});
