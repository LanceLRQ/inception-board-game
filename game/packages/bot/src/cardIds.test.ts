// Bot 里写死的牌 id 与卡牌配置对账
import { describe, it, expect } from 'vitest';
import { ACTION_CARDS } from '@icgame/shared';
import { CARD_PRIORITY } from './simpleBot.js';

describe('Bot · 牌 id 与卡牌配置对账', () => {
  const actionIds = new Set<string>(ACTION_CARDS.map((c) => c.id));

  it('手牌优先级表里的每个 id 都是配置里的行动牌', () => {
    const unknown = Object.keys(CARD_PRIORITY).filter((id) => !actionIds.has(id));
    expect(unknown).toEqual([]);
  });

  it('配置里所有 SHOOT 类行动牌都在优先级表里，且取最高优先级', () => {
    const shootIds = ACTION_CARDS.filter((c) => c.subType.startsWith('shoot_')).map((c) => c.id);
    expect(shootIds.length).toBeGreaterThan(0);
    for (const id of shootIds) expect(CARD_PRIORITY[id], id).toBe(1);
  });
});
