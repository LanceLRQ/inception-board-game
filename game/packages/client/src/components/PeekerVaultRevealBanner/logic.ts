// 盗梦者金库查看 banner · 纯逻辑层
// 对照：docs/manual/04-action-cards.md §梦境窥视 效果①
// "你查看任意一层梦境的金库，且不得公布你看到的结果"
//
// 触发：peekReveal 挂起 + viewer 是 peekerID → 展示 vaultLayer 上的 vault 内容
//   vault 内容：contentType ∈ 'secret' | 'coin' | 'empty' | 'hidden'
//   engine playerView 已将 peekerID 视角下 vaultLayer 对应 vault 透传 contentType。

import type { SetupState } from '@icgame/game-engine';

export interface PeekerVaultRevealBannerState {
  visible: boolean;
  layer: number | null;
  /** 该层所有金库内容（一层可能有 0~N 个金库，实际默认每层 1 个） */
  vaults: Array<{ id: string; contentType: string; isOpened: boolean }>;
}

export function computePeekerVaultRevealState(
  G: SetupState | null | undefined,
  viewerPlayerID: string,
): PeekerVaultRevealBannerState {
  const empty: PeekerVaultRevealBannerState = {
    visible: false,
    layer: null,
    vaults: [],
  };
  if (!G) return empty;
  const pr = G.peekReveal;
  if (!pr) return empty;
  if (pr.peekerID !== viewerPlayerID) return empty;
  if (pr.revealKind !== 'vault') return empty;

  const vaults = G.vaults
    .filter((v) => v.layer === pr.vaultLayer)
    .map((v) => ({
      id: v.id,
      contentType: String(v.contentType),
      isOpened: v.isOpened,
    }));

  return {
    visible: true,
    layer: pr.vaultLayer,
    vaults,
  };
}
