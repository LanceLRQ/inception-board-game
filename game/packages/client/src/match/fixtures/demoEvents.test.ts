import { describe, it, expect, vi, afterEach } from 'vitest';
import type { MatchView } from '@icgame/game-engine';
import { cuesFromEvents } from '../../components/MatchRuntime/fx/cues';
import { buildFixtureScenario } from './buildScenario';
import { demoEventBatches, loopingFeed } from './demoEvents';

afterEach(() => {
  vi.useRealTimers();
});

describe('demoEventBatches', () => {
  it('每批都翻得出一个动作，覆盖抽牌、掷骰到复活的各种动作', () => {
    const sc = buildFixtureScenario('thief');
    const batches = demoEventBatches(sc.view.G as MatchView, sc.seat);
    const kinds = batches.map((b) => {
      const cues = cuesFromEvents(b.events);
      expect(cues).toHaveLength(1);
      return cues[0]!.kind;
    });
    expect(new Set(kinds)).toEqual(
      new Set([
        'draw',
        'play',
        'dice',
        'discard',
        'transfer',
        'move',
        'lock',
        'vault',
        'died',
        'revived',
      ]),
    );
  });
});

describe('loopingFeed', () => {
  it('有人订阅时按间隔循环推送，全部退订后停下', () => {
    vi.useFakeTimers();
    const batches = [
      { stateID: 1, events: [{ stateID: 1, index: 0, kind: 'a', actor: null, data: {} }] },
      { stateID: 2, events: [{ stateID: 2, index: 0, kind: 'b', actor: null, data: {} }] },
    ];
    const feed = loopingFeed(batches, 100);
    const heard: number[] = [];
    const off = feed.subscribe((b) => heard.push(b.stateID));
    vi.advanceTimersByTime(350);
    expect(heard).toEqual([1, 2, 1]);
    off();
    vi.advanceTimersByTime(500);
    expect(heard).toEqual([1, 2, 1]);
  });
});
