// useMockMatch - 本地 mock 视角状态
// 用于 B6 前端视角整合的过渡开发（真实 WS + PlayerView 集成在 B7）
// 注：返回的状态结构对齐 FilteredState，便于后续切换到真实过滤后状态

import { useMemo } from 'react';
import type { CardID } from '@icgame/shared';

export interface MockPlayer {
  id: string;
  nickname: string;
  avatarSeed: number;
  faction: 'thief' | 'master';
  characterId: CardID | '';
  isRevealed: boolean;
  currentLayer: number;
  hand: CardID[] | null;
  handCount: number;
  isAlive: boolean;
}

export interface MockLayer {
  layer: number;
  heartLockValue: number;
  playersInLayer: string[];
  nightmareRevealed: boolean;
}

export interface MockVault {
  id: string;
  layer: number;
  contentType: 'secret' | 'coin' | 'empty' | 'hidden';
  isOpened: boolean;
}

export interface MockMatchState {
  matchId: string;
  viewerID: string;
  phase: 'setup' | 'playing' | 'endgame';
  turnPhase: 'turnStart' | 'draw' | 'action' | 'discard' | 'turnEnd';
  turnNumber: number;
  currentPlayerID: string;
  dreamMasterID: string;
  players: Record<string, MockPlayer>;
  playerOrder: string[];
  layers: Record<number, MockLayer>;
  vaults: MockVault[];
  deckCount: number;
  discardPile: CardID[];
  pendingUnlock: { playerID: string; layer: number; cardId: CardID } | null;
}

export interface UseMockMatchOptions {
  /** 视角：'thief' 使用 T1 / 'master' 使用 M */
  viewAs?: 'thief' | 'master';
  /** 是否显示响应窗口（pendingUnlock 激活） */
  withPendingUnlock?: boolean;
}

export function useMockMatch(opts: UseMockMatchOptions = {}): MockMatchState {
  const { viewAs = 'thief', withPendingUnlock = false } = opts;

  return useMemo<MockMatchState>(() => {
    const viewerID = viewAs === 'master' ? 'M' : 'T1';
    const isMaster = viewAs === 'master';

    return {
      matchId: 'mock-match-1',
      viewerID,
      phase: 'playing',
      turnPhase: 'action',
      turnNumber: 5,
      currentPlayerID: 'T1',
      dreamMasterID: 'M',
      playerOrder: ['T1', 'T2', 'T3', 'M'],
      players: {
        T1: {
          id: 'T1',
          nickname: '先锋',
          avatarSeed: 1,
          faction: 'thief',
          characterId: viewerID === 'T1' ? ('thief_pointman' as CardID) : '',
          isRevealed: false,
          currentLayer: 2,
          hand:
            viewerID === 'T1'
              ? (['action_shoot', 'action_unlock', 'action_dream_transit'] as CardID[])
              : null,
          handCount: 3,
          isAlive: true,
        },
        T2: {
          id: 'T2',
          nickname: '译梦师',
          avatarSeed: 2,
          faction: 'thief',
          characterId: 'thief_dream_interpreter' as CardID,
          isRevealed: false,
          currentLayer: 1,
          hand: null,
          handCount: 4,
          isAlive: true,
        },
        T3: {
          id: 'T3',
          nickname: '狮子',
          avatarSeed: 3,
          faction: 'thief',
          characterId: 'thief_leo' as CardID,
          isRevealed: false,
          currentLayer: 2,
          hand: null,
          handCount: 2,
          isAlive: true,
        },
        M: {
          id: 'M',
          nickname: '梦主',
          avatarSeed: 4,
          faction: 'master',
          characterId: isMaster ? ('dm_fortress' as CardID) : '',
          isRevealed: false,
          currentLayer: 4,
          hand: isMaster ? (['action_kick'] as CardID[]) : null,
          handCount: 1,
          isAlive: true,
        },
      },
      layers: {
        1: { layer: 1, heartLockValue: 3, playersInLayer: ['T2'], nightmareRevealed: false },
        2: { layer: 2, heartLockValue: 2, playersInLayer: ['T1', 'T3'], nightmareRevealed: false },
        3: { layer: 3, heartLockValue: 2, playersInLayer: [], nightmareRevealed: false },
        4: { layer: 4, heartLockValue: 1, playersInLayer: ['M'], nightmareRevealed: false },
      },
      vaults: [
        {
          id: 'v1',
          layer: 1,
          contentType: isMaster ? 'secret' : 'hidden',
          isOpened: false,
        },
        {
          id: 'v2',
          layer: 2,
          contentType: 'coin',
          isOpened: true,
        },
        {
          id: 'v3',
          layer: 3,
          contentType: isMaster ? 'coin' : 'hidden',
          isOpened: false,
        },
        {
          id: 'v4',
          layer: 4,
          contentType: isMaster ? 'coin' : 'hidden',
          isOpened: false,
        },
      ],
      deckCount: 42,
      discardPile: ['action_creation', 'action_shoot'] as CardID[],
      pendingUnlock: withPendingUnlock
        ? { playerID: 'T1', layer: 2, cardId: 'action_unlock' as CardID }
        : null,
    };
  }, [viewAs, withPendingUnlock]);
}
