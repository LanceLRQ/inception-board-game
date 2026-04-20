// 手牌抽屉 - 上滑展开/选中/两步点击打牌
// 对照：plans/design/06-frontend-design.md §6.4.3 HandDrawer + §6.4.4 两步点击

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { cn } from '../../lib/utils.js';
import { GameCard } from '../GameCard/index.js';
import { getCardImageUrl } from '../../lib/cardImages.js';
import { useUIStore } from '../../stores/useUIStore.js';
import type { CardID } from '@icgame/shared';

export interface HandCard {
  instanceId: string;
  cardId: CardID;
}

export interface HandDrawerProps {
  /** 手牌列表 */
  hand: HandCard[];
  /** 当前可打出的卡牌 ID 集合 */
  playableCardIds?: Set<string>;
  /** 打牌回调：step='selectCard' 选中牌 / step='selectTarget' 确认打牌 */
  onPlayCard: (step: 'selectCard' | 'selectTarget', cardInstanceId: string) => void;
  /** 查看卡牌详情（长按） */
  onCardDetail?: (cardId: CardID) => void;
}

export function HandDrawer({ hand, playableCardIds, onPlayCard, onCardDetail }: HandDrawerProps) {
  const isDrawerOpen = useUIStore((s) => s.isHandDrawerOpen);
  const setDrawerOpen = useUIStore((s) => s.setHandDrawerOpen);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 手势：上滑展开，下滑收起
  const bind = useDrag(
    ({
      direction: [, dy],
      velocity: [, vy],
    }: {
      direction: [number, number];
      velocity: [number, number];
    }) => {
      if (dy < 0 && vy > 0.2) setDrawerOpen(true);
      if (dy > 0 && vy > 0.2) setDrawerOpen(false);
    },
  );

  const handleCardClick = useCallback(
    (card: HandCard) => {
      if (selectedId === card.instanceId) {
        // 再次点击 → 取消选中
        setSelectedId(null);
      } else {
        setSelectedId(card.instanceId);
        onPlayCard('selectCard', card.instanceId);
      }
    },
    [selectedId, onPlayCard],
  );

  // 提取手势事件（过滤与 framer-motion 冲突的属性）
  const bindHandlers = bind();

  return (
    <motion.div
      className="fixed bottom-16 left-0 right-0 z-40 touch-none rounded-t-2xl bg-background shadow-lg"
      animate={{ height: isDrawerOpen ? '55vh' : '100px' }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      onPointerDown={bindHandlers.onPointerDown}
      onPointerMove={bindHandlers.onPointerMove}
      onPointerUp={bindHandlers.onPointerUp}
    >
      {/* 拖拽把手 */}
      <div className="flex justify-center py-2">
        <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
      </div>

      {/* 阶段提示 */}
      {selectedId && (
        <div className="px-4 pb-2 text-center text-sm text-muted-foreground">
          已选牌，点击目标确认打出
        </div>
      )}

      {/* 手牌列表 */}
      <div
        className={cn(
          'flex gap-2 overflow-x-auto px-4 pb-4',
          isDrawerOpen ? 'flex-wrap content-start' : '',
        )}
      >
        <AnimatePresence mode="popLayout">
          {hand.map((card) => {
            const isPlayable = playableCardIds?.has(card.cardId) ?? false;
            return (
              <GameCard
                key={card.instanceId}
                cardId={card.cardId}
                imageUrl={getCardImageUrl(card.cardId)}
                size={isDrawerOpen ? 'lg' : 'sm'}
                playable={isPlayable}
                selected={selectedId === card.instanceId}
                onClick={() => handleCardClick(card)}
                onLongPress={() => onCardDetail?.(card.cardId)}
                aria-label={card.cardId}
              />
            );
          })}
        </AnimatePresence>

        {hand.length === 0 && (
          <div className="flex h-20 w-full items-center justify-center text-sm text-muted-foreground">
            暂无手牌
          </div>
        )}
      </div>
    </motion.div>
  );
}
