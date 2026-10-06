import { describe, expect, it } from 'vitest';
import { inviteTarget } from './index';

describe('inviteTarget', () => {
  it('合法房间码跳到房间页，规范成大写', () => {
    expect(inviteTarget('abc234')).toBe('/room/ABC234');
  });

  it('房间码缺失或格式不对回大厅', () => {
    expect(inviteTarget(undefined)).toBe('/lobby');
    expect(inviteTarget('abc')).toBe('/lobby');
    expect(inviteTarget('abc 234')).toBe('/lobby');
    expect(inviteTarget('<script>')).toBe('/lobby');
  });
});
