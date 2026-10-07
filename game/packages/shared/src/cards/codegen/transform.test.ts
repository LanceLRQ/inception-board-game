import { describe, it, expect } from 'vitest';
import {
  BRIBE_PLAYER_COUNTS,
  countCards,
  normalizeImagePath,
  renderCardsModule,
  transformCards,
  type RawCard,
  type RawCardsData,
} from './transform.js';

// 小型内联样例：每一类各一两张，覆盖单面 / 双面盗梦者、扩展标记、背面占位等情形
function sample(): RawCardsData {
  return {
    cards: {
      thief: [
        {
          id: 'thief_a',
          name: '甲',
          quantity: 1,
          type: 'single',
          sides: [
            {
              side: 'front',
              name: '甲',
              image: 'cards/thief/甲.jpg',
              skills: [
                { name: '技一', description: '技一的描述' },
                { name: '技二', description: '技二的描述' },
              ],
              analyze: '甲的说明',
            },
            { side: 'back', name: '背面', image: 'cards/thief/背面.jpg' },
          ],
        },
        {
          id: 'thief_b',
          name: '乙',
          quantity: 1,
          type: 'double-sided',
          expansion: true,
          sides: [
            {
              side: 'front',
              name: '乙·正',
              image: 'cards/thief/乙正.jpg',
              skills: [{ name: '正技', description: '正技描述' }],
            },
            {
              side: 'back',
              name: '乙·反',
              image: 'cards/thief/乙反.jpg',
              skills: [{ name: '反技', description: '反技描述' }],
              analyze: '乙反的说明',
            },
          ],
        },
      ],
      'dream-master': [
        { id: 'dm_back', name: '背面', type: 'back', image: 'cards/dream-master/背面.jpg' },
        {
          id: 'dm_a',
          name: '港',
          quantity: 1,
          image: 'cards/dream-master/港.jpg',
          skills: [
            { name: '海啸', type: 'skill', description: '海啸描述' },
            { name: '港口', type: 'worldview', description: '港口世界观' },
          ],
          analyze: '港的说明',
        },
      ],
      action: [
        { id: 'action_back', name: '背面', type: 'back', image: 'cards/action/背面.jpg' },
        {
          id: 'action_x',
          name: 'X',
          quantity: 3,
          useTiming: '你的出牌阶段',
          useTarget: '你。',
          image: 'cards/action/X.jpg',
          description: 'X 的规则',
          analyze: 'X 的说明',
        },
        {
          id: 'action_y',
          name: 'Y',
          quantity: 2,
          useTiming: '你的任意阶段',
          useTarget: '另一位玩家。',
          image: 'cards/action/Y.jpg',
          description: 'Y 的规则',
        },
      ],
      dream: [{ id: 'dream_1', name: '1层', image: 'cards/dream/1.jpg', description: '第1层梦境' }],
      bribe: [
        { id: 'bribe_back', name: '背面', type: 'back', image: 'cards/bribe/背面.jpg' },
        {
          id: 'bribe_success',
          name: '成功',
          quantity: [1, 1, 1, 2, 2, 2, 3],
          image: 'cards/bribe/成功.jpg',
          description: '贿赂成功',
        },
      ],
      vault: [
        { id: 'vault_back', name: '背面', type: 'back', image: 'cards/vault/背面.jpg' },
        {
          id: 'vault_gold',
          name: '金币',
          quantity: 3,
          image: 'cards/vault/金币.jpg',
          description: '金库中放置金币',
        },
      ],
      nightmare: [
        { id: 'nightmare_back', name: '背面', type: 'back', image: 'cards/nightmare/背面.jpg' },
        {
          id: 'nightmare_a',
          name: '梦魇甲',
          quantity: 1,
          image: 'cards/nightmare/甲.jpg',
          description: '梦魇甲的规则',
          analyze: '梦魇甲的说明',
        },
      ],
      other: [{ id: 'other_a', name: '参考牌', image: 'cards/other/a.png', description: '说明' }],
    },
  };
}

