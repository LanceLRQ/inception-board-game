import { describe, it, expect, vi } from 'vitest';
import type { MatchEvent } from '@icgame/game-engine';
import { createEventEmitter, NO_EVENTS } from './eventFeed';

const ev = (kind: string): MatchEvent => ({ stateID: 3, index: 0, kind, actor: null, data: {} });

describe('createEventEmitter', () => {
  it('推给全部订阅者，退订后不再收到', () => {
    const feed = createEventEmitter();
    const a = vi.fn();
    const b = vi.fn();
    const off = feed.subscribe(a);
    feed.subscribe(b);
    feed.emit({ stateID: 3, events: [ev('card_played')] });
    off();
    feed.emit({ stateID: 4, events: [ev('cards_drawn')] });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('空批次不推', () => {
    const feed = createEventEmitter();
    const a = vi.fn();
    feed.subscribe(a);
    feed.emit({ stateID: 3, events: [] });
    expect(a).not.toHaveBeenCalled();
  });

  it('NO_EVENTS 可订阅、可退订，从不推送', () => {
    const off = NO_EVENTS.subscribe(() => {
      throw new Error('不该推送');
    });
    off();
  });
});
