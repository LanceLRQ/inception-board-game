import { describe, expect, it } from 'vitest';
import type { MatchEvent } from '@icgame/game-engine';
import { initialPlayback, playbackDelay, replayPlayback, visiblePrivateCards } from './playback';

describe('回放控制', () => {
  it('逐步播放，到最后一个已保存的步骤自动暂停，再次播放从头开始', () => {
    const playing = replayPlayback(initialPlayback, { type: 'toggle', last: 2 });
    const next = replayPlayback(playing, { type: 'tick', last: 2 });
    expect(next).toMatchObject({ position: 1, playing: true });
    const end = replayPlayback(next, { type: 'tick', last: 2 });
    expect(end).toMatchObject({ position: 2, playing: false });
    expect(replayPlayback(end, { type: 'toggle', last: 2 })).toMatchObject({
      position: 0,
      playing: true,
    });
    expect(replayPlayback(initialPlayback, { type: 'toggle', last: 0 })).toEqual(initialPlayback);
  });

  it('事件跳转准确定位到稀疏归档的对应步骤并暂停，时间轴拖动清除单项选中', () => {
    const stateIDs = [1, 8, 17];
    const playing = replayPlayback(initialPlayback, { type: 'toggle', last: 2 });
    const jump = replayPlayback(playing, { type: 'seek', position: 1, eventIndex: 3 });
    expect(stateIDs[jump.position]).toBe(8);
    expect(jump).toMatchObject({ playing: false, eventIndex: 3 });
    expect(replayPlayback(jump, { type: 'tick', last: 2 })).toEqual(jump);
    expect(replayPlayback(jump, { type: 'seek', position: 2 })).toMatchObject({
      position: 2,
      playing: false,
      eventIndex: null,
    });
  });

  it('切换倍速保持当前位置和播放状态，并更新每步等待时间', () => {
    const playing = replayPlayback(initialPlayback, { type: 'toggle', last: 2 });
    const fast = replayPlayback(playing, { type: 'speed', speed: 2 });
    expect(fast).toMatchObject({ speed: 2, position: 0, playing: true });
    expect(playbackDelay(fast.speed)).toBe(playbackDelay(1) / 2);
    expect(playbackDelay(0.5)).toBe(playbackDelay(1) * 2);
    expect(replayPlayback(fast, { type: 'toggle', last: 2 }).playing).toBe(false);
  });
});

describe('回放允许展示的私密牌面', () => {
  it('只展示归档接口授予当前座位的牌面，访客和其他座位没有私密内容', () => {
    const event: MatchEvent = {
      kind: 'cards_drawn',
      actor: '2',
      stateID: 8,
      index: 1,
      data: { player: '2', count: 1 },
      secret: { to: ['2'], data: { cards: ['action_unlock'] } },
    };
    expect(visiblePrivateCards(event, '2')).toEqual(['action_unlock']);
    expect(visiblePrivateCards(event, null)).toEqual([]);
    expect(visiblePrivateCards(event, '1')).toEqual([]);
    expect(visiblePrivateCards({ ...event, kind: 'move' }, '2')).toEqual([]);
    expect(
      visiblePrivateCards(
        { ...event, kind: 'bribe_dealt', secret: { to: ['2'], data: { kind: 'fail' } } },
        '2',
      ),
    ).toEqual(['bribe_fail']);
  });
});
