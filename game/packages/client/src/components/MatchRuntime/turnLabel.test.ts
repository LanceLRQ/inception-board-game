import { describe, expect, it } from 'vitest';
import { otherTurnLabel } from './turnLabel';

describe('otherTurnLabel', () => {
  it('对方是真人时显示座位表里的昵称', () => {
    expect(otherTurnLabel({ nickname: '小明', isBot: false }, 'Player 3')).toEqual({
      key: 'localMatch.playerTurn',
      params: { name: '小明' },
    });
  });

  it('对方是 Bot 时显示对局内的显示名', () => {
    expect(otherTurnLabel({ nickname: 'Bot', isBot: true }, 'Player 4')).toEqual({
      key: 'localMatch.playerTurn',
      params: { name: 'Player 4' },
    });
  });

  it('座位表里查不到时显示对局内的显示名', () => {
    expect(otherTurnLabel(undefined, 'Player 5')).toEqual({
      key: 'localMatch.playerTurn',
      params: { name: 'Player 5' },
    });
  });
});
