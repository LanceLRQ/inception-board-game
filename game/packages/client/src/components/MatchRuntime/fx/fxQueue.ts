// 动画播放队列（纯函数）：动作按到达顺序一个接一个播；积压多了就加快，积压太多就丢掉最旧的，
// 让演出始终跟得上对局（视图本身不等动画，动画只是叠在上面的演出）。

import { CUE_DURATION_MS, type FxCue } from './cues';

/** 最多积压这么多个动作，再多就丢最旧的 */
export const MAX_BACKLOG = 12;

export interface PlayingCue {
  readonly id: number;
  readonly cue: FxCue;
  /** 这一个实际播多久（按积压程度加快后） */
  readonly durationMs: number;
}

export interface FxQueueState {
  readonly pending: readonly FxCue[];
  readonly playing: PlayingCue | null;
  readonly nextId: number;
}

export const EMPTY_FX_QUEUE: FxQueueState = { pending: [], playing: null, nextId: 1 };

export function enqueueCues(state: FxQueueState, cues: readonly FxCue[]): FxQueueState {
  if (cues.length === 0) return state;
  const pending = [...state.pending, ...cues];
  return { ...state, pending: pending.slice(-MAX_BACKLOG) };
}

/** 积压越多播得越快：后面还排着 3 个以上快一档，6 个以上再快一档 */
export function playbackRate(waiting: number): number {
  if (waiting >= 6) return 0.5;
  if (waiting >= 3) return 0.75;
  return 1;
}

/** 当前没在播就取下一个开始播 */
export function startNext(state: FxQueueState): FxQueueState {
  if (state.playing !== null || state.pending.length === 0) return state;
  const [cue, ...rest] = state.pending;
  const durationMs = Math.round(CUE_DURATION_MS[cue!.kind] * playbackRate(rest.length));
  return {
    pending: rest,
    playing: { id: state.nextId, cue: cue!, durationMs },
    nextId: state.nextId + 1,
  };
}

/** 编号为 id 的那个播完了（编号对不上说明早已被换掉，不动） */
export function finishCue(state: FxQueueState, id: number): FxQueueState {
  return state.playing?.id === id ? { ...state, playing: null } : state;
}
