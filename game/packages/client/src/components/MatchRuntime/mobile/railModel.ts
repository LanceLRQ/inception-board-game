// 移动布局行动轴的纯推导：每格头像用角色图还是阵营背面、状态、角标
// 顺序沿用 computeRailSlots；行动轴只看不选，所有数据都来自按座位裁剪后的视图。

import { computeRailSlots } from '../../../pages/Game/Track/turnOrder';
import { getCardImageUrl, GENERIC_BACK_IMAGES } from '../../../lib/cardImages';
import type { SeatMarker } from '../seatMarkers';
import type { StageState } from '../stageState';

export interface RailSlotView {
  readonly id: string;
  readonly nickname: string;
  readonly isViewer: boolean;
  readonly isMaster: boolean;
  readonly isCurrent: boolean;
  /** 已迷失（所在层 0 或已阵亡） */
  readonly isLost: boolean;
  readonly layer: number;
  readonly handCount: number;
  /** 已翻开的角色牌；没翻开为 null（头像显示阵营背面，不可看详情） */
  readonly characterId: string | null;
  readonly imageUrl: string | undefined;
  readonly markers: readonly SeatMarker[];
}

export function buildRailSlots(
  state: StageState,
  markersBySeat: Readonly<Record<string, readonly SeatMarker[]>> | undefined,
): RailSlotView[] {
  const slots = computeRailSlots({
    playerOrder: state.playerOrder,
    players: state.players,
    viewerID: state.viewerID,
    masterID: state.dreamMasterID,
    currentPlayerID: state.currentPlayerID,
  });
  return slots.flatMap((slot) => {
    const p = state.players[slot.id];
    if (!p) return [];
    // 本人的身份对自己永远可见；其他玩家按是否已翻开决定，梦主角色始终公开
    const reveal = slot.isViewer || p.isRevealed || slot.isMaster;
    const characterId = reveal && p.characterId ? p.characterId : null;
    const back = slot.isMaster ? GENERIC_BACK_IMAGES.master : GENERIC_BACK_IMAGES.thief;
    return [
      {
        id: slot.id,
        nickname: p.nickname,
        isViewer: slot.isViewer,
        isMaster: slot.isMaster,
        isCurrent: slot.isCurrent,
        isLost: p.currentLayer === 0 || !p.isAlive,
        layer: p.currentLayer,
        handCount: p.handCount,
        characterId,
        imageUrl: characterId ? (getCardImageUrl(characterId) ?? back) : back,
        markers: markersBySeat?.[slot.id] ?? [],
      },
    ];
  });
}
