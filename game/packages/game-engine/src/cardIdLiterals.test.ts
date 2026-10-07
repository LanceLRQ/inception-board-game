// 引擎源码里写死的牌 / 技能标识与卡牌配置对账
//
// 扫描引擎非测试源码里形如牌 id 或技能标识的字符串字面量，每一个都必须存在于卡牌配置里；
// 不是牌 id 的同形字符串（事件类型、不变量名、移动参数值）登记在 NOT_CARD_IDS 里。
// 新增写死的 id 写错了、或者配置改名后引擎没跟上，这里会失败。
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ACTION_CARDS,
  BRIBE_CARDS,
  DREAM_CARDS,
  MASTER_CHARACTERS,
  NIGHTMARE_CARDS,
  OTHER_CARDS,
  THIEF_CHARACTERS,
  VAULT_CARDS,
} from '@icgame/shared';
import { DUAL_FACED_CARD_IDS, DUAL_FACED_CHARS } from './engine/abilities/dual-faced.js';
import { RENAMED_IDS } from './migrations.js';

/** 与牌 id 同形、但不是牌 id 的字符串，每条写明用途 */
const NOT_CARD_IDS: Readonly<Record<string, string>> = {
  action_unlock_effect_1: '【解封】两种效果之一，出牌 move 的参数值',
  action_unlock_effect_2: '【解封】两种效果之一，出牌 move 的参数值',
  bribe_dealt: '领域事件类型：贿赂牌派发',
  'thief_sagittarius.kills': '技能使用记录里的内部计数键：射手本回合的击杀数，不是技能标识',
  'dm_fortress.skill_0.chances':
    '技能使用记录里的内部计数键：要塞本回合出牌阶段换层产生的冷酷发动机会数，不是技能标识',
  'dm_pluto_hell.world.marked':
    '技能使用记录里的内部标记键：冥王星已在本回合抽牌阶段检视过手牌，不是技能标识',
  nightmare_discarded: '领域事件类型：梦魇牌被弃',
  nightmare_revealed: '领域事件类型：梦魇牌被翻开',
  vault_opened: '领域事件类型：金库被打开',
  bribe_held_required: '状态不变量的名字',
  bribe_in_pool: '状态不变量的名字',
  vault_not_opened_but_by: '状态不变量的名字',
  vault_opened_by: '状态不变量的名字',
};

const ID_LITERAL =
  /(['"`])((?:thief|dm|action|nightmare|dream|vault|bribe|other)_[a-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\1/g;

/** 去掉注释（行注释与块注释），避免文档里的示例 id 被当成代码里的引用 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function engineSources(): { file: string; text: string }[] {
  const root = __dirname;
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'testing' && entry.name !== '__snapshots__') walk(path);
      } else if (
        /\.ts$/.test(entry.name) &&
        !/\.test\.ts$/.test(entry.name) &&
        // 状态迁移里写的就是已经废弃的旧标识，下面单独核对
        path !== join(root, 'migrations.ts')
      ) {
        out.push({ file: path.slice(root.length + 1), text: readFileSync(path, 'utf8') });
      }
    }
  };
  walk(root);
  return out;
}

/** 配置里的全部牌 id、技能标识与世界观标识，加上双面角色翻面后的 characterId */
function knownIds(): Set<string> {
  const ids = new Set<string>();
  for (const list of [
    THIEF_CHARACTERS,
    MASTER_CHARACTERS,
    ACTION_CARDS,
    NIGHTMARE_CARDS,
    DREAM_CARDS,
    VAULT_CARDS,
    BRIBE_CARDS,
    OTHER_CARDS,
  ] as const) {
    for (const c of list) ids.add(c.id);
  }
  for (const c of [...THIEF_CHARACTERS, ...MASTER_CHARACTERS]) {
    for (const s of [...c.front.skills, ...(c.back?.skills ?? [])]) ids.add(s.id);
    if (c.front.worldView) ids.add(c.front.worldView.id);
  }
  for (const d of DUAL_FACED_CHARS) ids.add(d.backId);
  return ids;
}

describe('引擎源码里的牌 / 技能标识字面量', () => {
  const known = knownIds();

  it('每个字面量都存在于卡牌配置里（或登记为非牌 id）', () => {
    const unknown: string[] = [];
    let scanned = 0;
    for (const { file, text } of engineSources()) {
      for (const m of stripComments(text).matchAll(ID_LITERAL)) {
        const id = m[2]!;
        scanned++;
        if (!known.has(id) && !(id in NOT_CARD_IDS)) unknown.push(`${file}: ${id}`);
      }
    }
    expect(unknown).toEqual([]);
    // 扫描确实读到了源码里的字面量（防止路径或正则失效后测试空转）
    expect(scanned).toBeGreaterThan(100);
  });

  it('非牌 id 登记表里的字符串都真的出现在引擎源码里，且不是配置里的牌 id', () => {
    const used = new Set<string>();
    for (const { text } of engineSources()) {
      for (const m of stripComments(text).matchAll(ID_LITERAL)) used.add(m[2]!);
    }
    for (const id of Object.keys(NOT_CARD_IDS)) {
      expect(used.has(id), `${id} 已不在引擎源码里，请从登记表删掉`).toBe(true);
      expect(known.has(id), `${id} 是配置里的牌 id，不该登记为非牌 id`).toBe(false);
    }
  });
});

describe('状态迁移的标识改写表', () => {
  it('改写后的新标识都存在于卡牌配置里，旧标识都已不存在', () => {
    const known = knownIds();
    for (const [oldId, newId] of Object.entries(RENAMED_IDS)) {
      expect(known.has(newId), `${newId} 不在配置里`).toBe(true);
      expect(known.has(oldId), `${oldId} 仍在配置里`).toBe(false);
    }
  });
});

describe('双面角色', () => {
  it('翻面表里的角色与卡牌配置里的双面角色一一对应', () => {
    const doubleSided = THIEF_CHARACTERS.filter((c) => c.doubleSided)
      .map((c) => c.id as string)
      .sort();
    expect([...DUAL_FACED_CARD_IDS].sort()).toEqual(doubleSided);
  });

  it('背面技能沿用牌 id 加连续序号，不因翻面另起一套标识', () => {
    for (const c of THIEF_CHARACTERS.filter((x) => x.doubleSided)) {
      const frontCount = c.front.skills.length;
      c.back!.skills.forEach((s, i) => expect(s.id).toBe(`${c.id}.skill_${frontCount + i}`));
    }
  });

  it('翻面后的 characterId 是牌 id 加 _back，且不是配置里的另一张牌', () => {
    const cardIds = new Set<string>(THIEF_CHARACTERS.map((c) => c.id));
    for (const d of DUAL_FACED_CHARS) {
      expect(d.backId).toBe(`${d.frontId}_back`);
      expect(cardIds.has(d.backId)).toBe(false);
    }
  });
});
