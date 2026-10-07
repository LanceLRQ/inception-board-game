// 骰子系统 - 服务端确定性随机

// 蓝6+红6 骰面定义
export const BLUE_DICE_FACES = [1, 2, 3, 4, 5, 6]; // 心锁用
export const RED_DICE_FACES = [1, 2, 3, 4, 5, 6]; // SHOOT 用

// SHOOT 结算结果
export type ShootOutcome = 'kill' | 'move' | 'miss';

/**
 * 可配置版骰子结算（SHOOT 变体专用）
 * 对照：docs/manual/04-action-cards.md SHOOT·刺客之王 / 爆甲螺旋 / 炸裂弹头
 */
export function resolveShootCustom(
  roll: number,
  deathFaces: readonly number[],
  moveFaces: readonly number[],
): ShootOutcome {
  if (deathFaces.includes(roll)) return 'kill';
  if (moveFaces.includes(roll)) return 'move';
  return 'miss';
}
