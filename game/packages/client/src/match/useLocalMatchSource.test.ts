// 本地对局来源控制器测试：用假的 Worker 接口，不涉及 React 与真实 Worker

import { describe, it, expect, vi } from 'vitest';
import type { MatchViewState } from '@icgame/game-engine';
import { createLocalSourceController, type LocalMatchApi } from './useLocalMatchSource.js';

function viewOf(playOrder: string[]): MatchViewState {
  return {
    G: {
      players: Object.fromEntries(playOrder.map((id) => [id, { nickname: `P${id}` }])),
    },
    ctx: {
      numPlayers: playOrder.length,
      playOrder,
      playOrderPos: 0,
      currentPlayer: '0',
      phase: 'play',
      turn: 1,
    },
    stateID: 3,
  };
}

function fakeApi(overrides: Partial<LocalMatchApi> = {}): LocalMatchApi {
  return {
    getState: vi.fn(async () => viewOf(['0', '1', '2', '3', '4'])),
    makeMove: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
}

describe('createLocalSourceController', () => {
  it('就绪前没有视图也没有座位，取到状态后座位为本地真人座位', async () => {
    const ctl = createLocalSourceController(fakeApi());
    const before = ctl.getSnapshot();
    expect(before.view).toBeNull();
    expect(before.seat).toBeNull();
    expect(before.kind).toBe('local');
    expect(before.connection).toBe('connecting');

    await ctl.refresh();
    const after = ctl.getSnapshot();
    expect(after.view).not.toBeNull();
    expect(after.seat).toBe('0');
    expect(after.connection).toBe('connected');
    expect(after.deadlineAt).toBeNull();
    expect(after.error).toBeNull();
  });

  it('makeMove 调用接口后刷新状态', async () => {
    const getState = vi
      .fn()
      .mockResolvedValueOnce(viewOf(['0', '1', '2', '3', '4']))
      .mockResolvedValue({ ...viewOf(['0', '1', '2', '3', '4']), stateID: 4 });
    const api = fakeApi({ getState });
    const ctl = createLocalSourceController(api);
    await ctl.refresh();
    const outcome = await ctl.getSnapshot().makeMove('doDraw', []);
    expect(outcome).toEqual({ ok: true });
    expect(api.makeMove).toHaveBeenCalledWith('doDraw', []);
    expect(ctl.getSnapshot().view?.stateID).toBe(4);
  });

  it('接口报告被拒时返回 ok:false 与拒绝码', async () => {
    const api = fakeApi({
      makeMove: vi.fn(async () => ({ ok: false as const, reason: 'not_active' as const })),
    });
    const ctl = createLocalSourceController(api);
    await ctl.refresh();
    expect(await ctl.getSnapshot().makeMove('doDraw')).toEqual({ ok: false, code: 'not_active' });
  });

  it('对局尚未建立时 makeMove 返回 not_ready', async () => {
    const api = fakeApi({ makeMove: vi.fn(async () => null) });
    const ctl = createLocalSourceController(api);
    expect(await ctl.getSnapshot().makeMove('doDraw')).toEqual({ ok: false, code: 'not_ready' });
  });

  it('座位表由出牌顺序生成，除座位 0 外都是 Bot', async () => {
    const ctl = createLocalSourceController(fakeApi());
    await ctl.refresh();
    const { seats } = ctl.getSnapshot();
    expect(seats.map((s) => s.seat)).toEqual(['0', '1', '2', '3', '4']);
    expect(seats.map((s) => s.isBot)).toEqual([false, true, true, true, true]);
    expect(seats.every((s) => s.connected && !s.takenOver)).toBe(true);
    expect(seats[0]!.nickname).toBe('P0');
  });

  it('本地来源恒不处于托管，resume 是无操作', async () => {
    const ctl = createLocalSourceController(fakeApi());
    await ctl.refresh();
    const source = ctl.getSnapshot();
    expect(source.selfTakenOver).toBe(false);
    expect(() => source.resume()).not.toThrow();
  });

  it('状态变化时通知订阅者，取消订阅后不再通知', async () => {
    const ctl = createLocalSourceController(fakeApi());
    const listener = vi.fn();
    const off = ctl.subscribe(listener);
    await ctl.refresh();
    expect(listener).toHaveBeenCalled();
    off();
    listener.mockClear();
    await ctl.refresh();
    expect(listener).not.toHaveBeenCalled();
  });

  it('取状态失败时保留旧快照，不抛出', async () => {
    const getState = vi
      .fn()
      .mockResolvedValueOnce(viewOf(['0', '1', '2']))
      .mockRejectedValue(new Error('worker closed'));
    const ctl = createLocalSourceController(fakeApi({ getState }));
    await ctl.refresh();
    await ctl.refresh();
    expect(ctl.getSnapshot().view).not.toBeNull();
  });
});
