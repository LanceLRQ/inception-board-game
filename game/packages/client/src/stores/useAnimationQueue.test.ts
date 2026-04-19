// useAnimationQueue 测试

import { describe, it, expect, beforeEach } from 'vitest';
import { useAnimationQueue } from './useAnimationQueue.js';

describe('useAnimationQueue', () => {
  beforeEach(() => {
    useAnimationQueue.getState().clear();
  });

  describe('enqueue', () => {
    it('adds entry to queue with auto-generated id', () => {
      const { enqueue } = useAnimationQueue.getState();
      enqueue({ type: 'dice', payload: { value: 3 } });
      // 注意：enqueue 会覆盖 played 和 id
      const { queue } = useAnimationQueue.getState();
      expect(queue).toHaveLength(1);
      expect(queue[0]!.type).toBe('dice');
      expect(queue[0]!.id).toMatch(/^anim_\d+$/);
      expect(queue[0]!.played).toBe(false);
    });

    it('adds multiple entries preserving order', () => {
      const { enqueue } = useAnimationQueue.getState();
      enqueue({ type: 'dice', payload: {} });
      enqueue({ type: 'card', payload: {} });
      const { queue } = useAnimationQueue.getState();
      expect(queue).toHaveLength(2);
      expect(queue[0]!.type).toBe('dice');
      expect(queue[1]!.type).toBe('card');
    });
  });

  describe('markPlayed', () => {
    it('marks specific entry as played', () => {
      const { enqueue, markPlayed } = useAnimationQueue.getState();
      enqueue({ type: 'dice', payload: {} });
      const id = useAnimationQueue.getState().queue[0]!.id;
      markPlayed(id);
      expect(useAnimationQueue.getState().queue[0]!.played).toBe(true);
    });

    it('does not affect other entries', () => {
      const { enqueue, markPlayed } = useAnimationQueue.getState();
      enqueue({ type: 'dice', payload: {} });
      enqueue({ type: 'card', payload: {} });
      const id = useAnimationQueue.getState().queue[0]!.id;
      markPlayed(id);
      expect(useAnimationQueue.getState().queue[1]!.played).toBe(false);
    });
  });

  describe('playNext', () => {
    it('returns first unplayed entry', () => {
      const { enqueue } = useAnimationQueue.getState();
      enqueue({ type: 'dice', payload: {} });
      enqueue({ type: 'card', payload: {} });
      const next = useAnimationQueue.getState().playNext();
      expect(next?.type).toBe('dice');
    });

    it('sets isPlaying to true when entry exists', () => {
      const { enqueue } = useAnimationQueue.getState();
      enqueue({ type: 'dice', payload: {} });
      useAnimationQueue.getState().playNext();
      expect(useAnimationQueue.getState().isPlaying).toBe(true);
    });

    it('skips already played entries', () => {
      const { enqueue, markPlayed } = useAnimationQueue.getState();
      enqueue({ type: 'dice', payload: {} });
      enqueue({ type: 'card', payload: {} });
      const id = useAnimationQueue.getState().queue[0]!.id;
      markPlayed(id);
      const next = useAnimationQueue.getState().playNext();
      expect(next?.type).toBe('card');
    });

    it('returns undefined when all played', () => {
      const { enqueue, markPlayed } = useAnimationQueue.getState();
      enqueue({ type: 'dice', payload: {} });
      const id = useAnimationQueue.getState().queue[0]!.id;
      markPlayed(id);
      expect(useAnimationQueue.getState().playNext()).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('empties queue and resets isPlaying', () => {
      const { enqueue } = useAnimationQueue.getState();
      enqueue({ type: 'dice', payload: {} });
      useAnimationQueue.getState().playNext();
      useAnimationQueue.getState().clear();
      expect(useAnimationQueue.getState().queue).toEqual([]);
      expect(useAnimationQueue.getState().isPlaying).toBe(false);
    });
  });
});
