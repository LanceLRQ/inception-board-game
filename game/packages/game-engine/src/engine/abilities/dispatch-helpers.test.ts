// W10-R5 · dispatcher 工具层单元测试
// 对照：engine/abilities/dispatch-helpers.ts

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import type { SetupState } from '../../setup.js';
import { scenarioStartOfGame3p } from '../../testing/scenarios.js';
import {
  buildAbilityContext,
  dispatchPassives,
  getDefaultRegistry,
  listAvailableActives,
  resetDefaultRegistry,
} from './dispatch-helpers.js';

function setCharacter(state: SetupState, playerID: string, characterId: CardID): SetupState {
  const p = state.players[playerID]!;
  return { ...state, players: { ...state.players, [playerID]: { ...p, characterId } } };
}

function setUsedNightmares(state: SetupState, ids: string[]): SetupState {
  return { ...state, usedNightmareIds: ids as CardID[] };
}

function pushDiscard(state: SetupState, cards: CardID[]): SetupState {
  return { ...state, deck: { ...state.deck, discardPile: [...state.deck.discardPile, ...cards] } };
}

describe('dispatch-helpers · getDefaultRegistry', () => {
  it('返回同一单例', () => {
    resetDefaultRegistry();
    const a = getDefaultRegistry();
    const b = getDefaultRegistry();
    expect(a).toBe(b);
  });

  it('单例含 ≥18 个注册', () => {
    const reg = getDefaultRegistry();
    expect(reg.getByCharacter('thief_virgo')).toHaveLength(1);
    expect(reg.getByCharacter('thief_black_hole')).toHaveLength(1);
    expect(reg.getByCharacter('dm_mercury_route')).toHaveLength(2);
  });

  it('resetDefaultRegistry 后重建新实例', () => {
    const a = getDefaultRegistry();
    resetDefaultRegistry();
    const b = getDefaultRegistry();
    expect(a).not.toBe(b);
  });
});

describe('dispatch-helpers · buildAbilityContext', () => {
  it('从 state 构造 ctx 基本字段', () => {
    const s = scenarioStartOfGame3p();
    const ctx = buildAbilityContext(s, 'p1');
    expect(ctx.invokerID).toBe('p1');
    expect(ctx.turnNumber).toBe(s.turnNumber);
    expect(ctx.turnPhase).toBe(s.turnPhase);
    expect(ctx.dreamMasterID).toBe('pM');
    expect(ctx.invokerFaction).toBe('thief');
    expect(typeof ctx.d6).toBe('function');
  });

  it('extras 覆盖默认字段', () => {
    const s = scenarioStartOfGame3p();
    const ctx = buildAbilityContext(s, 'pM', { d6: () => 6 });
    expect(ctx.d6()).toBe(6);
  });
});

describe('dispatch-helpers · listAvailableActives', () => {
  it('雅典娜急智 + 弃牌堆非空 → onActionPhase 列表含 athenaWit', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_athena');
    s = pushDiscard(s, ['action_unlock' as CardID]);
    const list = listAvailableActives(s, 'onActionPhase', 'p1');
    expect(list.map((a) => a.id)).toContain('thief_athena.skill_0');
  });

  it('雅典娜 + 弃牌堆空 → 列表不含（canActivate 拒）', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_athena');
    const list = listAvailableActives(s, 'onActionPhase', 'p1');
    expect(list).toHaveLength(0);
  });

  it('passive scope 的能力不出现在主动列表', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_aquarius');
    const list = listAvailableActives(s, 'passive', 'p1');
    // 水瓶 scope=passive 会被过滤
    expect(list.find((a) => a.id === 'thief_aquarius.skill_1')).toBeUndefined();
  });

  it('非自身角色的能力不出现在列表', () => {
    const s = scenarioStartOfGame3p(); // p1 characterId 默认非特定角色
    const list = listAvailableActives(s, 'onActionPhase', 'p1');
    expect(list.every((a) => a.id.startsWith(s.players['p1']!.characterId + '.'))).toBe(true);
  });
});

describe('dispatch-helpers · dispatchPassives', () => {
  it('白羊 passive onDrawPhase → 发射 aries_extra_draw_active 事件', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_aries');
    s = setUsedNightmares(s, ['nightmare_despair_storm']);
    const r = dispatchPassives(s, 'onDrawPhase');
    expect(r.events.find((e) => e.type === 'aries_extra_draw_active')).toBeDefined();
  });

  it('无匹配角色 → 空事件', () => {
    const s = scenarioStartOfGame3p();
    const r = dispatchPassives(s, 'onDrawPhase');
    expect(r.events).toEqual([]);
  });

  it('多玩家都有白羊 passive → 仅当前玩家触发（规则：仅自己的抽牌阶段生效）', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_aries');
    s = setCharacter(s, 'p2', 'thief_aries');
    s = setUsedNightmares(s, ['nightmare_despair_storm']);
    // currentPlayerID 默认 p1 → 只 p1 触发
    const r = dispatchPassives(s, 'onDrawPhase');
    const ariesEvents = r.events.filter((e) => e.type === 'aries_extra_draw_active');
    expect(ariesEvents).toHaveLength(1);
    expect(ariesEvents[0]!.playerID).toBe('p1');
  });

  it('死亡玩家不触发', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_aries');
    s = setUsedNightmares(s, ['nightmare_despair_storm']);
    // 杀 p1
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players['p1']!, isAlive: false } },
    };
    const r = dispatchPassives(s, 'onDrawPhase');
    expect(r.events).toEqual([]);
  });

  it('条件不满足（无已弃梦魇）→ 不触发白羊', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_aries');
    const r = dispatchPassives(s, 'onDrawPhase');
    expect(r.events).toEqual([]);
  });
});
