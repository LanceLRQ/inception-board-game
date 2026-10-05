import { describe, expect, it } from 'vitest';
import { otherTurnLabel } from './turnLabel';

describe('otherTurnLabel', () => {
  it('对方是真人时显示昵称', () => {
    expect(otherTurnLabel({ nickname: '小明', isBot: false }, '2')).toEqual({
      key: 'localMatch.playerTurn',
      params: { name: '小明' },
    });
  });

  it('对方是 Bot 时沿用 AI 回合文案', () => {
    expect(otherTurnLabel({ nickname: 'Bot', isBot: true }, '3')).toEqual({
      key: 'localMatch.botTurn',
      params: { id: '3' },
    });
  });

  it('座位表里查不到时沿用 AI 回合文案', () => {
    expect(otherTurnLabel(undefined, '4')).toEqual({
      key: 'localMatch.botTurn',
      params: { id: '4' },
    });
  });
});
