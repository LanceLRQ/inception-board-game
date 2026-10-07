// 终局判定：秘密金库被打开、港口与海王星世界观的梦主胜、牌库抽完。

import type { Faction } from '@icgame/shared';
import { checkHarborWin, checkNeptuneWin } from './engine/skills.js';
import type { SetupState } from './setup.js';

export function matchEndIf({ G }: { G: SetupState }) {
  if (!G?.vaults) return undefined;

  const secretVault = G.vaults.find((v) => v.contentType === 'secret');
  if (secretVault?.isOpened) {
    return { winner: 'thief' as Faction, reason: 'secret_vault_opened' };
  }

  // 盗梦者全部在迷失层不是终局：迷失层的玩家仍可在自己回合的出牌阶段弃 2 张牌复活自己
  // 对照：docs/manual/03-game-flow.md 第 19–20 行（胜负只有「打开秘密金库」与「牌库抽完」两条）

  // 港口世界观：≥2 金库打开且秘密未开 → 梦主胜
  // 对照：cards-data.json dm_harbor 世界观
  if (checkHarborWin(G)) {
    return { winner: 'master' as Faction, reason: 'harbor_two_vaults' };
  }

  // 海王星·泓洋世界观：金币金库被打开 → 梦主胜
  // 对照：cards-data.json dm_neptune_ocean 世界观
  if (checkNeptuneWin(G)) {
    return { winner: 'master' as Faction, reason: 'neptune_coin_opened' };
  }

  // 牌库耗尽 + 秘密金库未开 → 梦主胜
  // 对照：docs/manual/03-game-flow.md 第 20 行
  if (G.deck && G.deck.cards.length === 0 && G.phase === 'playing') {
    return { winner: 'master' as Faction, reason: 'deck_exhausted' };
  }

  return undefined;
}
