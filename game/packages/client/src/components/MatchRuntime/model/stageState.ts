// 对局舞台（PC 围坐 / 移动端行动轴 / 中央桌面）用的展示状态。
// 由 viewAdapter 从按座位裁剪的视图转换而来，舞台组件只读它，不接触完整状态。

import type { CardID } from '@icgame/shared';

export interface StagePlayer {
  id: string;
  nickname: string;
  /** 像素头像种子：取自座位表（公开信息），没有时按座位与昵称推导 */
  avatarSeed: string;
  faction: 'thief' | 'master';
  characterId: CardID | '';
  isRevealed: boolean;
  currentLayer: number;
  hand: CardID[] | null;
  handCount: number;
  isAlive: boolean;
}

export interface StageLayer {
  layer: number;
  heartLockValue: number;
  playersInLayer: string[];
  nightmareRevealed: boolean;
}

export interface StageVault {
  id: string;
  layer: number;
  contentType: 'secret' | 'coin' | 'empty' | 'hidden';
  isOpened: boolean;
}

export interface StageState {
  matchId: string;
  viewerID: string;
  phase: 'setup' | 'playing' | 'endgame';
  turnPhase: 'turnStart' | 'draw' | 'action' | 'discard' | 'turnEnd';
  turnNumber: number;
  currentPlayerID: string;
  dreamMasterID: string;
  players: Record<string, StagePlayer>;
  playerOrder: string[];
  layers: Record<number, StageLayer>;
  vaults: StageVault[];
  deckCount: number;
  discardPile: CardID[];
  pendingUnlock: { playerID: string; layer: number; cardId: CardID } | null;
}
