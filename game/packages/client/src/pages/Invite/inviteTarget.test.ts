import { describe, expect, it } from 'vitest';
import { inviteTarget } from './index';

describe('inviteTarget', () => {
  it('合法房间码跳到房间页，规范成大写', () => {
    expect(inviteTarget('abc234')).toBe('/room/ABC234');
  });

  it('房间码缺失或格式不对到大厅显示邀请错误', () => {
    expect(inviteTarget(undefined)).toBe('/lobby?invite=invalid');
    expect(inviteTarget('abc')).toBe('/lobby?invite=invalid');
    expect(inviteTarget('abc 234')).toBe('/lobby?invite=invalid');
    expect(inviteTarget('<script>')).toBe('/lobby?invite=invalid');
  });
});
