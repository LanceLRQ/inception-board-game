// 客户端里的牌 / 技能标识与卡牌配置对账：
//   - 主动技能表里的每个技能标识都存在于配置里，界面文案的键由标识推出
//   - 两份语言包里 skill 分组下的技能键都对应配置里的技能
//   - 客户端源码里写死的牌 id 都存在于配置里
import { describe, it, expect } from 'vitest';
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
import * as activeSkills from './activeSkills.js';
import type { ActiveSkillDescriptor } from './activeSkills.js';
import zhCN from '../i18n/locales/zh-CN.json';
import en from '../i18n/locales/en.json';

/** 配置里的全部牌 id、技能标识与世界观标识 */
function configIds(): { cards: Set<string>; skills: Set<string> } {
  const cards = new Set<string>();
  const skills = new Set<string>();
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
    for (const c of list) cards.add(c.id);
  }
  for (const c of [...THIEF_CHARACTERS, ...MASTER_CHARACTERS]) {
    for (const s of [...c.front.skills, ...(c.back?.skills ?? [])]) skills.add(s.id);
    if (c.front.worldView) skills.add(c.front.worldView.id);
  }
  return { cards, skills };
}

const { cards: cardIds, skills: skillIds } = configIds();

/** 不属于任何角色的通用动作（梦主通用操作），标识前缀固定，文案键为 skill.master.<动作>.* */
const GENERIC_ACTION_PREFIX = '__any_master__.';

/** 技能表导出的所有描述符，含已定义但没有登记进可用列表的 */
const descriptors: ActiveSkillDescriptor[] = Object.values(activeSkills).filter(
  (v): v is ActiveSkillDescriptor =>
    typeof v === 'object' && v !== null && 'move' in v && 'nameKey' in v && 'argKind' in v,
);

function lookup(locale: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((o, part) => (o as Record<string, unknown> | undefined)?.[part], locale);
}

describe('主动技能表 · 与卡牌配置对账', () => {
  it('技能表非空', () => {
    expect(descriptors.length).toBeGreaterThan(20);
  });

  it('每个描述符要么是配置里的技能 / 世界观，要么是登记过前缀的通用梦主动作', () => {
    for (const d of descriptors) {
      if (d.id.startsWith(GENERIC_ACTION_PREFIX)) continue;
      expect(skillIds.has(d.id), `${d.id} 不在卡牌配置里`).toBe(true);
    }
  });

  it('绑定角色的描述符，标识以所属角色 id 开头，角色在配置里', () => {
    const characterIds = new Set<string>(
      [...THIEF_CHARACTERS, ...MASTER_CHARACTERS].map((c) => c.id),
    );
    for (const d of descriptors) {
      if (d.characterId === '__any__') continue;
      expect(characterIds.has(d.characterId), d.characterId).toBe(true);
      expect(d.id.startsWith(`${d.characterId}.`), d.id).toBe(true);
    }
  });

  it('配置里的技能，文案键由标识推出：skill.<标识>.name / desc，两份语言包都有', () => {
    for (const d of descriptors) {
      if (d.id.startsWith(GENERIC_ACTION_PREFIX)) continue;
      expect(d.nameKey).toBe(`skill.${d.id}.name`);
      expect(d.descKey).toBe(`skill.${d.id}.desc`);
      for (const locale of [zhCN, en]) {
        expect(typeof lookup(locale, d.nameKey), d.nameKey).toBe('string');
        expect(typeof lookup(locale, d.descKey), d.descKey).toBe('string');
      }
    }
  });

  it('通用梦主动作的文案键放在 skill.master 下，两份语言包都有', () => {
    for (const d of descriptors.filter((x) => x.id.startsWith(GENERIC_ACTION_PREFIX))) {
      const name = d.id.slice(GENERIC_ACTION_PREFIX.length);
      expect(d.nameKey).toBe(`skill.master.${name}.name`);
      for (const locale of [zhCN, en]) {
        expect(typeof lookup(locale, d.nameKey), d.nameKey).toBe('string');
      }
    }
  });
});

describe('语言包 · skill 分组下的技能键与卡牌配置对账', () => {
  for (const [name, locale] of [
    ['zh-CN', zhCN],
    ['en', en],
  ] as const) {
    it(`${name}：每个技能键都是配置里的技能或世界观标识`, () => {
      const group = locale.skill as Record<string, unknown>;
      const unknown: string[] = [];
      for (const [characterId, entries] of Object.entries(group)) {
        if (!/^(thief|dm)_/.test(characterId)) continue;
        for (const sub of Object.keys(entries as Record<string, unknown>)) {
          if (!skillIds.has(`${characterId}.${sub}`)) unknown.push(`${characterId}.${sub}`);
        }
      }
      expect(unknown).toEqual([]);
    });
  }
});

// 与牌 id 同形、但不是配置里的牌 id 的字符串
const NOT_CARD_IDS: Readonly<Record<string, string>> = {
  action_back: '界面里取行动牌通用背面用的固定 id',
  bribe_back: '界面里取贿赂牌通用背面用的固定 id',
  nightmare_back: '界面里取梦魇牌通用背面用的固定 id',
  vault_back: '界面里取金库通用背面用的固定 id（金库未翻开）',
  action_unlock_effect_1: '【解封】两种效果之一，出牌 move 的参数值',
  action_unlock_effect_2: '【解封】两种效果之一，出牌 move 的参数值',
  'dm_fortress.skill_0.chances':
    '技能使用记录里的内部计数键：要塞·冷酷本回合的发动机会数，不是技能标识',
  thief_char: '卡牌类别名',
  master_char: '卡牌类别名',
};

const ID_LITERAL =
  /(['"`])((?:thief|dm|action|nightmare|dream|vault|bribe|other|master)_[a-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\1/g;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** 客户端非测试源码（Vite 在构建期把文件内容按原文读进来，不依赖文件系统 API） */
const SOURCE_FILES = import.meta.glob(
  [
    '../**/*.ts',
    '../**/*.tsx',
    '!../**/*.test.ts',
    '!../**/*.test.tsx',
    '!../**/generated/**',
    '!../**/locales/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

function clientSources(): { file: string; text: string }[] {
  return Object.entries(SOURCE_FILES).map(([file, text]) => ({ file, text }));
}

/** 字面量是某一族牌 id 的前缀（用于 startsWith 判断，如 action_death_decree_） */
function isIdFamilyPrefix(literal: string): boolean {
  const prefix = literal.endsWith('_') ? literal : `${literal}_`;
  return [...cardIds].filter((id) => id.startsWith(prefix)).length >= 2;
}

describe('客户端源码里的牌 / 技能标识字面量', () => {
  it('每个字面量都存在于卡牌配置里（或登记为非牌 id、或是一族牌 id 的前缀）', () => {
    const unknown: string[] = [];
    let scanned = 0;
    for (const { file, text } of clientSources()) {
      for (const m of stripComments(text).matchAll(ID_LITERAL)) {
        const id = m[2]!;
        scanned++;
        if (
          cardIds.has(id) ||
          skillIds.has(id) ||
          id in NOT_CARD_IDS ||
          isIdFamilyPrefix(id) ||
          id.startsWith(GENERIC_ACTION_PREFIX)
        ) {
          continue;
        }
        unknown.push(`${file}: ${id}`);
      }
    }
    expect(unknown).toEqual([]);
    // 扫描确实读到了源码里的字面量（防止路径或正则失效后测试空转）
    expect(scanned).toBeGreaterThan(30);
  });
});