const SUB_TYPES = { action_x: 'kick', action_y: 'shoot_special' } as const;
const run = (raw: RawCardsData = sample()) => transformCards(raw, { actionSubTypes: SUB_TYPES });

function mutate(edit: (raw: RawCardsData) => void): RawCardsData {
  const raw = sample();
  edit(raw);
  return raw;
}

describe('normalizeImagePath', () => {
  it('把 jpg / jpeg / png 换成 webp 并去掉 cards/ 前缀', () => {
    expect(normalizeImagePath('cards/thief/甲.jpg')).toBe('thief/甲.webp');
    expect(normalizeImagePath('cards/other/a.PNG')).toBe('other/a.webp');
    expect(normalizeImagePath('cards/x/y.jpeg')).toBe('x/y.webp');
  });
});

describe('transformCards · 角色', () => {
  it('单面盗梦者：技能编号 skill_N，说明与图片随数据，没有 back 与 backImagePath', () => {
    const a = run().thiefCharacters.find((c) => c.id === 'thief_a')!;
    expect(a).toEqual({
      category: 'thief_char',
      id: 'thief_a',
      name: '甲',
      faction: 'thief',
      doubleSided: false,
      front: {
        sideName: '甲',
        skills: [
          { id: 'thief_a.skill_0', name: '技一', description: '技一的描述' },
          { id: 'thief_a.skill_1', name: '技二', description: '技二的描述' },
        ],
        analysis: '甲的说明',
      },
      imagePath: 'thief/甲.webp',
      isExpansion: false,
    });
  });

  it('双面盗梦者：背面技能编号 back.skill_N，带背面图与扩展标记；没有说明的面不带 analysis', () => {
    const b = run().thiefCharacters.find((c) => c.id === 'thief_b')!;
    expect(b.doubleSided).toBe(true);
    expect(b.isExpansion).toBe(true);
    expect(b.front.analysis).toBeUndefined();
    expect('analysis' in b.front).toBe(false);
    expect(b.back).toEqual({
      sideName: '乙·反',
      skills: [{ id: 'thief_b.back.skill_0', name: '反技', description: '反技描述' }],
      analysis: '乙反的说明',
    });
    expect(b.backImagePath).toBe('thief/乙反.webp');
  });

  it('梦主：技能与世界观分开，世界观 id 为 <id>.worldview，背面占位条目不算角色', () => {
    const { masterCharacters } = run();
    expect(masterCharacters.map((c) => c.id)).toEqual(['dm_a']);
    const m = masterCharacters[0]!;
    expect(m.faction).toBe('master');
    expect(m.front.sideName).toBe('港');
    expect(m.front.skills).toEqual([{ id: 'dm_a.skill_0', name: '海啸', description: '海啸描述' }]);
    expect(m.front.worldView).toEqual({
      id: 'dm_a.worldview',
      name: '港口',
      description: '港口世界观',
    });
    expect(m.imagePath).toBe('dream-master/港.webp');
  });

  it('梦主缺世界观、缺技能、条目类型未知时报错', () => {
    const noWorld = mutate((r) => {
      r.cards['dream-master']![1]!.skills!.pop();
    });
    expect(() => run(noWorld)).toThrow(/世界观/);
    const noSkill = mutate((r) => {
      r.cards['dream-master']![1]!.skills!.shift();
    });
    expect(() => run(noSkill)).toThrow(/没有技能/);
    const unknown = mutate((r) => {
      r.cards['dream-master']![1]!.skills!.push({ name: '?', type: 'other', description: '?' });
    });
    expect(() => run(unknown)).toThrow(/type/);
  });

  it('单面盗梦者的背面带技能、双面盗梦者的背面没技能、角色张数不为 1 时报错', () => {
    const singleWithBackSkill = mutate((r) => {
      r.cards.thief![0]!.sides![1]!.skills = [{ name: 'x', description: 'x' }];
    });
    expect(() => run(singleWithBackSkill)).toThrow(/单面角色/);
    const doubleWithoutBackSkill = mutate((r) => {
      delete r.cards.thief![1]!.sides![1]!.skills;
    });
    expect(() => run(doubleWithoutBackSkill)).toThrow(/背面没有技能/);
    const twoCopies = mutate((r) => {
      r.cards.thief![0]!.quantity = 2;
    });
    expect(() => run(twoCopies)).toThrow(/张数应为 1/);
  });
});

