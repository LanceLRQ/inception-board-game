// TurnOrderRail - 移动端星穹铁道式竖直行动轴
// 对照：plans/design/06c-match-table-layout.md §4
//
// 规则：
//   - 宽度 64px（<375px）/ 72px（≥375px）
//   - 每个 slot：角色卡缩略头像 + 层徽 + 手牌数
//   - 当前行动者：scale 1.05 + 金色脉冲 + 自动 scrollIntoView(center)
//   - 只看不选：长按触发 CardDetailModal，点击无选目标副作用
//   - 未翻露的盗梦者显示背面

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../../lib/utils.js';
import { GameCard } from '../../../components/GameCard/index.js';
import { LayerBadge } from '../../../components/LayerBadge/index.js';
import { activeTurnPulse, railSlotEnter } from '../../../styles/animations.js';
import { getCardImageUrl, GENERIC_BACK_IMAGES } from '../../../lib/cardImages.js';
import { computeRailSlots } from './turnOrder.js';
import type { MockMatchState } from '../../../hooks/useMockMatch.js';

export interface TurnOrderRailProps {
  state: MockMatchState;
  onOpenDetail: (cardId: string) => void;
  className?: string;
}

export function TurnOrderRail({ state, onOpenDetail, className }: TurnOrderRailProps) {
  const slots = computeRailSlots({
    playerOrder: state.playerOrder,
    players: state.players,
    viewerID: state.viewerID,
    masterID: state.dreamMasterID,
    currentPlayerID: state.currentPlayerID,
  });

  // 当前行动者自动滚入视口
  const currentRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView({
      block: 'center',
      behavior: 'smooth',
    });
  }, [state.currentPlayerID]);

  return (
    <div
      className={cn(
        'flex shrink-0 flex-col gap-2 overflow-y-auto border-r border-border bg-card/40 py-2',
        'w-16 min-[375px]:w-[72px]',
        className,
      )}
      data-testid="turn-order-rail"
      aria-label="行动顺序"
    >
      {slots.map((slot) => {
        const p = state.players[slot.id];
        if (!p) return null;
        // viewer 自己的身份对自己永远可见；其他玩家按 isRevealed/isMaster 决定是否翻明
        const revealChar = slot.isViewer || p.isRevealed || slot.isMaster;
        const characterCardId = revealChar ? p.characterId || null : null;
        const orientation = slot.isMaster ? 'landscape' : 'portrait';
        // 未翻明 → 使用通用阵营背面图（盗梦者/梦主各自的真实卡背）
        const fallbackBack = slot.isMaster ? GENERIC_BACK_IMAGES.master : GENERIC_BACK_IMAGES.thief;
        const cardId = characterCardId ?? '__back__';
        const imageUrl = characterCardId ? getCardImageUrl(characterCardId) : fallbackBack;

        return (
          <motion.div
            key={slot.id}
            ref={slot.isCurrent ? currentRef : undefined}
            className={cn(
              'flex flex-col items-center gap-1 px-1',
              slot.isCurrent && 'scale-105',
              slot.isViewer && 'ring-1 ring-primary/60 rounded-lg',
              !p.isAlive && 'opacity-40',
            )}
            variants={railSlotEnter}
            initial="hidden"
            animate="visible"
            data-testid={`rail-slot-${slot.id}`}
            data-viewer={slot.isViewer || undefined}
          >
            <motion.div
              className="rounded-md"
              variants={activeTurnPulse}
              animate={slot.isCurrent ? 'active' : 'idle'}
            >
              <GameCard
                cardId={cardId}
                imageUrl={imageUrl}
                orientation={orientation}
                size="sm"
                onLongPress={() => onOpenDetail(cardId)}
                aria-label={`${p.nickname}${slot.isMaster ? '（梦主）' : ''}${slot.isViewer ? '（你）' : ''}`}
              />
            </motion.div>
            <LayerBadge layer={p.currentLayer} size="sm" />
            <span className="text-[9px] text-muted-foreground">🂠{p.handCount}</span>
            <span
              className={cn(
                'max-w-[56px] truncate text-[9px]',
                slot.isMaster
                  ? 'text-red-300'
                  : slot.isViewer
                    ? 'text-primary font-semibold'
                    : 'text-foreground',
              )}
            >
              {slot.isViewer ? `${p.nickname}（你）` : p.nickname}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
