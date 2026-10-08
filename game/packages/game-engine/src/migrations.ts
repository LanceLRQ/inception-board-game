// Schema 版本化与迁移框架
// 确保旧版 GameState 可以平滑升级到新版

import { seededShuffle } from './prng.js';
import type { SetupState } from './setup.js';

export const CURRENT_SCHEMA_VERSION = 16;

type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/**
 * 统一牌与技能标识时改掉的旧写法（旧 → 新），由第 13 版的迁移使用。
 * 状态里这些标识出现在手牌、牌库、弃牌堆、出牌记录等牌 id 的位置，
 * 也出现在玩家的技能使用记录（skillUsedThisTurn / skillUsedThisGame）的键上，
 * 按阶段计数的键带 `:<阶段>` 后缀。
 */
export const RENAMED_IDS: Readonly<Record<string, string>> = {
  action_shoot_king: 'action_shoot_assassin',
  action_shoot_armor: 'action_shoot_drill',
  'dm_saturn_territory.world.skill': 'dm_saturn_territory.worldview',
  'dm_mars_battlefield.world.skill': 'dm_mars_battlefield.worldview',
  'dm_imperial_city.world_0': 'dm_imperial_city.worldview',
  'dm_venus_mirror.world_0': 'dm_venus_mirror.worldview',
  'dm_mercury_route.skill_1': 'dm_mercury_route.skill_0',
};

/** 把一个字符串里的旧标识换成新标识：整串相等，或带 `:<阶段>` 后缀的键 */
function renameId(text: string, renames: Readonly<Record<string, string>>): string {
  const direct = renames[text];
  if (direct !== undefined) return direct;
  const colon = text.indexOf(':');
  if (colon > 0) {
    const head = renames[text.slice(0, colon)];
    if (head !== undefined) return head + text.slice(colon);
  }
  return text;
}

/** 递归改写状态里所有字符串值与对象键 */
export function renameIdsDeep(value: unknown, renames: Readonly<Record<string, string>>): unknown {
  if (typeof value === 'string') return renameId(value, renames);
  if (Array.isArray(value)) return value.map((item) => renameIdsDeep(item, renames));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        renameId(key, renames),
        renameIdsDeep(item, renames),
      ]),
    );
  }
  return value;
}

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
  // v11 → v12：新增 pendingVaultDecision（金币金库打开后梦主三选一的等待态），旧存档补 null。
  //   对照：docs/manual/03-game-flow.md 金库、梦魇牌
  [
    12,
    (state) => ({
      ...state,
      pendingVaultDecision: state.pendingVaultDecision ?? null,
    }),
  ],
  // v12 → v13：牌与技能标识统一成一套（见 RENAMED_IDS），状态里的旧写法一并改过来
  [13, (state) => renameIdsDeep(state, RENAMED_IDS) as Record<string, unknown>],
  // v13 → v14：新增 pendingBlackHoleLevy（黑洞·吞噬的交牌等待态），旧存档补 null。
  //   旧版本里黑洞发动是一步完成（由发动者指明别人的牌），不会留下进行中的吞噬，所以只需补字段
  //   对照：docs/manual/05-dream-thieves.md:150-158 黑洞
  [
    14,
    (state) => ({
      ...state,
      pendingBlackHoleLevy: state.pendingBlackHoleLevy ?? null,
    }),
  ],
  // v14 → v15：新增 pendingDarwinReturn（达尔文·淘汰的选牌等待态），旧存档补 null。
  //   旧版本里达尔文发动是一步完成（发动者一次指明放回哪两张），不会留下进行中的发动，所以只需补字段
  [
    15,
    (state) => ({
      ...state,
      pendingDarwinReturn: state.pendingDarwinReturn ?? null,
    }),
  ],
  // v15 → v16：新增 pendingAthenaWit（雅典娜·急智的应答等待态），旧存档补 null。
  //   旧版本的急智是回合外随时可发的 move，不会留下进行中的应答，所以只需补字段。
  //   雅典娜的使用次数改按回合号记录（thief_athena.skill_0.turn），旧存档里没有这条记录等于本回合还没用过
  [
    16,
    (state) => ({
      ...state,
      pendingAthenaWit: state.pendingAthenaWit ?? null,
    }),
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
