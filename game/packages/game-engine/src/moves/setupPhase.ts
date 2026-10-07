// 准备阶段的 move：选角色占位与开局发牌（随机决定梦主与角色）。

import type { Faction } from '@icgame/shared';
import { MASTER_POOL, THIEF_POOL } from '../characterPools.js';
import { applyMercuryRouteExtraFailBribe } from '../engine/skills.js';
import type { SetupState } from '../setup.js';
import type { MoveCtx } from './common.js';

export const setupPhaseMoves = {
  pickCharacter: {
    move: ({ G }: { G: SetupState }) => G,
    client: false,
  },

  // 完成 setup：随机决定梦主，切到 playing 阶段
  // 回合归属由 playing.turn.order.first 计算（基于 G.dreamMasterID）
  completeSetup: {
    move: ({ G, random }: MoveCtx) => {
      const masterIdx = random.Die(G.playerOrder.length) - 1;
      const masterID = G.playerOrder[masterIdx]!;

      // 给玩家随机分配角色：候选池见 characterPools.ts
      const masterChar = MASTER_POOL[random.Die(MASTER_POOL.length) - 1]!;
      const shuffledThieves = random.Shuffle([...THIEF_POOL]);

      const nextPlayers: typeof G.players = { ...G.players };
      let thiefCursor = 0;
      for (const pid of G.playerOrder) {
        if (pid === masterID) {
          nextPlayers[pid] = {
            ...nextPlayers[pid]!,
            faction: 'master' as Faction,
            characterId: masterChar,
            // 梦主的世界观效果对所有玩家公开可见（世界观全局触发规则），
            // 因此梦主 characterId 对所有玩家公开；盗梦者继续保持 isRevealed=false
            // 直到被翻面或贿赂揭示。
            // 对照：docs/manual/06-dream-master.md 各梦主"世界观"条目
            isRevealed: true,
          };
        } else {
          const ch = shuffledThieves[thiefCursor % shuffledThieves.length]!;
          thiefCursor++;
          nextPlayers[pid] = {
            ...nextPlayers[pid]!,
            characterId: ch,
          };
        }
      }

      // 水星·航路世界观：梦主翻开时 bribePool 追加 1 张 fail
      // 对照：docs/manual/06-dream-master.md 水星·航路
      const baseState: SetupState = {
        ...G,
        phase: 'playing' as const,
        dreamMasterID: masterID,
        players: nextPlayers,
      };
      return applyMercuryRouteExtraFailBribe(baseState, masterChar);
    },
    client: false,
  },
};
