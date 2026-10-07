// 梦主角色的主动技能与世界观效果（其中土星、火星的世界观效果由盗梦者发动）。

import type { CardID, Layer } from '@icgame/shared';
import { isStringArray } from '../engine/argShape.js';
import { INVALID_MOVE } from '../engine/invalidMove.js';
import {
  FORTRESS_SKILL_ID,
  applyChessTranspose,
  applyImperialCityWorldShoot,
  applyMarsBattlefieldExchange,
  applyMarsKillDiscardUnlock,
  applyPlutoBurning,
  applySaturnFreeMove,
  applySecretPassageTeleport,
  applyUranusPower,
  applyVenusDouble,
  applyVenusMirrorWorld,
  canMarsKill,
  fortressColdnessChancesLeft,
  isOutwardThief,
  markSkillUsed,
} from '../engine/skills.js';
import { incrementMoveCounter } from '../stateOps.js';
import { type MoveCtx, guardTurnPhase } from './common.js';
import { activateNightmareOnLayer } from './nightmareEffects.js';
import { getShootProfile } from './shootProfiles.js';
import { applyShootVariant } from './shootResolution.js';

export const masterSkillMoves = {
  // 棋局·易位（梦主限定）：交换两个未打开的金库位置，perGame 最多 2 次
  // 对照：packages/game-engine/src/engine/skills.ts applyChessTranspose
  useChessTranspose: {
    move: ({ G, ctx }: MoveCtx, vaultIdx1: number, vaultIdx2: number) => {
      if (!Number.isInteger(vaultIdx1) || !Number.isInteger(vaultIdx2)) return INVALID_MOVE;
      if (!G.vaults[vaultIdx1] || !G.vaults[vaultIdx2]) return INVALID_MOVE;
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
      const next = applyChessTranspose(G, ctx.currentPlayer, vaultIdx1, vaultIdx2);
      // applyChessTranspose 拒绝时返回原 state（无变化）
      if (next === G) return INVALID_MOVE;
      return next;
    },
    client: false,
  },

  // 要塞·冷酷：梦主在自己的出牌阶段每移动到另一层一次，可视为对任一盗梦者使用 1 张 SHOOT
  // 对照：docs/manual/06-dream-master.md 要塞 121 行
  // 发动机会按换层次数累计（stateOps.ts 的 FORTRESS_COLDNESS_CHANCES_KEY），不限次数，用掉一次记一次。
  // 没有实体牌：不弃牌、不走水星·逆流、不计入出牌记录、不受层数限制、不带死亡宣言；
  // 骰面按普通 SHOOT，梦主是射手所以 M4 卡宾枪照常 -1，其余（双鱼应答窗口、选层、白羊·星尘）走共同结算。
  // 目标按对外身份算：除梦主外的存活玩家都可选（背叛者也可以，否则能不能选就泄露了阵营）。
  useFortressColdness: {
    move: ({ G, ctx, random }: MoveCtx, targetID: string) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
      const self = G.players[ctx.currentPlayer];
      if (!self || !self.isAlive || self.characterId !== 'dm_fortress') return INVALID_MOVE;
      if (fortressColdnessChancesLeft(self.skillUsedThisTurn) <= 0) return INVALID_MOVE;
      if (!isOutwardThief(G, targetID)) return INVALID_MOVE;

      const profile = getShootProfile('action_shoot');
      if (!profile) return INVALID_MOVE;
      const r = applyShootVariant(G, ctx, random, targetID, null, {
        ...profile,
        sameLayerRequired: false,
        skill: 'fortress_coldness',
      });
      if (r === INVALID_MOVE) return r;
      return markSkillUsed(r, ctx.currentPlayer, FORTRESS_SKILL_ID);
    },
    client: false,
  },

  // 金星·镜界 · 重影：展示牌库顶 N（N=活盗梦者数）+ 展示手牌 → 同名入手，其余混洗回顶
  // 对照：docs/manual/06-dream-master.md 金星·镜界
  useVenusDouble: {
    move: ({ G, ctx, random }: MoveCtx, revealedHandIds: CardID[]) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
      if (!Array.isArray(revealedHandIds)) return INVALID_MOVE;
      const result = applyVenusDouble(
        G,
        ctx.currentPlayer,
        revealedHandIds,
        <T>(arr: readonly T[]) => random.Shuffle([...arr]),
      );
      if (result === null) return INVALID_MOVE;
      return result;
    },
    client: false,
  },

  // 天王星·权力：每未派发贿赂可移动 1 个盗梦者到指定层（非迷失层）
  // 对照：docs/manual/06-dream-master.md 天王星·苍穹
  useUranusPower: {
    move: ({ G, ctx }: MoveCtx, targetPlayerID: string, targetLayer: number) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
      const result = applyUranusPower(G, ctx.currentPlayer, targetPlayerID, targetLayer as Layer);
      if (result === null) return INVALID_MOVE;
      return incrementMoveCounter(result);
    },
    client: false,
  },

  // 冥王星·业火：弃 1 → 所有手牌<2 的盗梦者抽 2
  // 对照：docs/manual/06-dream-master.md 冥王星·地狱
  usePlutoBurning: {
    move: ({ G, ctx }: MoveCtx, discardCardId: CardID) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
      const result = applyPlutoBurning(G, ctx.currentPlayer, discardCardId);
      if (result === null) return INVALID_MOVE;
      return incrementMoveCounter(result);
    },
    client: false,
  },

  // 火星·杀戮：弃 1 解封 → 发动指定层的梦魇牌效果（无需翻开）
  // 对照：docs/manual/06-dream-master.md 火星·战场
  useMarsKill: {
    move: ({ G, ctx, random }: MoveCtx, layer: number, params?: Record<string, unknown>) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
      if (!canMarsKill(G, ctx.currentPlayer)) return INVALID_MOVE;
      const ls = G.layers[layer];
      if (!ls || !ls.nightmareId) return INVALID_MOVE;
      // 弃 1 解封
      const afterDiscard = applyMarsKillDiscardUnlock(G, ctx.currentPlayer);
      if (afterDiscard === null) return INVALID_MOVE;
      // 发动梦魇效果；该层梦魇离开棋盘并计入已发动
      const next = activateNightmareOnLayer(afterDiscard, layer, random, params);
      if (next === INVALID_MOVE) return INVALID_MOVE;
      return incrementMoveCounter(next);
    },
    client: false,
  },

  // 土星·领地世界观：持贿赂的盗梦者出牌阶段免费移动 1 次到相邻层
  // 对照：docs/manual/06-dream-master.md 土星·领地 世界观
  useSaturnFreeMove: {
    move: ({ G, ctx }: MoveCtx, targetLayer: number) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const result = applySaturnFreeMove(G, ctx.currentPlayer, targetLayer as Layer);
      if (result === null) return INVALID_MOVE;
      return incrementMoveCounter(result);
    },
    client: false,
  },

  // 火星·战场世界观：弃 2 非 SHOOT → 弃牌堆取 1 SHOOT 入手
  // 对照：docs/manual/06-dream-master.md 火星·战场 世界观
  useMarsBattlefield: {
    move: (
      { G, ctx }: MoveCtx,
      discardCard1: CardID,
      discardCard2: CardID,
      targetShootCardId: CardID,
    ) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const result = applyMarsBattlefieldExchange(
        G,
        ctx.currentPlayer,
        [discardCard1, discardCard2],
        targetShootCardId,
      );
      if (result === null) return INVALID_MOVE;
      return incrementMoveCounter(result);
    },
    client: false,
  },

  // 密道·传送：弃 1 穿梭剂送任一盗梦者到迷失层。回合限 2 次。
  // 对照：docs/manual/06-dream-master.md 密道
  playSecretPassageTeleport: {
    move: ({ G, ctx }: MoveCtx, targetPlayerID: string, transitCardId: CardID) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
      const result = applySecretPassageTeleport(
        G,
        ctx.currentPlayer,
        targetPlayerID,
        transitCardId,
      );
      if (result === null) return INVALID_MOVE;
      return incrementMoveCounter(result);
    },
    client: false,
  },

  // 皇城世界观：收到贿赂的玩家选一个未收到贿赂的盗梦者视为 SHOOT（掷骰-3）
  // 每收到 1 张贿赂牌获得 1 次机会（imperialShootCharges），发动即消耗
  // 对照：docs/manual/06-dream-master.md 皇城
  useImperialCityWorldShoot: {
    move: ({ G, ctx, random }: MoveCtx, targetID: string) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const master = G.players[G.dreamMasterID];
      if (!master || master.characterId !== 'dm_imperial_city') return INVALID_MOVE;
      const roll = random.D6();
      const applied = applyImperialCityWorldShoot(G, ctx.currentPlayer, targetID, roll, () =>
        random.D6(),
      );
      if (applied === null) return INVALID_MOVE;
      return incrementMoveCounter(applied);
    },
    client: false,
  },

  // 金星·镜界世界观：弃 2 张牌复制本回合已用的 SHOOT/KICK 效果
  // 对照：docs/manual/06-dream-master.md 金星·镜界
  useVenusMirrorWorld: {
    move: ({ G, ctx, random }: MoveCtx, targetID: string, discardedCardIds: CardID[]) => {
      if (!isStringArray(discardedCardIds)) return INVALID_MOVE;
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const roll = random.D6();
      const applied = applyVenusMirrorWorld(G, ctx.currentPlayer, targetID, discardedCardIds, roll);
      if (applied === null) return INVALID_MOVE;
      return incrementMoveCounter(applied);
    },
    client: false,
  },
};
