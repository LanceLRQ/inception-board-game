import { describe, expect, it } from 'vitest';
import type { RoomState } from '../../lib/roomApi';
import { isRoomMember, resolveGameRedirect } from './roomLogic';

function makeRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    id: 'room-1',
    code: 'ABC234',
    status: 'waiting',
    maxPlayers: 6,
    ownerPlayerId: 'p1',
    players: [
      { playerId: 'p1', nickname: 'A', avatarSeed: '1', seat: 0, isBot: false },
      { playerId: 'p2', nickname: 'B', avatarSeed: '2', seat: 1, isBot: false },
    ],
    ...overrides,
  } as RoomState;
}

describe('isRoomMember', () => {
  it('成员里有本人时为真', () => {
    expect(isRoomMember(makeRoom(), 'p2')).toBe(true);
  });

  it('成员里没有本人、或本人未知时为假', () => {
    expect(isRoomMember(makeRoom(), 'p9')).toBe(false);
    expect(isRoomMember(makeRoom(), null)).toBe(false);
    expect(isRoomMember(null, 'p1')).toBe(false);
  });
});

describe('resolveGameRedirect', () => {
  it('房间未开始时不跳转', () => {
    expect(resolveGameRedirect(makeRoom(), 'p1', false)).toBeNull();
  });

  it('开始了但本人不在成员里时不跳转', () => {
    const room = makeRoom({ status: 'playing', matchId: 'm-1' });
    expect(resolveGameRedirect(room, 'p9', false)).toBeNull();
  });

  it('联机：跳到带对局号与房间码的联机地址', () => {
    const room = makeRoom({ status: 'playing', matchId: 'm-1' });
    expect(resolveGameRedirect(room, 'p1', false)).toBe('/game/m-1?online=1&code=ABC234');
  });

  it('没有对局号时退回房间编号', () => {
    const room = makeRoom({ status: 'playing' });
    expect(resolveGameRedirect(room, 'p1', false)).toBe('/game/room-1?online=1&code=ABC234');
  });

  it('本地模拟：跳到房间编号对应的本地对局', () => {
    const room = makeRoom({ status: 'playing' });
    expect(resolveGameRedirect(room, 'p1', true)).toBe('/game/room-1');
  });
});
