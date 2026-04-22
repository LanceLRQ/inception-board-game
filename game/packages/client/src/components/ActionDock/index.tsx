// ActionDock - 底部固定操作栏（viewer 角色卡 + 层徽 + 手牌 + 技能入口）
// 对照：plans/design/06c-match-table-layout.md §5.4
//
// 布局：
//   PC（宽屏 ≥lg）：横向一行 [角色卡][层徽][手牌平铺 ≤7 / 抽屉 >7][技能]
//   移动端：HandDrawer 抽屉模式（forceDrawerMode）

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils.js';
import { GameCard } from '../GameCard/index.js';
import { LayerBadge } from '../LayerBadge/index.js';
import { HandDrawer, type HandCard } from '../HandDrawer/index.js';
import { activeTurnPulse } from '../../styles/animations.js';
import { getCardImageUrl } from '../../lib/cardImages.js';
import type { MockPlayer } from '../../hooks/useMockMatch.js';

export interface ActionDockProps {
  viewer: MockPlayer;
  hand: HandCard[];
  playableCardIds?: Set<string>;
  /** 轮到 viewer 时触发角色卡外框脉冲 */
  isCurrent: boolean;
  /** 手牌点选回调 */
  onPlayCard: (step: 'selectCard' | 'selectTarget', cardInstanceId: string) => void;
  /** 长按手牌/角色卡查看详情 */
  onCardDetail?: (cardId: string) => void;
  /** 外部 intent step 用于 HandDrawer 同步清选 */
  intentStep?: string;
  /** 右侧技能/操作按钮插槽 */
  skills?: ReactNode;
  /** 移动端强制 HandDrawer 抽屉（默认 false = PC 平铺） */
  forceDrawerMode?: boolean;
  className?: string;
}

/** PC 端平铺显示的手牌上限；超过走 HandDrawer */
const PC_TILE_THRESHOLD = 7;

export function ActionDock({
  viewer,
  hand,
  playableCardIds,
  isCurrent,
  onPlayCard,
  onCardDetail,
  intentStep,
  skills,
  forceDrawerMode,
  className,
}: ActionDockProps) {
  const useDrawer = forceDrawerMode ?? hand.length > PC_TILE_THRESHOLD;

  const characterCardId = viewer.characterId || '__back__';
  const orientation = viewer.faction === 'master' ? 'landscape' : 'portrait';
  const characterImage = viewer.characterId ? getCardImageUrl(viewer.characterId) : undefined;

  return (
    <div
      className={cn(
        'flex items-center gap-3 border-t border-border/60 bg-card/80 px-4 py-3 backdrop-blur',
        className,
      )}
      data-testid="action-dock"
    >
      {/* 角色卡（含脉冲） */}
      <motion.div
        className="rounded-lg"
        variants={activeTurnPulse}
        animate={isCurrent ? 'active' : 'idle'}
      >
        <GameCard
          cardId={characterCardId}
          imageUrl={characterImage}
          orientation={orientation}
          size="md"
          onLongPress={
            viewer.characterId ? () => onCardDetail?.(viewer.characterId as string) : undefined
          }
          aria-label={`${viewer.nickname}（我）`}
        />
      </motion.div>

      {/* 层徽 */}
      <div className="flex flex-col items-center gap-1">
        <LayerBadge layer={viewer.currentLayer} size="md" />
        <span className="text-[9px] text-muted-foreground">当前层</span>
      </div>

      {/* 手牌区 */}
      <div className="flex-1 min-w-0">
        {useDrawer ? (
          <HandDrawer
            hand={hand}
            playableCardIds={playableCardIds as Set<string>}
            onPlayCard={onPlayCard}
            onCardDetail={onCardDetail}
            intentStep={intentStep}
          />
        ) : (
          <div className="flex gap-2 overflow-x-auto" data-testid="hand-inline" aria-label="手牌">
            {hand.length === 0 && (
              <span className="self-center text-xs text-muted-foreground">（无手牌）</span>
            )}
            {hand.map((hc) => {
              const playable = playableCardIds?.has(hc.cardId) ?? false;
              return (
                <GameCard
                  key={hc.instanceId}
                  cardId={hc.cardId}
                  imageUrl={getCardImageUrl(hc.cardId)}
                  playable={playable}
                  size="sm"
                  onClick={playable ? () => onPlayCard('selectCard', hc.instanceId) : undefined}
                  onLongPress={() => onCardDetail?.(hc.cardId)}
                  aria-label={hc.cardId}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* 技能/操作插槽 */}
      {skills && <div className="flex shrink-0 items-center gap-2">{skills}</div>}
    </div>
  );
}
