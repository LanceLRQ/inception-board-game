import { describe, it, expect } from 'vitest';
import { readBotCardPlay } from './botCardPlay';

describe('readBotCardPlay', () => {
  it('缺省打开', () => {
    expect(readBotCardPlay('')).toBe(true);
    expect(readBotCardPlay('?seed=a')).toBe(true);
  });

  it('只有 botplay=off 关闭', () => {
    expect(readBotCardPlay('?botplay=off')).toBe(false);
    expect(readBotCardPlay(new URLSearchParams({ botplay: 'off', seed: 'x' }))).toBe(false);
  });

  it('其他取值一律当作打开', () => {
    expect(readBotCardPlay('?botplay=on')).toBe(true);
    expect(readBotCardPlay('?botplay=0')).toBe(true);
    expect(readBotCardPlay('?botplay=')).toBe(true);
  });
});
