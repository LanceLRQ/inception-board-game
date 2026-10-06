// 座位的展示数据（移动端行动轴与桌面端座位牌共用）：头像用角色图还是阵营背面、状态、角标
// 顺序沿用 computeRailSlots；座位只看不选，所有数据都来自按座位裁剪后的视图。

import type { MatchView } from '@icgame/game-engine';
import { getCardImageUrl, GENERIC_BACK_IMAGES } from '../../../lib/cardImages';
import { getCardName, getCharacterSkillSummary } from '../../../lib/cards';
import type { SeatMarker } from '../seatMarkers';
import type { StageState } from './stageState';
import { computeRailSlots } from './turnOrder';

export interface SeatView {
  readonly id: string;
  readonly nickname: string;
  /** 像素头像种子（公开信息） */
  readonly avatarSeed: string;
  readonly isViewer: boolean;
  readonly isMaster: boolean;
  readonly isCurrent: boolean;
  /** 已迷失（所在层 0 或已阵亡） */
  readonly isLost: boolean;
  readonly layer: number;
  readonly handCount: number;
  /** 已翻开的角色牌；没翻开为 null（头像显示阵营背面，不可看详情） */
  readonly characterId: string | null;
  /** 已翻开角色的名字；没翻开为 null */
  readonly characterName: string | null;
  /** 已翻开（梦主与本人不算「翻露」标记，由调用方按 isMaster / isViewer 判断） */
  readonly isRevealed: boolean;
  readonly imageUrl: string | undefined;
  readonly markers: readonly SeatMarker[];
}

/** 全部座位，顺序为行动轴顺序（梦主在首位，本人也在其中） */
export function buildSeatViews(
  state: StageState,
  markersBySeat: Readonly<Record<string, readonly SeatMarker[]>> | undefined,
): SeatView[] {
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
        avatarSeed: p.avatarSeed,
        isViewer: slot.isViewer,
        isMaster: slot.isMaster,
        isCurrent: slot.isCurrent,
        isLost: p.currentLayer === 0 || !p.isAlive,
        layer: p.currentLayer,
        handCount: p.handCount,
        characterId,
        characterName: characterId ? (getCharacterSkillSummary(characterId)?.name ?? null) : null,
        isRevealed: p.isRevealed,
        imageUrl: characterId ? (getCardImageUrl(characterId) ?? back) : back,
        markers: markersBySeat?.[slot.id] ?? [],
      },
    ];
  });
}

/** 梦主座位旁的世界观：视图里有什么显示什么（只给卡名），没有为空数组 */
export function worldViewNames(view: Pick<MatchView, 'activeWorldViews'> | undefined): string[] {
  return (view?.activeWorldViews ?? []).map((id) => getCardName(id));
}
