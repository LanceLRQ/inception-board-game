// 固定场景的登记与按地址参数选择。不引入引擎，主线程可以直接导入。

/** 盗梦者 / 梦主视角，各有一个「无待办」与「有待应答的解封响应窗口」的版本 */
export const FIXTURE_SCENARIO_IDS = ['thief', 'master', 'thief-pending', 'master-pending'] as const;

export type FixtureScenarioId = (typeof FIXTURE_SCENARIO_IDS)[number];

/** 固定场景的人数范围与缺省人数 */
export const FIXTURE_MIN_PLAYERS = 4;
export const FIXTURE_MAX_PLAYERS = 10;
export const FIXTURE_DEFAULT_PLAYERS = 6;

/** 一个固定场景：视角与局面（id）加上人数 */
export interface FixtureScenarioSpec {
  readonly id: FixtureScenarioId;
  readonly players: number;
}

/** 解析人数参数：4–10 的整数；缺失或非法（含小数、超出范围）回落缺省 */
export function parseFixturePlayers(raw: string | null): number {
  if (raw === null || !/^\d+$/.test(raw)) return FIXTURE_DEFAULT_PLAYERS;
  const n = Number(raw);
  return n >= FIXTURE_MIN_PLAYERS && n <= FIXTURE_MAX_PLAYERS ? n : FIXTURE_DEFAULT_PLAYERS;
}

/**
 * 按地址参数选场景：
 *   ?as=master   梦主视角（缺省为盗梦者）
 *   ?pending=1   场景里有一个等待本人应答的【解封】响应窗口
 *   ?players=N   人数 4–10（缺省 6），方便走查座位环在不同人数下的排布
 */
export function resolveFixtureScenario(searchParams: URLSearchParams): FixtureScenarioSpec {
  const master = searchParams.get('as') === 'master';
  const pending = searchParams.get('pending') === '1';
  const id: FixtureScenarioId = master
    ? pending
      ? 'master-pending'
      : 'master'
    : pending
      ? 'thief-pending'
      : 'thief';
  return { id, players: parseFixturePlayers(searchParams.get('players')) };
}
