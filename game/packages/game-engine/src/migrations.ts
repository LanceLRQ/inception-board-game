// Schema 版本化与迁移框架
// 确保旧版 GameState 可以平滑升级到新版

import type { SetupState } from './setup.js';

export const CURRENT_SCHEMA_VERSION = 8;

type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

// 迁移链：按版本号顺序排列
const MIGRATIONS: Map<number, Migration> = new Map<number, Migration>([
  // v1 → v2：添加 pendingLibra（天秤）+ mazeState（筑梦师·迷宫）字段
  [
    2,
    (state) => ({
      ...state,
      pendingLibra: state.pendingLibra ?? null,
      mazeState: state.mazeState ?? null,
    }),
  ],
  // v2 → v3：添加 pendingPeekDecision / peekReveal（梦境窥视三段式 W19-B F5/F8）
  [
    3,
    (state) => ({
      ...state,
      pendingPeekDecision: state.pendingPeekDecision ?? null,
      peekReveal: state.peekReveal ?? null,
    }),
  ],
  // v3 → v4：添加 pendingShootMove（SHOOT 判定 move 时发动方选层响应窗口）
  //   对照：docs/manual/04-action-cards.md SHOOT 解析 "由你来选择移动"
  [
    4,
    (state) => ({
      ...state,
      pendingShootMove: state.pendingShootMove ?? null,
    }),
  ],
  // v4 → v5：添加 pendingAriesChoice（白羊·星尘 onKilled 响应窗口简化版）
  //   对照：docs/manual/05-dream-thieves.md 白羊
  [
    5,
    (state) => ({
      ...state,
      pendingAriesChoice: state.pendingAriesChoice ?? null,
    }),
  ],
  // v5 → v6：添加 pendingVirgoChoice（处女·完美 onAfterShoot roll=6 三选一响应窗口）
  //   对照：docs/manual/05-dream-thieves.md 处女 / docs/_internal/TASKS.md W20.5
  [
    6,
    (state) => ({
      ...state,
      pendingVirgoChoice: state.pendingVirgoChoice ?? null,
    }),
  ],
  // v6 → v7：添加 pendingShootResponse（SHOOT pre-roll 响应窗口；当前消费方双鱼·闪避 W20.5-C）
  //   对照：docs/manual/05-dream-thieves.md 双鱼 / docs/_internal/TASKS.md W20.5
  [
    7,
    (state) => ({
      ...state,
      pendingShootResponse: state.pendingShootResponse ?? null,
    }),
  ],
  // v7 → v8：补齐此前各版没有补的顶层字段（它们在第一版之后才加入状态，旧快照里可能没有），
  //   默认值与创建初始状态时一致；玩家对象里缺少的计数字段同样补上
  [
    8,
    (state) => {
      const players = state.players;
      const filledPlayers =
        typeof players === 'object' && players !== null
          ? Object.fromEntries(
              Object.entries(players as Record<string, Record<string, unknown>>).map(
                ([id, player]) => [
                  id,
                  { ...player, successfulUnlocksThisTurn: player.successfulUnlocksThisTurn ?? 0 },
                ],
              ),
            )
          : players;
      return {
        ...state,
        ...(filledPlayers === undefined ? {} : { players: filledPlayers }),
        pendingUnlock: state.pendingUnlock ?? null,
        pendingGraft: state.pendingGraft ?? null,
        pendingResonance: state.pendingResonance ?? null,
        pendingGravity: state.pendingGravity ?? null,
        shiftSnapshot: state.shiftSnapshot ?? null,
        pendingResponseWindow: state.pendingResponseWindow ?? null,
        pendingSudgerRolls: state.pendingSudgerRolls ?? null,
        playedCardsThisTurn: state.playedCardsThisTurn ?? [],
        lastPlayedCardThisTurn: state.lastPlayedCardThisTurn ?? null,
        lastShootRoll: state.lastShootRoll ?? null,
        removedFromGame: state.removedFromGame ?? [],
      };
    },
  ],
]);

// 将任意 GameState 迁移到当前版本；版本号高于当前版本的状态无法降级，直接抛错
export function migrateGameState(raw: Record<string, unknown>): SetupState {
  let state = { ...raw };
  let version = (state.schemaVersion as number) ?? 0;

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(`快照版本 ${version} 高于当前版本 ${CURRENT_SCHEMA_VERSION}，无法迁移`);
  }

  while (version < CURRENT_SCHEMA_VERSION) {
    const migration = MIGRATIONS.get(version + 1);
    if (migration) {
      state = migration(state);
    }
    version++;
    state.schemaVersion = version;
  }

  // 确保 moveCounter 和 schemaVersion 存在
  if (state.moveCounter === undefined) {
    state.moveCounter = 0;
  }
  state.schemaVersion = CURRENT_SCHEMA_VERSION;

  return state as unknown as import('./setup.js').SetupState;
}

// 获取当前 schema 版本
export function getSchemaVersion(): number {
  return CURRENT_SCHEMA_VERSION;
}
