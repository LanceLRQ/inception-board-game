import { describe, expect, it } from 'vitest';
import { shouldShowHandshakeError } from './handshakeError';

const ongoing = { ctx: { gameover: undefined } };
const finished = { ctx: { gameover: { winner: 'thief' } } };

describe('shouldShowHandshakeError', () => {
  it('没有错误时不显示', () => {
    expect(shouldShowHandshakeError(null, null)).toBe(false);
    expect(shouldShowHandshakeError(null, finished)).toBe(false);
  });

  it('还没有视图时，握手被拒显示错误页', () => {
    expect(shouldShowHandshakeError('match.error.not_in_match', null)).toBe(true);
  });

  it('已有进行中的视图时，握手被拒显示错误页', () => {
    expect(shouldShowHandshakeError('match.error.not_in_match', ongoing)).toBe(true);
  });

  it('视图里对局已结束时，握手被拒不替换画面，继续显示结算', () => {
    expect(shouldShowHandshakeError('match.error.not_in_match', finished)).toBe(false);
  });
});
