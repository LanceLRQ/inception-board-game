// 订阅来源的事件，把动作排进队列逐个播放
// 返回当前正在播的动作（没有为 null），由动画层按它渲染。

import { useEffect, useState } from 'react';
import type { EventFeed } from '../../../match/eventFeed';
import { cuesFromEvents } from './cues';
import { EMPTY_FX_QUEUE, enqueueCues, finishCue, startNext, type PlayingCue } from './fxQueue';

export function useFxPlayer(feed: EventFeed): PlayingCue | null {
  const [state, setState] = useState(EMPTY_FX_QUEUE);

  useEffect(
    () =>
      feed.subscribe((batch) => {
        const cues = cuesFromEvents(batch.events);
        if (cues.length > 0) setState((s) => startNext(enqueueCues(s, cues)));
      }),
    [feed],
  );

  const { playing } = state;
  useEffect(() => {
    if (playing === null) return;
    const timer = setTimeout(
      () => setState((s) => startNext(finishCue(s, playing.id))),
      playing.durationMs,
    );
    return () => clearTimeout(timer);
  }, [playing]);

  return playing;
}
