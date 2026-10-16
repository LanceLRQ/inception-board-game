import { describe, it, expect } from 'vitest';
import type { MatchView } from '@icgame/game-engine';
import { diceGateModel, diceSecondsLeft } from './diceGate';

const view = (pendingDiceRoll: MatchView['pendingDiceRoll']) => ({ pendingDiceRoll }) as MatchView;

describe('diceGateModel', () => {
  it('没有闸门时为 null', () => {
    expect(diceGateModel(view(null), '1')).toBeNull();
    expect(diceGateModel(undefined, '1')).toBeNull();
  });

  const gate = {
    id: 3,
    purpose: 'tsunami' as const,
    by: null,
    target: null,
    rollers: ['1', '2', '4'],
    rolled: ['2'],
  };

  it('按名单列出每个人掷没掷，本人被点名且没掷时可以掷', () => {
    const m = diceGateModel(view(gate), '1')!;
    expect(m.rollers).toEqual([
      { id: '1', rolled: false, mine: true },
      { id: '2', rolled: true, mine: false },
      { id: '4', rolled: false, mine: false },
    ]);
    expect(m.rolledCount).toBe(1);
    expect(m.canRoll).toBe(true);
    expect(m).toMatchObject({ id: 3, purpose: 'tsunami' });
  });

  it('本人已掷或不在名单里时只能等', () => {
    expect(diceGateModel(view(gate), '2')!.canRoll).toBe(false);
    expect(diceGateModel(view(gate), '0')!.canRoll).toBe(false);
    expect(diceGateModel(view(gate), null)!.canRoll).toBe(false);
  });
});

describe('diceSecondsLeft', () => {
  it('从看到闸门起算，向上取整，到点后为 0', () => {
    expect(diceSecondsLeft(1_000, 1_000, 15_000)).toBe(15);
    expect(diceSecondsLeft(1_000, 1_001, 15_000)).toBe(15);
    expect(diceSecondsLeft(1_000, 15_000, 15_000)).toBe(1);
    expect(diceSecondsLeft(1_000, 16_000, 15_000)).toBe(0);
    expect(diceSecondsLeft(1_000, 30_000, 15_000)).toBe(0);
  });
});
