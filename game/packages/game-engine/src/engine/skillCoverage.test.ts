// 技能 / 世界观与卡牌配置对账：
//   - 引擎里登记的每个技能标识都存在于配置里
//   - 配置里有、引擎没有入口的技能，必须登记在 skillCoverage.ts 的两张表里（含原因），不多不少
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MASTER_CHARACTERS, THIEF_CHARACTERS } from '@icgame/shared';
import * as skillsModule from './skills.js';
import { SKILLS_IMPLEMENTED_WITHOUT_ID, SKILLS_NOT_IMPLEMENTED } from './skillCoverage.js';

/** 配置里的全部技能与世界观标识 */
function configSkillIds(): Set<string> {
  const ids = new Set<string>();
  for (const c of [...THIEF_CHARACTERS, ...MASTER_CHARACTERS]) {
    for (const s of [...c.front.skills, ...(c.back?.skills ?? [])]) ids.add(s.id);
    if (c.front.worldView) ids.add(c.front.worldView.id);
  }
  return ids;
}

/** 引擎登记的技能标识：skills.ts 导出的标识常量 */
function engineSkillIds(): Set<string> {
  const ids = new Set<string>();
  for (const value of Object.values(skillsModule)) {
    if (typeof value === 'string' && /^(thief|dm)_[a-z0-9_]+\.[a-z0-9_]+$/.test(value)) {
      ids.add(value);
    }
  }
  return ids;
}

const config = configSkillIds();
const engine = engineSkillIds();

describe('技能标识 · 引擎与卡牌配置对账', () => {
  it('引擎登记的每个技能标识都存在于卡牌配置里', () => {
    const unknown = [...engine].filter((id) => !config.has(id));
    expect(unknown).toEqual([]);
  });

  it('配置里没有引擎入口的技能，与两张登记表合起来正好一致', () => {
    const withoutEntry = [...config].filter((id) => !engine.has(id)).sort();
    const registered = [
      ...Object.keys(SKILLS_NOT_IMPLEMENTED),
      ...Object.keys(SKILLS_IMPLEMENTED_WITHOUT_ID),
    ].sort();
    expect(registered).toEqual(withoutEntry);
  });

  it('两张表互不重叠，登记的标识都在配置里，每条都写了原因', () => {
    const notImplemented = Object.keys(SKILLS_NOT_IMPLEMENTED);
    const inline = Object.keys(SKILLS_IMPLEMENTED_WITHOUT_ID);
    expect(notImplemented.filter((id) => inline.includes(id))).toEqual([]);
    for (const [id, reason] of [
      ...Object.entries(SKILLS_NOT_IMPLEMENTED),
      ...Object.entries(SKILLS_IMPLEMENTED_WITHOUT_ID),
    ]) {
      expect(config.has(id), `${id} 不在配置里`).toBe(true);
      expect(reason.trim().length, id).toBeGreaterThan(0);
    }
  });

  it('清单里写明「只有没人调用的纯函数」的条目，那个函数确实存在于 skills.ts 且没有被对局引用', () => {
    const claims: Record<string, string> = {
      'dm_chess.worldview': 'applyChessWorldViewPeek',
      'dm_fortress.worldview': 'applyFortressDiceModifier',
    };
    const srcDir = join(__dirname, '..');
    const referencing: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'testing') walk(path);
        } else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
          const rel = path.slice(srcDir.length + 1);
          if (
            rel === join('engine', 'skills.ts') ||
            rel === join('engine', 'skillCoverage.ts') ||
            rel === 'index.ts'
          ) {
            continue;
          }
          const text = readFileSync(path, 'utf8');
          for (const fn of Object.values(claims)) {
            if (new RegExp(`\\b${fn}\\b`).test(text)) referencing.push(`${rel}:${fn}`);
          }
        }
      }
    };
    walk(srcDir);
    for (const [id, fn] of Object.entries(claims)) {
      expect(id in SKILLS_NOT_IMPLEMENTED, id).toBe(true);
      expect(typeof (skillsModule as Record<string, unknown>)[fn], fn).toBe('function');
    }
    expect(referencing, '已被对局引用，请把对应条目从未实现表里删掉').toEqual([]);
  });
});
