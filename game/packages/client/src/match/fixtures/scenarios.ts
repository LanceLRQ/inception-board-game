// 固定场景的登记与按地址参数选择。不引入引擎，主线程可以直接导入。

/** 盗梦者 / 梦主视角，各有一个「无待办」与「有待应答的解封响应窗口」的版本 */
export const FIXTURE_SCENARIO_IDS = ['thief', 'master', 'thief-pending', 'master-pending'] as const;

export type FixtureScenarioId = (typeof FIXTURE_SCENARIO_IDS)[number];

/**
 * 按地址参数选场景：
 *   ?as=master  梦主视角（缺省为盗梦者）
 *   ?pending=1  场景里有一个等待本人应答的【解封】响应窗口
 */
export function resolveFixtureScenario(searchParams: URLSearchParams): FixtureScenarioId {
  const master = searchParams.get('as') === 'master';
  const pending = searchParams.get('pending') === '1';
  if (master) return pending ? 'master-pending' : 'master';
  return pending ? 'thief-pending' : 'thief';
}
