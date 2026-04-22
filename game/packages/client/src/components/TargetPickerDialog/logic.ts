// TargetPickerDialog 候选排序纯逻辑
// 对照：plans/design/06c-match-table-layout.md §5.3 / §6.3
//
// 主人要求："按顺序排列，显示对应的角色卡面，方便一眼认出"
// 顺序：自 playerOrder 起始，**剔除 viewer 自己**（不能对自己发动），按顺序呈现

import type { CardID } from '@icgame/shared';
import type { MockMatchState, MockPlayer } from '../../hooks/useMockMatch.js';

export interface TargetCandidate {
  playerID: string;
  nickname: string;
  /** 盗梦者/梦主用于决定 GameCard orientation */
  faction: 'thief' | 'master';
  /** 角色卡 id；未翻露则为 null → 显示背面 */
  characterCardId: string | null;
  currentLayer: number;
  isAlive: boolean;
  isRevealed: boolean;
  /** 是否合法目标（由 useLegalActions 派生） */
  isLegal: boolean;
  /** 非法时的原因提示（tooltip） */
  illegalReason?: string;
}

export interface OrderCandidatesOpts {
  state: MockMatchState;
  /** 当前持卡者（viewer），会被剔除 */
  viewerID: string;
  /** 合法目标集合（来自 useLegalActions.legalTargetsByCard[cardId]） */
  legalTargetIds: Set<string>;
  /** 卡牌 id 用于填充 illegalReason */
  cardId?: CardID | string;
}

/**
 * 按 playerOrder 顺序，剔除 viewer，生成候选人列表。
 */
export function orderCandidates(opts: OrderCandidatesOpts): TargetCandidate[] {
  const { state, viewerID, legalTargetIds } = opts;
  const result: TargetCandidate[] = [];
  for (const pid of state.playerOrder) {
    if (pid === viewerID) continue;
    const p = state.players[pid];
    if (!p) continue;
    result.push(toTargetCandidate(p, legalTargetIds));
  }
  return result;
}

function toTargetCandidate(p: MockPlayer, legalTargetIds: Set<string>): TargetCandidate {
  const isLegal = legalTargetIds.has(p.id) && p.isAlive;
  return {
    playerID: p.id,
    nickname: p.nickname,
    faction: p.faction,
    characterCardId: p.isRevealed || p.faction === 'master' ? p.characterId || null : null,
    currentLayer: p.currentLayer,
    isAlive: p.isAlive,
    isRevealed: p.isRevealed,
    isLegal,
    illegalReason: isLegal
      ? undefined
      : !p.isAlive
        ? '已死亡'
        : !legalTargetIds.has(p.id)
          ? '非合法目标'
          : undefined,
  };
}
