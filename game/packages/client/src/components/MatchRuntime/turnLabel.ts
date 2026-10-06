// 别人的回合提示：真人用座位表里的昵称，Bot 与查不到座位的用对局内显示名，
// 与座位牌、行动轴上的名字保持一致

import type { SeatInfo } from '@icgame/game-engine';

export function otherTurnLabel(
  seatInfo: Pick<SeatInfo, 'nickname' | 'isBot'> | undefined,
  displayName: string,
): { key: string; params: Record<string, string> } {
  const name = seatInfo && !seatInfo.isBot ? seatInfo.nickname : displayName;
  return { key: 'localMatch.playerTurn', params: { name } };
}