describe('transformCards · 行动牌', () => {
  it('规则文字、使用时机与目标、张数、说明都带进来，分类取自映射表', () => {
    const { actionCards } = run();
    expect(actionCards).toEqual([
      {
        category: 'action',
        id: 'action_x',
        name: 'X',
        subType: 'kick',
        quantity: 3,
        isExpansion: false,
        description: 'X 的规则',
        useTiming: '你的出牌阶段',
        useTarget: '你。',
        analysis: 'X 的说明',
        imagePath: 'action/X.webp',
      },
      {
        category: 'action',
        id: 'action_y',
        name: 'Y',
        subType: 'shoot_special',
        quantity: 2,
        isExpansion: false,
        description: 'Y 的规则',
        useTiming: '你的任意阶段',
        useTarget: '另一位玩家。',
        imagePath: 'action/Y.webp',
      },
    ]);
  });

  it('数据里的扩展标记会带进行动牌', () => {
    const raw = mutate((r) => {
      r.cards.action![1]!.expansion = true;
    });
    expect(run(raw).actionCards[0]!.isExpansion).toBe(true);
  });

  it('行动牌不在分类表里、或表里有数据里没有的行动牌时报错', () => {
    expect(() => transformCards(sample(), { actionSubTypes: { action_x: 'kick' } })).toThrow(
      /不在分类表/,
    );
    expect(() =>
      transformCards(sample(), { actionSubTypes: { ...SUB_TYPES, action_z: 'kick' } }),
    ).toThrow(/分类表里有这张行动牌/);
  });

  it('缺规则文字或张数不是正整数时报错', () => {
    const noDesc = mutate((r) => {
      r.cards.action![1]!.description = '';
    });
    expect(() => run(noDesc)).toThrow(/description/);
    const badQty = mutate((r) => {
      r.cards.action![1]!.quantity = 0;
    });
    expect(() => run(badQty)).toThrow(/quantity/);
    const noTiming = mutate((r) => {
      delete r.cards.action![1]!.useTiming;
    });
    expect(() => run(noTiming)).toThrow(/useTiming/);
  });
});

describe('transformCards · 其余类别', () => {
  it('梦魇牌、金库牌带张数；梦境牌与其他牌照搬', () => {
    const t = run();
    expect(t.nightmareCards).toEqual([
      {
        category: 'nightmare',
        id: 'nightmare_a',
        name: '梦魇甲',
        description: '梦魇甲的规则',
        quantity: 1,
        analysis: '梦魇甲的说明',
        imagePath: 'nightmare/甲.webp',
      },
    ]);
    expect(t.vaultCards[0]).toMatchObject({ id: 'vault_gold', quantity: 3 });
    expect(t.dreamCards[0]).toMatchObject({ id: 'dream_1', description: '第1层梦境' });
    expect(t.otherCards).toEqual([
      {
        category: 'other',
        id: 'other_a',
        name: '参考牌',
        description: '说明',
        imagePath: 'other/a.webp',
      },
    ]);
  });

  it('贿赂牌的张数按 4 到 10 人展开', () => {
    const bribe = run().bribeCards[0]!;
    expect(Object.keys(bribe.quantityByPlayerCount).map(Number)).toEqual([...BRIBE_PLAYER_COUNTS]);
    expect(bribe.quantityByPlayerCount).toEqual({ 4: 1, 5: 1, 6: 1, 7: 2, 8: 2, 9: 2, 10: 3 });
  });

  it('贿赂牌的张数项数不对或含非正整数时报错', () => {
    const short = mutate((r) => {
      r.cards.bribe![1]!.quantity = [1, 2, 3];
    });
    expect(() => run(short)).toThrow(/数组/);
    const scalar = mutate((r) => {
      r.cards.bribe![1]!.quantity = 2;
    });
    expect(() => run(scalar)).toThrow(/数组/);
    const bad = mutate((r) => {
      r.cards.bribe![1]!.quantity = [1, 1, 0, 2, 2, 2, 3];
    });
    expect(() => run(bad)).toThrow(/quantity\[2\]/);
  });
});

