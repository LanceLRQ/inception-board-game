// 能力注册表测试

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAbilityRegistry } from './registry.js';
import type { AbilityDefinition } from './types.js';

// 测试用最小 AbilityDefinition
function makeAbility(overrides: Partial<AbilityDefinition> & { id: string }): AbilityDefinition {
  return {
    name: overrides.id,
    description: '',
    kind: 'skill',
    priorityBucket: 1,
    canActivate: () => ({ ok: true }),
    getRequiredInputs: () => [],
    apply: () => ({ state: null, events: [] }),
    ...overrides,
  };
}

describe('InMemoryAbilityRegistry', () => {
  let registry: InMemoryAbilityRegistry;

  beforeEach(() => {
    registry = new InMemoryAbilityRegistry();
  });

  describe('register + get', () => {
    it('注册后可通过 ID 获取', () => {
      const ability = makeAbility({ id: 'thief_pointman.skill_0' });
      registry.register(ability);
      expect(registry.get('thief_pointman.skill_0')).toBe(ability);
    });

    it('未注册的 ID 返回 undefined', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('重复注册同一 ID 抛错', () => {
      const ability = makeAbility({ id: 'dup' });
      registry.register(ability);
      expect(() => registry.register(makeAbility({ id: 'dup' }))).toThrow(
        'Duplicate ability registration: dup',
      );
    });
  });

  describe('getByTrigger', () => {
    it('按触发时机检索', () => {
      const a1 = makeAbility({ id: 'a1', triggers: ['onTurnStart'] });
      const a2 = makeAbility({ id: 'a2', triggers: ['onTurnStart', 'onTurnEnd'] });
      const a3 = makeAbility({ id: 'a3', triggers: ['onDrawPhase'] });
      registry.register(a1);
      registry.register(a2);
      registry.register(a3);

      const onStart = registry.getByTrigger('onTurnStart');
      expect(onStart).toHaveLength(2);
      expect(onStart.map((a) => a.id)).toContain('a1');
      expect(onStart.map((a) => a.id)).toContain('a2');

      const onEnd = registry.getByTrigger('onTurnEnd');
      expect(onEnd).toHaveLength(1);
      expect(onEnd[0]!.id).toBe('a2');

      const onDraw = registry.getByTrigger('onDrawPhase');
      expect(onDraw).toHaveLength(1);
    });

    it('无匹配时返回空数组', () => {
      expect(registry.getByTrigger('onKilled')).toEqual([]);
    });
  });

  describe('getByCharacter', () => {
    it('按角色 ID 前缀检索', () => {
      const s1 = makeAbility({ id: 'thief_pointman.skill_0' });
      const s2 = makeAbility({ id: 'thief_pointman.skill_1' });
      const s3 = makeAbility({ id: 'dm_fortress.skill_0' });
      registry.register(s1);
      registry.register(s2);
      registry.register(s3);

      const pointman = registry.getByCharacter('thief_pointman');
      expect(pointman).toHaveLength(2);

      const fortress = registry.getByCharacter('dm_fortress');
      expect(fortress).toHaveLength(1);

      const none = registry.getByCharacter('thief_joker');
      expect(none).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('清空后所有查询返回空', () => {
      registry.register(makeAbility({ id: 'a', triggers: ['onTurnStart'] }));
      registry.register(makeAbility({ id: 'b', triggers: ['onDrawPhase'] }));
      registry.clear();

      expect(registry.get('a')).toBeUndefined();
      expect(registry.getByTrigger('onTurnStart')).toEqual([]);
      expect(registry.getByCharacter('a')).toEqual([]);
    });
  });
});
