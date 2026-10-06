// 固定场景来源：调试路由用，给对局界面一个确定的局面。
//
// 状态由引擎建出并经引擎的视角过滤（见 fixtures/buildScenario.ts），move 不推进状态。
// 场景构造按需动态加载。

import { useEffect, useState } from 'react';
import { logger } from '../lib/logger';
import type { FixtureScenarioSpec } from './fixtures/scenarios';
import type { FixtureScenario } from './fixtures/buildScenario';
import type { MatchSource } from './matchSource';

/** 由已构造好的场景生成来源；move 只记日志，永远成功 */
export function createFixtureSource(scenario: FixtureScenario): MatchSource {
  return {
    kind: 'fixture',
    view: scenario.view,
    seat: scenario.seat,
    seats: scenario.seats,
    deadlineAt: null,
    connection: 'connected',
    storageDegraded: false,
    error: null,
    selfTakenOver: false,
    makeMove: async (move, args = []) => {
      logger.flow('game/fixture', 'move dispatched (state not advanced)', {
        scenario: scenario.id,
        players: scenario.players,
        move,
        args,
      });
      return { ok: true };
    },
    resume: () => {},
  };
}

/** 场景还在加载时的占位来源 */
export const FIXTURE_LOADING_SOURCE: MatchSource = {
  kind: 'fixture',
  view: null,
  seat: null,
  seats: [],
  deadlineAt: null,
  connection: 'connecting',
  storageDegraded: false,
  error: null,
  selfTakenOver: false,
  makeMove: async () => ({ ok: false, code: 'not_ready' }),
  resume: () => {},
};

/** 按场景取固定场景来源；场景切换后先回到加载态，再换成新场景 */
export function useFixtureMatchSource(spec: FixtureScenarioSpec): MatchSource {
  const { id, players } = spec;
  const key = `${id}:${players}`;
  const [loaded, setLoaded] = useState<{ key: string; source: MatchSource } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import('./fixtures/buildScenario')
      .then(({ buildFixtureScenario }) => {
        if (cancelled) return;
        logger.flow('game/fixture', 'scenario ready', { scenario: id, players });
        setLoaded({ key, source: createFixtureSource(buildFixtureScenario(id, players)) });
      })
      .catch((e) => {
        logger.error('game/fixture', 'scenario build failed', e);
        if (cancelled) return;
        setLoaded({
          key,
          source: { ...FIXTURE_LOADING_SOURCE, connection: 'failed', error: (e as Error).message },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [id, players, key]);

  return loaded !== null && loaded.key === key ? loaded.source : FIXTURE_LOADING_SOURCE;
}