describe('transformCards · 背面', () => {
  it('背面占位条目不进任何牌表，通用背面图单独给出', () => {
    const t = run();
    const ids = [
      ...t.thiefCharacters,
      ...t.masterCharacters,
      ...t.actionCards,
      ...t.nightmareCards,
      ...t.dreamCards,
      ...t.vaultCards,
      ...t.bribeCards,
      ...t.otherCards,
    ].map((c) => c.id);
    expect(ids.some((id) => id.endsWith('_back'))).toBe(false);
    expect(t.backImages).toEqual({
      thief: 'thief/背面.webp',
      master: 'dream-master/背面.webp',
      action: 'action/背面.webp',
      bribe: 'bribe/背面.webp',
      vault: 'vault/背面.webp',
      nightmare: 'nightmare/背面.webp',
    });
  });

  it('某类缺背面占位、或单面盗梦者的背面图不一致时报错', () => {
    const noBack = mutate((r) => {
      r.cards.vault = r.cards.vault!.filter((c) => c.type !== 'back');
    });
    expect(() => run(noBack)).toThrow(/背面占位条目/);
    const twoThiefBacks = mutate((r) => {
      const extra: RawCard = {
        id: 'thief_c',
        name: '丙',
        quantity: 1,
        type: 'single',
        sides: [
          {
            side: 'front',
            name: '丙',
            image: 'cards/thief/丙.jpg',
            skills: [{ name: 'x', description: 'x' }],
          },
          { side: 'back', name: '背面', image: 'cards/thief/另一种背面.jpg' },
        ],
      };
      r.cards.thief!.push(extra);
    });
    expect(() => run(twoThiefBacks)).toThrow(/背面图/);
  });
});

describe('transformCards · 整体校验', () => {
  it('卡牌 id 重复时报错（跨类别也算）', () => {
    const dup = mutate((r) => {
      r.cards.other![0]!.id = 'dream_1';
    });
    expect(() => run(dup)).toThrow(/重复/);
  });

  it('缺少某一类牌表时报错', () => {
    const raw = sample();
    delete raw.cards.nightmare;
    expect(() => run(raw)).toThrow(/nightmare/);
  });

  it('同样的输入得到同样的输出', () => {
    expect(run()).toEqual(run());
    expect(renderCardsModule(run())).toBe(renderCardsModule(run()));
  });
});

describe('countCards', () => {
  it('定义数不含背面；实体张数只算数据给了张数的牌，贿赂牌不计', () => {
    const t = run();
    // 定义：2 盗梦者 + 1 梦主 + 2 行动 + 1 梦魇 + 1 梦境 + 1 金库 + 1 贿赂 + 1 其他
    expect(countCards(t)).toEqual({
      definitions: 10,
      // 角色 3 + 行动 3+2 + 梦魇 1 + 金库 3
      copies: 12,
    });
  });
});

describe('renderCardsModule', () => {
  it('头部不含内部路径，导出各牌表、通用背面与两个统计常量', () => {
    const src = renderCardsModule(run());
    expect(src).toContain('AUTO-GENERATED');
    expect(src).not.toContain('docs/');
    for (const name of [
      'THIEF_CHARACTERS',
      'MASTER_CHARACTERS',
      'ACTION_CARDS',
      'NIGHTMARE_CARDS',
      'DREAM_CARDS',
      'VAULT_CARDS',
      'BRIBE_CARDS',
      'OTHER_CARDS',
      'CARD_BACK_IMAGES',
      'CARD_DEFINITION_COUNT = 10',
      'CARD_COPY_COUNT = 12',
    ]) {
      expect(src).toContain(`export const ${name}`);
    }
    expect(src).not.toContain('ALL_CARD_COUNT');
  });
});
