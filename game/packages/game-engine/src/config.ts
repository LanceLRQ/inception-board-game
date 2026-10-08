// 盗梦都市 - 游戏配置常量
// 对照：docs/manual/02-game-setup.md

// 手牌上限
export const HAND_LIMIT = 5;

// 基础抽牌数
export const BASE_DRAW_COUNT = 2;

// 回合方向
export type TurnDirection = 'clockwise' | 'counter-clockwise' | 'alternating';

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

// 响应窗口超时（秒）
export const RESPONSE_WINDOW_TIMEOUT = 30;

/**
 * 响应窗口超时（毫秒）：【解封】响应窗口的时限，土星·律令的应答窗口也用这一档。
 * 比 45 秒的阻塞型待结算短：律令窗口在土星局里每张牌都要等一次，时限不能太长。
 */
export const RESPONSE_WINDOW_TIMEOUT_MS = RESPONSE_WINDOW_TIMEOUT * 1000;

// 断线分级（秒）
export const DISCONNECT_SILENT = 10;
export const DISCONNECT_OFFLINE = 60;
export const DISCONNECT_FORCE_AI = 180;
