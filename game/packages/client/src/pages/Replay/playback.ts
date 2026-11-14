import type { MatchEvent } from '@icgame/game-engine';

export const REPLAY_SPEEDS = [0.5, 1, 1.5, 2, 4] as const;
type Speed = (typeof REPLAY_SPEEDS)[number];

interface Playback {
  position: number;
  eventIndex: number | null;
  speed: Speed;
  playing: boolean;
}

type Action =
  | { type: 'toggle' | 'tick'; last: number }
  | { type: 'seek'; position: number; eventIndex?: number }
  | { type: 'speed'; speed: Speed };

export const initialPlayback: Playback = {
  position: 0,
  eventIndex: null,
  speed: 1,
  playing: false,
};

export function playbackDelay(speed: Speed): number {
  return 900 / speed;
}

export function replayPlayback(state: Playback, action: Action): Playback {
  switch (action.type) {
    case 'toggle':
      if (action.last <= 0) return state;
      if (state.playing) return { ...state, playing: false };
      return {
        ...state,
        position: state.position === action.last ? 0 : state.position,
        eventIndex: null,
        playing: true,
      };
    case 'tick': {
      if (!state.playing) return state;
      const position = Math.min(state.position + 1, action.last);
      return { ...state, position, playing: position < action.last };
    }
    case 'seek':
      return {
        ...state,
        position: action.position,
        eventIndex: action.eventIndex ?? null,
        playing: false,
      };
    case 'speed':
      return { ...state, speed: action.speed };
  }
}

/** 只读接口已裁剪的已知字段。归档中旧版事件的私密内容可能为空。 */
export function visiblePrivateCards(event: MatchEvent, viewer: string | null): string[] {
  const secret = event.secret;
  if (viewer === null || !secret?.to.includes(viewer)) return [];
  switch (event.kind) {
    case 'cards_drawn':
    case 'cards_returned':
    case 'cards_transferred':
      return Array.isArray(secret.data.cards)
        ? secret.data.cards.filter((card): card is string => typeof card === 'string')
        : [];
    case 'bribe_dealt':
      return secret.data.kind === 'deal'
        ? ['bribe_success']
        : secret.data.kind === 'fail'
          ? ['bribe_fail']
          : [];
    case 'nightmare_discarded':
      return typeof secret.data.nightmare === 'string' ? [secret.data.nightmare] : [];
    default:
      return [];
  }
}
