// 入库的生成结果自洽性检查：不依赖内部数据文件，CI 上也能跑
import { describe, it, expect } from 'vitest';
import {
  ACTION_CARDS,
  BRIBE_CARDS,
  CARD_BACK_IMAGES,
  CARD_COPY_COUNT,
  CARD_DEFINITION_COUNT,
  DREAM_CARDS,
  MASTER_CHARACTERS,
  NIGHTMARE_CARDS,
  OTHER_CARDS,
  THIEF_CHARACTERS,
  VAULT_CARDS,
} from './cards.js';
import { ACTION_SUB_TYPES } from '../actionSubTypes.js';
import { BRIBE_PLAYER_COUNTS } from '../codegen/transform.js';

const CHARACTERS = [...THIEF_CHARACTERS, ...MASTER_CHARACTERS];
const ALL_CARDS = [
  ...CHARACTERS,
  ...ACTION_CARDS,
  ...NIGHTMARE_CARDS,
  ...DREAM_CARDS,
  ...VAULT_CARDS,
  ...BRIBE_CARDS,
  ...OTHER_CARDS,
];

const isPositiveInt = (n: unknown): boolean =>
  typeof n === 'number' && Number.isInteger(n) && n > 0;

describe('生成的卡牌配置 · 整体', () => {
  it('卡牌 id 全局唯一，且没有背面占位条目', () => {
    const ids = ALL_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.endsWith('_back'))).toEqual([]);
    expect(ALL_CARDS.filter((c) => c.name === '背面')).toEqual([]);
  });

  it('统计常量与牌表一致：定义数是条目总数，张数只算数据给了张数的牌', () => {
    expect(CARD_DEFINITION_COUNT).toBe(ALL_CARDS.length);
    const sum = (xs: readonly { quantity: number }[]) => xs.reduce((n, c) => n + c.quantity, 0);
    expect(CARD_COPY_COUNT).toBe(
      CHARACTERS.length + sum(ACTION_CARDS) + sum(NIGHTMARE_CARDS) + sum(VAULT_CARDS),
    );
    expect(CARD_COPY_COUNT).toBeGreaterThan(CARD_DEFINITION_COUNT);
  });

  it('每张牌都有名字，图片路径是相对卡图根目录的 webp，且在自己类别的目录下', () => {
    const dirOf = (c: (typeof ALL_CARDS)[number]): string =>
      c.category === 'thief_char'
        ? 'thief'
        : c.category === 'master_char'
          ? 'dream-master'
          : c.category;
    for (const c of ALL_CARDS) {
      expect(c.name, c.id).not.toBe('');
      expect(c.imagePath, c.id).toMatch(/\.webp$/);
      expect(c.imagePath.startsWith('cards/'), c.id).toBe(false);
      expect(c.imagePath.startsWith(`${dirOf(c)}/`), c.id).toBe(true);
    }
  });

  it('通用背面图：六类各一张，路径在对应目录下', () => {
    expect(Object.keys(CARD_BACK_IMAGES).sort()).toEqual(
      ['action', 'bribe', 'nightmare', 'thief', 'vault', 'master'].sort(),
    );
    expect(CARD_BACK_IMAGES.thief).toMatch(/^thief\/.+\.webp$/);
    expect(CARD_BACK_IMAGES.master).toMatch(/^dream-master\/.+\.webp$/);
    for (const k of ['action', 'bribe', 'nightmare', 'vault'] as const) {
      expect(CARD_BACK_IMAGES[k]).toMatch(new RegExp(`^${k}/.+\\.webp$`));
    }
    const all = Object.values(CARD_BACK_IMAGES);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('生成的卡牌配置 · 角色', () => {
  it('阵营与类别相符；技能 id 全局唯一且格式固定', () => {
    for (const c of THIEF_CHARACTERS) {
      expect(c.category).toBe('thief_char');
      expect(c.faction).toBe('thief');
    }
    for (const c of MASTER_CHARACTERS) {
      expect(c.category).toBe('master_char');
      expect(c.faction).toBe('master');
    }
    const skillIds = CHARACTERS.flatMap((c) =>
      [c.front, c.back].flatMap((side) => side?.skills.map((s) => s.id) ?? []),
    );
    expect(new Set(skillIds).size).toBe(skillIds.length);
    for (const c of CHARACTERS) {
      // 整张角色牌连续编号：背面技能接在正面之后
      const all = [...c.front.skills, ...(c.back?.skills ?? [])];
      all.forEach((s, i) => expect(s.id).toBe(`${c.id}.skill_${i}`));
    }
  });

  it('每个角色正面至少一个技能，技能名与描述非空', () => {
    for (const c of CHARACTERS) {
      expect(c.front.skills.length, c.id).toBeGreaterThan(0);
      for (const s of [...c.front.skills, ...(c.back?.skills ?? [])]) {
        expect(s.name, s.id).not.toBe('');
        expect(s.description, s.id).not.toBe('');
      }
    }
  });

  it('每个梦主都有技能与世界观；盗梦者没有世界观', () => {
    expect(MASTER_CHARACTERS.length).toBeGreaterThan(0);
    for (const m of MASTER_CHARACTERS) {
      expect(m.front.worldView, m.id).toBeDefined();
      expect(m.front.worldView!.id).toBe(`${m.id}.worldview`);
      expect(m.front.worldView!.name).not.toBe('');
      expect(m.front.worldView!.description).not.toBe('');
      expect(m.doubleSided).toBe(false);
    }
    for (const t of THIEF_CHARACTERS) expect(t.front.worldView, t.id).toBeUndefined();
  });

  it('双面角色才有背面与背面图；单面角色都没有', () => {
    for (const c of CHARACTERS) {
      expect(!!c.back, c.id).toBe(c.doubleSided);
      expect(!!c.backImagePath, c.id).toBe(c.doubleSided);
      if (c.doubleSided) expect(c.back!.skills.length, c.id).toBeGreaterThan(0);
    }
    expect(THIEF_CHARACTERS.filter((c) => c.doubleSided).map((c) => c.id)).toEqual([
      'thief_gemini',
      'thief_pisces',
      'thief_luna',
    ]);
  });

  it('扩展角色标记：格林射线与达尔文是扩展，其余不是', () => {
    expect(
      CHARACTERS.filter((c) => c.isExpansion)
        .map((c) => c.id)
        .sort(),
    ).toEqual(['thief_darwin', 'thief_green_ray']);
  });
});

describe('生成的卡牌配置 · 行动牌', () => {
  it('规则文字、使用时机与目标都非空，张数是正整数', () => {
    expect(ACTION_CARDS.length).toBeGreaterThan(0);
    for (const c of ACTION_CARDS) {
      expect(c.description, c.id).not.toBe('');
      expect(c.useTiming, c.id).not.toBe('');
      expect(c.useTarget, c.id).not.toBe('');
      expect(isPositiveInt(c.quantity), c.id).toBe(true);
    }
  });

  it('分类取自手工映射表，表与行动牌一一对应、没有多余条目', () => {
    expect(Object.keys(ACTION_SUB_TYPES).sort()).toEqual(ACTION_CARDS.map((c) => c.id).sort());
    for (const c of ACTION_CARDS) expect(c.subType, c.id).toBe(ACTION_SUB_TYPES[c.id]);
  });

  it('SHOOT 类牌（卡名以 SHOOT 开头）的分类都以 shoot_ 开头，其余都不是', () => {
    for (const c of ACTION_CARDS) {
      expect(c.subType.startsWith('shoot_'), c.id).toBe(c.name.startsWith('SHOOT'));
    }
  });
});

describe('生成的卡牌配置 · 其余类别', () => {
  it('梦魇牌与金库牌带正整数张数、非空描述', () => {
    for (const c of [...NIGHTMARE_CARDS, ...VAULT_CARDS]) {
      expect(isPositiveInt(c.quantity), c.id).toBe(true);
      expect(c.description, c.id).not.toBe('');
    }
  });

  it('贿赂牌按 4 到 10 人给出正整数张数', () => {
    expect(BRIBE_CARDS.length).toBeGreaterThan(0);
    for (const c of BRIBE_CARDS) {
      expect(Object.keys(c.quantityByPlayerCount).map(Number)).toEqual([...BRIBE_PLAYER_COUNTS]);
      for (const n of Object.values(c.quantityByPlayerCount))
        expect(isPositiveInt(n), c.id).toBe(true);
    }
  });

  it('梦境牌与其他牌的描述非空', () => {
    expect(OTHER_CARDS.length).toBeGreaterThan(0);
    for (const c of [...DREAM_CARDS, ...OTHER_CARDS]) expect(c.description, c.id).not.toBe('');
  });
});
