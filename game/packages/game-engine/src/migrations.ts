// Schema 版本化与迁移框架
// 确保旧版 GameState 可以平滑升级到新版

import { seededShuffle } from './prng.js';
import type { SetupState } from './setup.js';

export const CURRENT_SCHEMA_VERSION = 11;

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
  // v2 → v3：添加 pendingPeekDecision / peekReveal（梦境窥视三段式）
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
  //   对照：docs/manual/05-dream-thieves.md 处女
  [
    6,
    (state) => ({
      ...state,
      pendingVirgoChoice: state.pendingVirgoChoice ?? null,
    }),
  ],
  // v6 → v7：添加 pendingShootResponse（SHOOT pre-roll 响应窗口；当前消费方双鱼·闪避）
  //   对照：docs/manual/05-dream-thieves.md 双鱼
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
  // v8 → v9：贿赂牌的成败改存 kind 字段，标识与池内顺序都不能再透露成败。
  //   旧状态按旧标识前缀补 kind（bribe-deal- 为成功，其余为失败）；只要有任何一张的标识不是
  //   `bribe-<数字>`，就把整个池按对局种子重新洗乱并重新编号。整池一起洗而不是把已派出的牌
  //   保持原顺序：旧池里成功牌排在前，已派出的牌若保持原相对顺序，顺序本身就会泄露成败。
  //   已派出的牌的持有者、成败与状态随牌走，不改。
  [
    9,
    (state) => {
      const pool = state.bribePool;
      if (!Array.isArray(pool)) return state;
      const withKind = pool.map(
        (bribe: Record<string, unknown>): Record<string, unknown> => ({
          ...bribe,
          kind:
            bribe.kind ??
            (typeof bribe.id === 'string' && bribe.id.startsWith('bribe-deal-') ? 'deal' : 'fail'),
        }),
      );
      const opaque = withKind.every(
        (bribe) => typeof bribe.id === 'string' && /^bribe-\d+$/.test(bribe.id),
      );
      if (opaque) return { ...state, bribePool: withKind };
      const seed = typeof state.rngSeed === 'string' ? state.rngSeed : '';
      return {
        ...state,
        bribePool: seededShuffle(withKind, seed, 'bribe-migrate').map((bribe, i) => ({
          ...bribe,
          id: `bribe-${i}`,
        })),
      };
    },
  ],
  // v9 → v10：迷失层与死亡合为同一个状态（对照 docs/manual/08-appendix.md 迷失层条目）。
  //   旧版本里梦魇、世界观、密道等只把人挪进迷失层而不置死亡，这些人无法被复活，却仍被当作活人。
  //   把「在迷失层却标着存活」的玩家规范为已死亡，死亡回合取快照当时的回合数
  [
    10,
    (state) => {
      const players = state.players;
      if (typeof players !== 'object' || players === null) return state;
      const turn = typeof state.turnNumber === 'number' ? state.turnNumber : 0;
      return {
        ...state,
        players: Object.fromEntries(
          Object.entries(players as Record<string, Record<string, unknown>>).map(([id, p]) => [
            id,
            p && p.currentLayer === 0 && p.isAlive === true
              ? { ...p, isAlive: false, deathTurn: turn }
              : p,
          ]),
        ),
      };
    },
  ],
  // v10 → v11：玩家新增两个字段
  //   - layerBeforeLimbo：进入迷失层之前所在的层，梦主回合开始的自动复活按它落点。
  //     旧状态没有记录：已在迷失层的玩家补 1（旧行为就是回第 1 层），其余补 null
  //   - imperialShootCharges：皇城世界观下尚未用掉的 SHOOT 机会数，旧状态补 0
  [
    11,
    (state) => {
      const players = state.players;
      if (typeof players !== 'object' || players === null) return state;
      return {
        ...state,
        players: Object.fromEntries(
          Object.entries(players as Record<string, Record<string, unknown>>).map(([id, p]) => [
            id,
            p && typeof p === 'object'
              ? {
                  ...p,
                  layerBeforeLimbo:
                    p.layerBeforeLimbo ?? (p.currentLayer === 0 && p.isAlive === false ? 1 : null),
                  imperialShootCharges: p.imperialShootCharges ?? 0,
                }
              : p,
          ]),
        ),
      };
    },
  ],
]);

// 错误信息里展示收到的值：字符串带引号以区分 '3' 与 3，数组、null 等用 JSON 表示
function describeValue(value: unknown): string {
  if (typeof value === 'number') return String(value);
  const json = JSON.stringify(value);
  return json === undefined ? String(value) : json;
}

// 将任意 GameState 迁移到当前版本；版本号高于当前版本的状态无法降级，直接抛错
export function migrateGameState(raw: Record<string, unknown>): SetupState {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`快照状态必须是普通对象，收到 ${describeValue(raw)}`);
  }
  let state = { ...raw };
  const declared: unknown = state.schemaVersion;
  if (declared !== undefined && !(Number.isInteger(declared) && (declared as number) >= 0)) {
    throw new Error(`快照 schemaVersion 必须是非负整数，收到 ${describeValue(declared)}`);
  }
  let version = (declared as number | undefined) ?? 0;

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
