// 固定场景来源：调试路由用，给对局界面一个确定的局面。
//
// 状态由引擎建出并经引擎的视角过滤（见 fixtures/buildScenario.ts），move 不推进状态。
// 场景构造按需动态加载。

import { useEffect, useMemo, useState } from 'react';
import type { MatchViewState } from '@icgame/game-engine';
import { monotonicNow } from '../lib/deadlineClock';
import { logger } from '../lib/logger';
import type { ReportChannel, ReportOutcome } from '../lib/reportApi';
import { appendChatEntry, NO_CHAT, type ChatChannel, type ChatEntry } from './chat';
import type { FixtureExtras, FixtureScenarioSpec } from './fixtures/scenarios';
import type { FixtureScenario } from './fixtures/buildScenario';
import type { MatchSource } from './matchSource';

/** 示例消息：别的座位发的几条预设短语 */
const SEED_PHRASES = ['greet_hi', 'emotion_wow', 'tactic_wait', 'feedback_nicemove'] as const;

/** 固定场景的示例聊天：不是本人的座位轮流发几条预设短语，收到时刻都是 now */
export function seedFixtureChat(scenario: FixtureScenario, now: number): ChatEntry[] {
  const others = scenario.seats.filter((s) => s.seat !== scenario.seat);
  return SEED_PHRASES.map((presetId, i) => ({
    id: i + 1,
    seat: others[i % others.length]!.seat,
    presetId,
    at: now,
  }));
}

/** 对局已结束的视图：盗梦者胜；不改原视图 */
function finishedView(view: MatchViewState): MatchViewState {
  return {
    ...view,
    ctx: { ...view.ctx, gameover: { winner: 'thief', reason: 'secret_vault_opened' } },
  };
}

const REPORT_RESULTS: Record<NonNullable<FixtureExtras['outcome']>, ReportOutcome> = {
  ok: { ok: true },
  duplicate: { ok: false, code: 'duplicate' },
  failed: { ok: false, code: 'network' },
};

/** 由已构造好的场景生成来源；move 只记日志，永远成功 */
export function createFixtureSource(
  scenario: FixtureScenario,
  extras: FixtureExtras = {},
  chat: ChatChannel = NO_CHAT,
): MatchSource {
  const { outcome } = extras;
  const report: ReportChannel | null =
    outcome === undefined ? null : { submit: async () => REPORT_RESULTS[outcome] };
  return {
    kind: 'fixture',
    view: outcome === undefined ? scenario.view : finishedView(scenario.view),
    seat: scenario.seat,
    // 走查局后举报时，对手按真人对待（Bot 不能被举报）
    seats:
      outcome === undefined ? scenario.seats : scenario.seats.map((s) => ({ ...s, isBot: false })),
    deadlineAt: null,
    connection: 'connected',
    storageDegraded: false,
    error: null,
    selfTakenOver: false,
    chat,
    report,
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
  chat: NO_CHAT,
  report: null,
  makeMove: async () => ({ ok: false, code: 'not_ready' }),
  resume: () => {},
};

/** 按场景取固定场景来源；场景切换后先回到加载态，再换成新场景 */
export function useFixtureMatchSource(spec: FixtureScenarioSpec): MatchSource {
  const { id, players, extras } = spec;
  const wantChat = extras?.chat === true;
  const outcome = extras?.outcome;
  const key = `${id}:${players}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    scenario: FixtureScenario | null;
    error?: string;
  } | null>(null);
  const [chatMessages, setChatMessages] = useState<readonly ChatEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    void import('./fixtures/buildScenario')
      .then(({ buildFixtureScenario }) => {
        if (cancelled) return;
        logger.flow('game/fixture', 'scenario ready', { scenario: id, players });
        const scenario = buildFixtureScenario(id, players);
        setLoaded({ key, scenario });
        if (wantChat) setChatMessages(seedFixtureChat(scenario, monotonicNow()));
      })
      .catch((e) => {
        logger.error('game/fixture', 'scenario build failed', e);
        if (cancelled) return;
        setLoaded({ key, scenario: null, error: (e as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [id, players, key, wantChat]);

  return useMemo(() => {
    if (loaded === null || loaded.key !== key) return FIXTURE_LOADING_SOURCE;
    if (loaded.scenario === null) {
      return { ...FIXTURE_LOADING_SOURCE, connection: 'failed', error: loaded.error ?? 'error' };
    }
    const { seat } = loaded.scenario;
    // 固定场景没有连接：发出的短语只在本机回显，便于走查面板、冷却与气泡
    const chat: ChatChannel = wantChat
      ? {
          available: true,
          messages: chatMessages,
          send: (presetId) => {
            setChatMessages((list) =>
              appendChatEntry(list, {
                id: (list.at(-1)?.id ?? 0) + 1,
                seat,
                presetId,
                at: monotonicNow(),
              }),
            );
            return true;
          },
        }
      : NO_CHAT;
    return createFixtureSource(
      loaded.scenario,
      { ...(wantChat ? { chat: true } : {}), ...(outcome ? { outcome } : {}) },
      chat,
    );
  }, [loaded, key, wantChat, outcome, chatMessages]);
}
