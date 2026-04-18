import { create } from 'zustand';

interface AnimationEntry {
  id: string;
  type: 'dice' | 'card' | 'unlock' | 'move' | 'bribe' | 'kill';
  payload: Record<string, unknown>;
  played: boolean;
}

interface AnimationQueueState {
  queue: AnimationEntry[];
  isPlaying: boolean;
  enqueue: (entry: Omit<AnimationEntry, 'id' | 'played'>) => void;
  markPlayed: (id: string) => void;
  playNext: () => AnimationEntry | undefined;
  clear: () => void;
}

let animCounter = 0;

export const useAnimationQueue = create<AnimationQueueState>((set, get) => ({
  queue: [],
  isPlaying: false,
  enqueue: (entry) =>
    set((s) => ({
      queue: [...s.queue, { ...entry, id: `anim_${++animCounter}`, played: false }],
    })),
  markPlayed: (id) =>
    set((s) => ({
      queue: s.queue.map((e) => (e.id === id ? { ...e, played: true } : e)),
    })),
  playNext: () => {
    const next = get().queue.find((e) => !e.played);
    if (next) set({ isPlaying: true });
    return next;
  },
  clear: () => set({ queue: [], isPlaying: false }),
}));
