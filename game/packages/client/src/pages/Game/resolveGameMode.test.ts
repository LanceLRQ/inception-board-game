import { describe, expect, it } from 'vitest';
import { resolveGameMode } from './resolveGameMode';

const q = (s: string) => new URLSearchParams(s);

describe('resolveGameMode', () => {
  it('online=1 且有真实令牌 → online', () => {
    expect(resolveGameMode(q('online=1&code=ABC234'), 'jwt.token.value')).toEqual({
      mode: 'online',
    });
  });

  it('online=1 但没有令牌或令牌是离线伪令牌 → online-unavailable', () => {
    expect(resolveGameMode(q('online=1'), null)).toEqual({ mode: 'online-unavailable' });
    expect(resolveGameMode(q('online=1'), '')).toEqual({ mode: 'online-unavailable' });
    expect(resolveGameMode(q('online=1'), 'mock-p-abc')).toEqual({ mode: 'online-unavailable' });
  });

  it('friend=1 且人数不少于 3 → local', () => {
    expect(resolveGameMode(q('friend=1&players=5'), null)).toEqual({ mode: 'local', players: 5 });
  });

  it('friend=1 但人数不足、或没有任何参数 → mock', () => {
    expect(resolveGameMode(q('friend=1&players=2'), null)).toEqual({ mode: 'mock' });
    expect(resolveGameMode(q(''), 'jwt')).toEqual({ mode: 'mock' });
    expect(resolveGameMode(q('as=master'), 'jwt')).toEqual({ mode: 'mock' });
  });

  it('online 优先于 friend', () => {
    expect(resolveGameMode(q('online=1&friend=1&players=5'), 'jwt')).toEqual({ mode: 'online' });
  });
});
