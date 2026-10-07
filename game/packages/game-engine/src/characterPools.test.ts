// 随机池与卡牌配置对账：池里每个 id 都在配置里且阵营正确；
// 配置里的角色要么在池里，要么登记在「未进池」清单里，两边都没登记就失败
import { describe, it, expect } from 'vitest';
import { MASTER_CHARACTERS, THIEF_CHARACTERS } from '@icgame/shared';
import { CHARACTERS_OUTSIDE_POOL, MASTER_POOL, THIEF_POOL } from './characterPools.js';

const masterIds = new Set(MASTER_CHARACTERS.map((c) => c.id as string));
const thiefIds = new Set(THIEF_CHARACTERS.map((c) => c.id as string));

describe('角色随机池 · 与卡牌配置对账', () => {
  it('梦主池里的每个 id 都是配置里的梦主，且没有重复', () => {
    for (const id of MASTER_POOL) expect(masterIds.has(id), id).toBe(true);
    expect(new Set(MASTER_POOL).size).toBe(MASTER_POOL.length);
  });

  it('盗梦者池里的每个 id 都是配置里的盗梦者，且没有重复', () => {
    for (const id of THIEF_POOL) expect(thiefIds.has(id), id).toBe(true);
    expect(new Set(THIEF_POOL).size).toBe(THIEF_POOL.length);
  });

  it('池里的角色阵营与配置一致', () => {
    const factionOf = new Map(
      [...MASTER_CHARACTERS, ...THIEF_CHARACTERS].map((c) => [c.id as string, c.faction]),
    );
    for (const id of MASTER_POOL) expect(factionOf.get(id), id).toBe('master');
    for (const id of THIEF_POOL) expect(factionOf.get(id), id).toBe('thief');
  });

  it('配置里的每个角色要么在池里，要么登记在未进池清单里', () => {
    const pooled = new Set<string>([...MASTER_POOL, ...THIEF_POOL]);
    const missing = [...masterIds, ...thiefIds].filter(
      (id) => !pooled.has(id) && !(id in CHARACTERS_OUTSIDE_POOL),
    );
    expect(missing, '既不在池里也没登记原因的角色').toEqual([]);
  });

  it('未进池清单只登记配置里存在、且确实不在池里的角色，并写明原因', () => {
    const pooled = new Set<string>([...MASTER_POOL, ...THIEF_POOL]);
    for (const [id, reason] of Object.entries(CHARACTERS_OUTSIDE_POOL)) {
      expect(masterIds.has(id) || thiefIds.has(id), `${id} 不在配置里`).toBe(true);
      expect(pooled.has(id), `${id} 已经进池，请从清单里删掉`).toBe(false);
      expect(reason.trim().length, id).toBeGreaterThan(0);
    }
  });

  it('池与清单合起来正好覆盖配置里的全部角色', () => {
    const covered = new Set<string>([
      ...MASTER_POOL,
      ...THIEF_POOL,
      ...Object.keys(CHARACTERS_OUTSIDE_POOL),
    ]);
    expect(covered.size).toBe(masterIds.size + thiefIds.size);
  });
});
