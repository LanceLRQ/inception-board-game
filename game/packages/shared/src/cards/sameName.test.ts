// 同名牌判定：SHOOT·梦境穿梭剂同时是 SHOOT 与梦境穿梭剂的同名牌，其余只有同一种牌才同名
// 对照：docs/manual/04-action-cards.md:165

import { describe, expect, it } from 'vitest';
import type { CardID } from '../types/enums.js';
import { ACTION_CARDS } from './generated/cards.js';
import { isSameNameCard } from './sameName.js';

const c = (id: string) => id as CardID;
const SHOOT = c('action_shoot');
const HYBRID = c('action_shoot_dream_transit');
const TRANSIT = c('action_dream_transit');

describe('isSameNameCard', () => {
  it('同一种牌同名', () => {
    for (const card of ACTION_CARDS)
      expect(isSameNameCard(c(card.id), c(card.id)), card.id).toBe(true);
  });

  it('SHOOT·梦境穿梭剂与 SHOOT、梦境穿梭剂互为同名（两个方向都成立）', () => {
    expect(isSameNameCard(SHOOT, HYBRID)).toBe(true);
    expect(isSameNameCard(HYBRID, SHOOT)).toBe(true);
    expect(isSameNameCard(TRANSIT, HYBRID)).toBe(true);
    expect(isSameNameCard(HYBRID, TRANSIT)).toBe(true);
  });

  it('同名关系不传递：SHOOT 与梦境穿梭剂不同名', () => {
    expect(isSameNameCard(SHOOT, TRANSIT)).toBe(false);
    expect(isSameNameCard(TRANSIT, SHOOT)).toBe(false);
  });

  it('其余任意两种不同的牌都不同名（特殊 SHOOT 各有各的名字）', () => {
    const exempt = new Set([HYBRID]);
    for (const a of ACTION_CARDS) {
      for (const b of ACTION_CARDS) {
        if (a.id === b.id || exempt.has(c(a.id)) || exempt.has(c(b.id))) continue;
        expect(isSameNameCard(c(a.id), c(b.id)), `${a.id} ${b.id}`).toBe(false);
      }
    }
  });

  it('混合牌配置里确实是 SHOOT 与梦境穿梭剂的混合（对账用）', () => {
    expect(ACTION_CARDS.find((x) => x.id === HYBRID)?.subType).toBe('shoot_hybrid');
  });
});
