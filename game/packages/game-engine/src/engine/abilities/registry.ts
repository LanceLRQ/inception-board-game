// 能力注册表 — 全局维护所有已注册的能力定义
// 对照：plans/design/05-card-system.md §5.1.2

import type { CardID } from '@icgame/shared';
import type { AbilityDefinition, AbilityRegistry, TriggerTiming } from './types.js';

export class InMemoryAbilityRegistry implements AbilityRegistry {
  private readonly byId = new Map<string, AbilityDefinition>();
  private readonly byTrigger = new Map<TriggerTiming, AbilityDefinition[]>();
  private readonly byCharacter = new Map<string, AbilityDefinition[]>();

  get(id: string): AbilityDefinition | undefined {
    return this.byId.get(id);
  }

  getByTrigger(timing: TriggerTiming): AbilityDefinition[] {
    return this.byTrigger.get(timing) ?? [];
  }

  getByCharacter(characterId: CardID): AbilityDefinition[] {
    const prefix = characterId + '.';
    const results: AbilityDefinition[] = [];
    for (const [, ability] of this.byId) {
      if (ability.id.startsWith(prefix)) {
        results.push(ability);
      }
    }
    return results;
  }

  register(ability: AbilityDefinition): void {
    if (this.byId.has(ability.id)) {
      throw new Error(`Duplicate ability registration: ${ability.id}`);
    }
    this.byId.set(ability.id, ability);

    // 索引触发时机
    if (ability.triggers) {
      for (const t of ability.triggers) {
        const list = this.byTrigger.get(t);
        if (list) {
          list.push(ability);
        } else {
          this.byTrigger.set(t, [ability]);
        }
      }
    }

    // 索引所属角色（id 前缀匹配 "characterId."）
    const dotIdx = ability.id.indexOf('.');
    if (dotIdx > 0) {
      const charId = ability.id.substring(0, dotIdx);
      const list = this.byCharacter.get(charId);
      if (list) {
        list.push(ability);
      } else {
        this.byCharacter.set(charId, [ability]);
      }
    }
  }

  clear(): void {
    this.byId.clear();
    this.byTrigger.clear();
    this.byCharacter.clear();
  }
}
