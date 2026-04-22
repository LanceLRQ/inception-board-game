// 将 BGIO G/ctx 适配为 MockMatchState 结构，复用新 UI（MatchTable / MatchTrack）
// 对照：plans/design/06c-match-table-layout.md
//
// 注意：这是纯展示层适配，不影响 LocalMatchRuntime 的真实交互（pendingPlay / Dialog 群等）

import type { CardID } from '@icgame/shared';
import type { MockMatchState, MockPlayer, MockLayer, MockVault } from '../../hooks/useMockMatch.js';

export interface AdaptBGIOtoMockStateOpts {
  G: Record<string, unknown>;
  ctx: Record<string, unknown>;
  /** 人类玩家 ID，默认 '0' */
  humanPlayerID?: string;
  /** 房间 ID */
  matchId?: string;
}

/**
 * 把 BGIO 的 G/ctx 转成 MockMatchState 视图。
 * 不做隐藏信息过滤（LocalMatchRuntime 本地跑，已知全貌），只做结构对齐。
 */
export function adaptBGIOtoMockState(opts: AdaptBGIOtoMockStateOpts): MockMatchState | null {
  const { G, ctx, humanPlayerID = '0', matchId = 'local-match' } = opts;
  const rawPlayers = G.players as Record<string, Record<string, unknown>> | undefined;
  if (!rawPlayers) return null;

  const dreamMasterID = (G.dreamMasterID as string) ?? '';
  const playerOrder = Object.keys(rawPlayers).sort();
  const currentPlayerID = (ctx.currentPlayer as string) ?? playerOrder[0] ?? '';

  const players: Record<string, MockPlayer> = {};
  for (const id of playerOrder) {
    const p = rawPlayers[id]!;
    const hand = p.hand as CardID[] | undefined;
    players[id] = {
      id,
      nickname: (p.nickname as string) ?? id,
      avatarSeed: 0,
      faction: ((p.faction as string) === 'master' ? 'master' : 'thief') as 'thief' | 'master',
      characterId: ((p.characterId as string) ?? '') as CardID | '',
      isRevealed: !!p.isRevealed,
      currentLayer: (p.currentLayer as number) ?? 1,
      // 仅 human 暴露真实手牌（其他玩家 hand 设为 null，UI 显示手牌数角标）
      hand: id === humanPlayerID && Array.isArray(hand) ? (hand as CardID[]) : null,
      handCount: Array.isArray(hand) ? hand.length : ((p.handCount as number) ?? 0),
      isAlive: p.isAlive === undefined ? true : !!p.isAlive,
    };
  }

  const rawLayers = G.layers as Record<string, Record<string, unknown>> | undefined;
  const layers: Record<number, MockLayer> = {};
  if (rawLayers) {
    for (const [k, info] of Object.entries(rawLayers)) {
      const layerNum = (info.layer as number) ?? Number(k);
      layers[layerNum] = {
        layer: layerNum,
        heartLockValue: (info.heartLockValue as number) ?? 0,
        playersInLayer: (info.playersInLayer as string[]) ?? [],
        nightmareRevealed: !!info.nightmareRevealed,
      };
    }
  }

  const rawVaults = G.vaults as Array<Record<string, unknown>> | undefined;
  const vaults: MockVault[] = (rawVaults ?? []).map((v, i) => ({
    id: (v.id as string) ?? `vault_${i}`,
    layer: (v.layer as number) ?? 0,
    contentType: ((v.contentType as string) ?? 'hidden') as 'secret' | 'coin' | 'empty' | 'hidden',
    isOpened: !!v.isOpened,
  }));

  const rawDeck = G.deck as { cards?: CardID[]; discardPile?: CardID[] } | undefined;
  const deckCount = rawDeck?.cards?.length ?? 0;
  const discardPile = rawDeck?.discardPile ?? [];

  const pendingUnlockRaw = G.pendingUnlock as
    | { playerID: string; layer: number; cardId: CardID }
    | null
    | undefined;

  return {
    matchId,
    viewerID: humanPlayerID,
    phase: 'playing',
    turnPhase: ((G.turnPhase as string) ?? 'action') as MockMatchState['turnPhase'],
    turnNumber: (G.turnNumber as number) ?? 0,
    currentPlayerID,
    dreamMasterID,
    players,
    playerOrder,
    layers,
    vaults,
    deckCount,
    discardPile,
    pendingUnlock: pendingUnlockRaw ?? null,
  };
}
