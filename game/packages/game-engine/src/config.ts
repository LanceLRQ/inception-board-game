// 盗梦都市 - 游戏配置常量
// 对照：docs/manual/02-game-setup.md + plans/design/02-game-rules-spec.md §2.2

// 手牌上限
export const HAND_LIMIT = 5;

// 基础抽牌数
export const BASE_DRAW_COUNT = 2;

// 回合方向
export type TurnDirection = 'clockwise' | 'counter-clockwise' | 'alternating';
export const DEFAULT_TURN_DIRECTION: TurnDirection = 'counter-clockwise';

// 玩家人数配置表
export interface PlayerCountConfig {
  heartLocks: [number, number, number, number]; // L1-L4
  dealCount: number;
  shatterCount: number;
}

export const PLAYER_COUNT_CONFIGS: Record<number, PlayerCountConfig> = {
  4: { heartLocks: [4, 3, 2, 1], dealCount: 1, shatterCount: 1 },
  5: { heartLocks: [5, 4, 3, 2], dealCount: 1, shatterCount: 2 },
  6: { heartLocks: [5, 4, 3, 2], dealCount: 1, shatterCount: 2 },
  7: { heartLocks: [5, 4, 3, 2], dealCount: 2, shatterCount: 1 },
  8: { heartLocks: [6, 5, 4, 3], dealCount: 2, shatterCount: 1 },
  9: { heartLocks: [6, 5, 4, 3], dealCount: 2, shatterCount: 1 },
  10: { heartLocks: [6, 5, 4, 3], dealCount: 3, shatterCount: 2 },
};

// 金库类型配置
export const VAULT_SECRET_COUNT = 1;
export const VAULT_COIN_COUNT = 3;

// 梦境层数
export const LAYER_COUNT = 4; // 1-4

// SHOOT 死亡面
export const SHOOT_DEATH_FACES = [1];
export const SHOOT_ASSASSIN_DEATH_FACES = [1, 2];
export const SHOOT_ARMOR_PIERCING_DEATH_FACES = [1, 2];
export const SHOOT_EXPLOSIVE_DEATH_FACES = [1, 2];

// 响应窗口超时（秒）
export const RESPONSE_WINDOW_TIMEOUT = 30;

// 断线分级（秒）
export const DISCONNECT_SILENT = 10;
export const DISCONNECT_OFFLINE = 60;
export const DISCONNECT_FORCE_AI = 180;
