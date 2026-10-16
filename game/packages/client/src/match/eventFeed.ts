// 对局事件的推送通道：来源把每一步产生的事件（已按本人座位裁剪）推给订阅者，界面据此播放动画
// 事件只用来演出，不改变状态：视图仍以来源的 view 为准，订阅晚了或漏了事件都不影响对局。

import type { MatchEvent } from '@icgame/game-engine';

/** 一步产生的事件；stateID 是这一步之后的状态版本号 */
export interface EventBatch {
  readonly stateID: number;
  readonly events: readonly MatchEvent[];
}

export type EventListener = (batch: EventBatch) => void;

export interface EventFeed {
  subscribe(listener: EventListener): () => void;
}

/** 没有事件的来源（固定场景缺省）用这个 */
export const NO_EVENTS: EventFeed = { subscribe: () => () => {} };

/** 来源内部用的推送器：emit 推给当前全部订阅者 */
export interface EventEmitter extends EventFeed {
  emit(batch: EventBatch): void;
}

export function createEventEmitter(): EventEmitter {
  const listeners = new Set<EventListener>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(batch) {
      if (batch.events.length === 0) return;
      for (const l of [...listeners]) l(batch);
    },
  };
}
