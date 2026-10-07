// 出牌记录包装层：出牌 move 被接受的那一步，把打出的牌记进「本回合打出过的牌」

import { describe, it, expect } from 'vitest';
import type { SetupState } from '../setup.js';
import { createTestState } from '../testing/fixtures.js';
import { INVALID_MOVE } from './invalidMove.js';
import { recordPlayedCards } from './recordPlayedCards.js';

interface Ctx {
  G: SetupState;
}

describe('recordPlayedCards 包装层', () => {
  const table = { playA: ['card_a'], playB: ['card_b', 'card_b2'] } as const;

  const base = createTestState({ phase: 'playing', turnPhase: 'action' });

  /** 探针 move：原样返回传入的状态；传入 'reject' 作为第一个参数时返回非法 */
  const probe = ({ G }: Ctx, first: string, _second?: number, _third?: string): unknown =>
    first === 'reject' ? INVALID_MOVE : G;

  const wrapped = recordPlayedCards(
    {
      playA: { move: probe as never },
      playB: { move: probe as never },
      other: { move: probe as never },
    },
    table,
  );
  const call = (name: 'playA' | 'playB' | 'other', ...args: unknown[]): unknown =>
    (wrapped[name].move as unknown as (c: Ctx, ...r: unknown[]) => unknown)({ G: base }, ...args);

  it('成功时恰好记一次，并更新最近打出的牌', () => {
    const r = call('playA', 'card_a') as SetupState;
    expect(r.playedCardsThisTurn).toEqual(['card_a']);
    expect(r.lastPlayedCardThisTurn).toBe('card_a');
  });

  it('牌可以出现在任意一个实参位置，且只认该 move 允许的牌', () => {
    const r = call('playB', 'target_player', 'card_b2') as SetupState;
    expect(r.playedCardsThisTurn).toEqual(['card_b2']);
    // 别的 move 的牌不算
    const mismatch = call('playB', 'card_a') as SetupState;
    expect(mismatch.playedCardsThisTurn).toEqual([]);
  });

  it('move 返回非法时不记录，原样返回非法', () => {
    expect(call('playA', 'reject', 0, 'card_a')).toBe(INVALID_MOVE);
  });

  it('不在表里的 move 原样放行，不记录', () => {
    const r = call('other', 'card_a') as SetupState;
    expect(r).toBe(base);
    expect(r.playedCardsThisTurn).toEqual([]);
  });

  it('记录追加在原有记录之后', () => {
    const withPlayed = { ...base, playedCardsThisTurn: ['card_x'] } as unknown as SetupState;
    const move = wrapped.playA.move as unknown as (c: Ctx, ...r: unknown[]) => SetupState;
    const r = move({ G: withPlayed }, 'card_a');
    expect(r.playedCardsThisTurn).toEqual(['card_x', 'card_a']);
  });

  it('包装后保持原函数的参数个数，表外的 move 保持同一个函数', () => {
    expect((wrapped.playA.move as unknown as (...a: never[]) => unknown).length).toBe(probe.length);
    expect((wrapped.playA.move as unknown as (...a: never[]) => unknown).length).toBe(4);
  });

  it('原函数挂在 unwrapped 属性上', () => {
    expect((wrapped.playA.move as unknown as { unwrapped: unknown }).unwrapped).toBe(probe);
  });

  it('保留 move 定义里除 move 以外的键', () => {
    const marked = recordPlayedCards(
      { playA: { move: probe as never, client: false } },
      table,
    ) as unknown as { playA: { client: boolean } };
    expect(marked.playA.client).toBe(false);
  });
});
