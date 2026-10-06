// 固定场景来源测试：纯函数部分，不涉及 React

import { describe, it, expect } from 'vitest';
import type { MatchView } from '@icgame/game-engine';
import { isValidChatPresetId } from '@icgame/shared';
import { buildFixtureScenario } from './fixtures/buildScenario';
import { monotonicNow } from '../lib/deadlineClock';
import {
  seedFixtureChat,
  createFixtureSource,
  FIXTURE_LOADING_SOURCE,
} from './useFixtureMatchSource';

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

describe('固定场景的走查开关', () => {
  it('没有开关时：聊天不可用、没有举报通道，所有对手仍是 Bot', () => {
    const source = createFixtureSource(buildFixtureScenario('thief'));
    expect(source.chat.available).toBe(false);
    expect(source.report).toBeNull();
    expect(source.seats.filter((s) => s.seat !== source.seat).every((s) => s.isBot)).toBe(true);
    expect(createFixtureSource(buildFixtureScenario('thief')).view!.ctx.gameover).toBeUndefined();
  });

  it('chat：通道可用，带示例消息（都是预设短语，来自别的座位）', () => {
    const scenario = buildFixtureScenario('thief');
    const messages = seedFixtureChat(scenario, monotonicNow());
    expect(messages.length).toBeGreaterThanOrEqual(3);
    expect(messages.every((m) => m.seat !== scenario.seat)).toBe(true);
    expect(messages.every((m) => isValidChatPresetId(m.presetId))).toBe(true);
    expect(new Set(messages.map((m) => m.seat)).size).toBeGreaterThanOrEqual(2);
    const chat = { available: true, messages, send: () => true };
    const source = createFixtureSource(scenario, { chat: true }, chat);
    expect(source.chat.available).toBe(true);
    expect(source.chat.messages).toBe(messages);
  });

  it('outcome：对局已结束（盗梦者胜），对手按真人对待，举报按场景给结果', async () => {
    const scenario = buildFixtureScenario('thief');
    const ok = createFixtureSource(scenario, { outcome: 'ok' });
    expect(ok.view!.ctx.gameover).toEqual({ winner: 'thief', reason: 'secret_vault_opened' });
    expect(ok.seats.every((s) => !s.isBot)).toBe(true);
    await expect(ok.report!.submit('1', 'afk')).resolves.toEqual({ ok: true });

    const dup = createFixtureSource(scenario, { outcome: 'duplicate' });
    await expect(dup.report!.submit('1', 'afk')).resolves.toEqual({ ok: false, code: 'duplicate' });
    const failed = createFixtureSource(scenario, { outcome: 'failed' });
    await expect(failed.report!.submit('1', 'afk')).resolves.toEqual({
      ok: false,
      code: 'network',
    });
  });

  it('outcome 不改原场景的视图（引擎过滤后的结果原样保留）', () => {
    const scenario = buildFixtureScenario('thief');
    const before = JSON.stringify(scenario.view);
    createFixtureSource(scenario, { outcome: 'ok' });
    expect(JSON.stringify(scenario.view)).toBe(before);
  });
});
