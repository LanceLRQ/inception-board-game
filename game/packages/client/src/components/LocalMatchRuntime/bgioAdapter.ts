// 将对局视图 G 与流程信息 ctx 适配为 MockMatchState 结构，复用新 UI（MatchTable / MatchTrack）
//
// 注意：这是纯展示层适配，不影响 LocalMatchRuntime 的真实交互（pendingPlay / Dialog 群等）

import type { MatchView, RunnerCtx } from '@icgame/game-engine';
import type { CardID } from '@icgame/shared';
import type { MockMatchState, MockPlayer, MockLayer, MockVault } from '../../hooks/useMockMatch.js';

export interface AdaptBGIOtoMockStateOpts {
  G: MatchView;
  ctx: Pick<RunnerCtx, 'currentPlayer'>;
  /** 人类玩家 ID，默认 '0' */
  humanPlayerID?: string;
  /** 房间 ID */
  matchId?: string;
}

/**
 * 把 BGIO 的 G/ctx 转成 MockMatchState 视图。
 * 入参已经是按座位裁剪过的视图：他人手牌为 null、只有张数，牌库只有张数。这里只做结构对齐。
 */
export function adaptBGIOtoMockState(opts: AdaptBGIOtoMockStateOpts): MockMatchState | null {
  const { G, ctx, humanPlayerID = '0', matchId = 'local-match' } = opts;
  const rawPlayers = G.players;
  if (!rawPlayers) return null;

  const dreamMasterID = G.dreamMasterID ?? '';
  const playerOrder = Object.keys(rawPlayers).sort();
  const currentPlayerID = ctx.currentPlayer ?? playerOrder[0] ?? '';

  const players: Record<string, MockPlayer> = {};
  for (const id of playerOrder) {
    const p = rawPlayers[id]!;
    players[id] = {
      id,
      nickname: p.nickname ?? id,
      avatarSeed: 0,
      faction: p.faction === 'master' ? 'master' : 'thief',
      characterId: p.characterId ?? '',
      isRevealed: !!p.isRevealed,
      currentLayer: p.currentLayer ?? 1,
      // 视图里只有本人（和对局结束后）带牌；其他玩家 hand 为 null，只看张数
      hand: id === humanPlayerID && Array.isArray(p.hand) ? p.hand : null,
      handCount: p.handCount ?? 0,
      isAlive: p.isAlive === undefined ? true : !!p.isAlive,
    };
  }

  const layers: Record<number, MockLayer> = {};
  for (const [k, info] of Object.entries(G.layers ?? {})) {
    const layerNum = info.layer ?? Number(k);
    layers[layerNum] = {
      layer: layerNum,
      heartLockValue: info.heartLockValue ?? 0,
      playersInLayer: info.playersInLayer ?? [],
      nightmareRevealed: !!info.nightmareRevealed,
    };
  }

  const vaults: MockVault[] = (G.vaults ?? []).map((v, i) => ({
    id: v.id ?? `vault_${i}`,
    layer: v.layer ?? 0,
    // 看不到内容的金库（null）按「未知」展示
    contentType: v.contentType ?? 'hidden',
    isOpened: !!v.isOpened,
  }));

  // 视图里牌库只有张数，没有牌序
  const deckCount = G.deck?.cardCount ?? 0;
  const discardPile: CardID[] = G.deck?.discardPile ?? [];

  return {
    matchId,
    viewerID: humanPlayerID,
    phase: 'playing',
    turnPhase: G.turnPhase ?? 'action',
    turnNumber: G.turnNumber ?? 0,
    currentPlayerID,
    dreamMasterID,
    players,
    playerOrder,
    layers,
    vaults,
    deckCount,
    discardPile,
    pendingUnlock: G.pendingUnlock ?? null,
  };
}
