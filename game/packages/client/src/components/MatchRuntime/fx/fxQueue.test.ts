import { describe, it, expect } from 'vitest';
import type { FxCue } from './cues';
import { CUE_DURATION_MS } from './cues';
import {
  EMPTY_FX_QUEUE,
  MAX_BACKLOG,
  enqueueCues,
  finishCue,
  playbackRate,
  startNext,
} from './fxQueue';

const play = (card: string): FxCue => ({ kind: 'play', player: '1', card });

describe('fxQueue', () => {
  it('按到达顺序一个接一个播，播完才轮到下一个', () => {
    let s = enqueueCues(EMPTY_FX_QUEUE, [play('a'), play('b')]);
    s = startNext(s);
    expect(s.playing?.cue).toEqual(play('a'));
    // 正在播时不会换
    expect(startNext(s)).toBe(s);
    s = startNext(finishCue(s, s.playing!.id));
    expect(s.playing?.cue).toEqual(play('b'));
    expect(s.pending).toEqual([]);
  });

  it('编号对不上的结束通知不起作用', () => {
    const s = startNext(enqueueCues(EMPTY_FX_QUEUE, [play('a')]));
    expect(finishCue(s, s.playing!.id + 1)).toBe(s);
  });

  it('积压太多时丢掉最旧的', () => {
    const many = Array.from({ length: MAX_BACKLOG + 5 }, (_, i) => play(`c${i}`));
    const s = enqueueCues(EMPTY_FX_QUEUE, many);
    expect(s.pending).toHaveLength(MAX_BACKLOG);
    expect(s.pending[0]).toEqual(play('c5'));
  });

  it('积压越多播得越快', () => {
    expect(playbackRate(0)).toBe(1);
    expect(playbackRate(3)).toBeLessThan(1);
    expect(playbackRate(6)).toBeLessThan(playbackRate(3));
    const s = startNext(
      enqueueCues(
        EMPTY_FX_QUEUE,
        Array.from({ length: 8 }, () => play('x')),
      ),
    );
    expect(s.playing!.durationMs).toBe(Math.round(CUE_DURATION_MS.play * playbackRate(7)));
  });

  it('空的入队不改变状态', () => {
    expect(enqueueCues(EMPTY_FX_QUEUE, [])).toBe(EMPTY_FX_QUEUE);
  });
});
