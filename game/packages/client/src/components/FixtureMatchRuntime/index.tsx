// 固定场景对局：把固定场景来源接到通用的对局界面上。
// 用于调试路由（/game/:matchId 不带 online / friend 参数）：界面与真实对局完全一样，
// 只是状态来自一个确定的场景，操作不会推进状态。

import { useFixtureMatchSource } from '../../match/useFixtureMatchSource';
import type { FixtureScenarioSpec } from '../../match/fixtures/scenarios';
import { MatchRuntime } from '../MatchRuntime';

interface FixtureMatchRuntimeProps {
  readonly scenario: FixtureScenarioSpec;
  /** 顶部状态栏右上角补充文字 */
  readonly topRight?: React.ReactNode;
  /** 结束/重开回调（固定场景不会结束，仅为界面接口完整） */
  readonly onRestart?: () => void;
}

export function FixtureMatchRuntime({ scenario, topRight, onRestart }: FixtureMatchRuntimeProps) {
  const source = useFixtureMatchSource(scenario);
  return <MatchRuntime source={source} topRight={topRight} onRestart={onRestart} />;
}
