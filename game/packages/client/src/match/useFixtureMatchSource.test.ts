// 固定场景来源测试：纯函数部分，不涉及 React

import { describe, it, expect } from 'vitest';
import type { MatchView } from '@icgame/game-engine';
import { buildFixtureScenario } from './fixtures/buildScenario';
import { createFixtureSource, FIXTURE_LOADING_SOURCE } from './useFixtureMatchSource';

describe('createFixtureSource', () => {
  it('把场景的视图、本人座位与座位表原样交给界面', () => {
    const scenario = buildFixtureScenario('thief');
    const source = createFixtureSource(scenario);
    expect(source.kind).toBe('fixture');
    expect(source.view).toBe(scenario.view);
    expect(source.seat).toBe(scenario.seat);
    expect(source.seats).toBe(scenario.seats);
    expect((source.view!.G as MatchView).players[source.seat!]).toBeDefined();
  });

  it('没有连接问题、没有截止时间、没有托管', () => {
    const source = createFixtureSource(buildFixtureScenario('thief-pending'));
    expect(source.connection).toBe('connected');
    expect(source.deadlineAt).toBeNull();
    expect(source.storageDegraded).toBe(false);
    expect(source.error).toBeNull();
    expect(source.selfTakenOver).toBe(false);
    expect(() => source.resume()).not.toThrow();
  });

  it('发出的 move 一律成功，且不改变视图', async () => {
    const source = createFixtureSource(buildFixtureScenario('master'));
    const before = JSON.stringify(source.view);
    await expect(source.makeMove('playKick', ['action_kick', '1'])).resolves.toEqual({ ok: true });
    await expect(source.makeMove('endActionPhase')).resolves.toEqual({ ok: true });
    expect(JSON.stringify(source.view)).toBe(before);
  });
});

describe('FIXTURE_LOADING_SOURCE', () => {
  it('场景加载完成前没有视图与座位，move 报未就绪', async () => {
    expect(FIXTURE_LOADING_SOURCE.kind).toBe('fixture');
    expect(FIXTURE_LOADING_SOURCE.view).toBeNull();
    expect(FIXTURE_LOADING_SOURCE.seat).toBeNull();
    expect(FIXTURE_LOADING_SOURCE.seats).toEqual([]);
    expect(FIXTURE_LOADING_SOURCE.connection).toBe('connecting');
    await expect(FIXTURE_LOADING_SOURCE.makeMove('x')).resolves.toEqual({
      ok: false,
      code: 'not_ready',
    });
  });
});
