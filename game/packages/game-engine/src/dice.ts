// 骰子系统 - 服务端确定性随机
// 对照：plans/design/02-game-rules-spec.md §2.5

export interface DiceResult {
  values: number[];
  total: number;
  modified: number;
  modifiers: DiceModifier[];
}

export interface DiceModifier {
  source: string;
  value: number;
}

// 确定性掷骰（使用 BGIO Random API 的种子）
export function rollDice(
  d6: () => number,
  count: number = 1,
  modifiers: DiceModifier[] = [],
): DiceResult {
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    values.push(d6());
  }
  const total = values.reduce((s, v) => s + v, 0);
  const modSum = modifiers.reduce((s, m) => s + m.value, 0);
  const modified = Math.max(1, Math.min(6, total + modSum));

  return { values, total, modified, modifiers };
}

// 蓝6+红6 骰面定义
export const BLUE_DICE_FACES = [1, 2, 3, 4, 5, 6]; // 心锁用
export const RED_DICE_FACES = [1, 2, 3, 4, 5, 6]; // SHOOT 用

// 判断 SHOOT 结果
export type ShootOutcome = 'kill' | 'move' | 'miss';

export function resolveShoot(roll: number, deathFaces: readonly number[] = [1]): ShootOutcome {
  if (deathFaces.includes(roll)) return 'kill';
  if (roll >= 2 && roll <= 5) return 'move';
  return 'miss';
}
