// 房间 → 对局的座位与建局参数换算（纯函数）

import type { RoomPlayer, RoomState } from '../services/LobbyService.js';
import type { RoomSeat } from './MatchRoom.js';

const NICKNAME_MAX_LENGTH = 50;

/** 按房间座位号升序，依次编为 '0'..'n-1'；Bot 座位没有账号 id */
export function buildSeats(players: readonly RoomPlayer[]): RoomSeat[] {
  return [...players]
    .sort((a, b) => a.seat - b.seat)
    .map((p, i) => {
      const nickname = p.nickname.slice(0, NICKNAME_MAX_LENGTH);
      return {
        seat: String(i),
        playerId: p.isBot ? null : p.playerId,
        nickname: nickname.length > 0 ? nickname : `Player ${i + 1}`,
        isBot: p.isBot,
      };
    });
}

export interface MatchSetup {
  numPlayers: number;
  seed: string;
  setupData: Record<string, unknown>;
}

/** 给运行器与引擎的建局参数；同一个种子同时用作运行器种子与 setupData.rngSeed */
export function buildSetup(room: RoomState, seats: readonly RoomSeat[], seed: string): MatchSetup {
  return {
    numPlayers: seats.length,
    seed,
    setupData: {
      rngSeed: seed,
      nicknames: seats.map((s) => s.nickname),
      botSeats: seats.filter((s) => s.isBot).map((s) => s.seat),
      ruleVariant: room.ruleVariant,
      exCardsEnabled: room.exCardsEnabled,
      expansionEnabled: room.expansionEnabled,
    },
  };
}
