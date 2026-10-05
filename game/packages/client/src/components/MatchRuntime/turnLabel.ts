// 别人的回合提示：真人显示昵称，Bot 用「AI N 回合」

import type { SeatInfo } from '@icgame/game-engine';

export function otherTurnLabel(
  seatInfo: Pick<SeatInfo, 'nickname' | 'isBot'> | undefined,
  currentPlayerID: string,
): { key: string; params: Record<string, string> } {
  if (seatInfo && !seatInfo.isBot) {
    return { key: 'localMatch.playerTurn', params: { name: seatInfo.nickname } };
  }
  return { key: 'localMatch.botTurn', params: { id: currentPlayerID } };
}
