import { describe, it, expect } from 'vitest';
import type { RoomState, RoomPlayer } from '../services/LobbyService.js';
import { buildSeats, buildSetup } from './seats.js';

function player(over: Partial<RoomPlayer> & { seat: number }): RoomPlayer {
  return {
    playerId: `acct-${over.seat}`,
    nickname: `N${over.seat}`,
    avatarSeed: 's',
    isBot: false,
    joinedAt: 0,
    ...over,
  };
}

function roomOf(players: RoomPlayer[], patch: Partial<RoomState> = {}): RoomState {
  return {
    id: 'room-1',
    code: 'ABCDEF',
    ownerPlayerId: 'acct-0',
    maxPlayers: 8,
    ruleVariant: 'classic',
    exCardsEnabled: false,
    expansionEnabled: false,
    status: 'waiting',
    players,
    createdAt: 0,
    expiresAt: 0,
    ...patch,
  };
}

describe('buildSeats', () => {
  it('按房间座位号升序重新编号为 0..n-1', () => {
    const seats = buildSeats([player({ seat: 5 }), player({ seat: 1 }), player({ seat: 3 })]);
    expect(seats.map((s) => s.seat)).toEqual(['0', '1', '2']);
    expect(seats.map((s) => s.nickname)).toEqual(['N1', 'N3', 'N5']);
    expect(seats.map((s) => s.playerId)).toEqual(['acct-1', 'acct-3', 'acct-5']);
  });

  it('Bot 座位没有账号 id', () => {
    const seats = buildSeats([
      player({ seat: 0 }),
      player({ seat: 1, isBot: true, playerId: 'bot-abc' }),
    ]);
    expect(seats[1]).toEqual({ seat: '1', playerId: null, nickname: 'N1', isBot: true });
    expect(seats[0]!.isBot).toBe(false);
  });

  it('昵称超过 50 个字符时截断，空昵称回落为默认名', () => {
    const seats = buildSeats([
      player({ seat: 0, nickname: 'x'.repeat(80) }),
      player({ seat: 1, nickname: '' }),
    ]);
    expect(seats[0]!.nickname).toHaveLength(50);
    expect(seats[1]!.nickname).toBe('Player 2');
  });

  it('不修改传入的数组', () => {
    const input = [player({ seat: 2 }), player({ seat: 0 })];
    buildSeats(input);
    expect(input.map((p) => p.seat)).toEqual([2, 0]);
  });
});

describe('buildSetup', () => {
  it('给出人数、种子与建局参数', () => {
    const room = roomOf(
      [
        player({ seat: 0 }),
        player({ seat: 1, isBot: true }),
        player({ seat: 2 }),
        player({ seat: 4 }),
      ],
      { ruleVariant: 'turbo', exCardsEnabled: true, expansionEnabled: true },
    );
    const seats = buildSeats(room.players);
    const setup = buildSetup(room, seats, 'seed-1');
    expect(setup).toEqual({
      numPlayers: 4,
      seed: 'seed-1',
      setupData: {
        rngSeed: 'seed-1',
        nicknames: ['N0', 'N1', 'N2', 'N4'],
        botSeats: ['1'],
        ruleVariant: 'turbo',
        exCardsEnabled: true,
        expansionEnabled: true,
      },
    });
  });

  it('没有 Bot 时 botSeats 为空数组', () => {
    const room = roomOf([0, 1, 2, 3].map((seat) => player({ seat })));
    expect(buildSetup(room, buildSeats(room.players), 's').setupData.botSeats).toEqual([]);
  });
});
