// PlayerSeat - PC 围坐桌面座位节点（左角色卡 + 右层徽 + 手牌数角标 + 当前行动脉冲）
// 对照：plans/design/06c-match-table-layout.md §5.1
//
// 关键约束（按主人确认）：
//   - Seat 不响应 click 选目标，只支持长按/双击打开 CardDetailModal
//   - 梦主 landscape / 盗梦者 portrait
//   - viewer 底中央放大到 lg
//   - 未翻露的盗梦者显示背面
//   - isCurrent 时金色脉冲光

import { motion } from 'framer-motion';
import { cn } from '../../lib/utils.js';
import { GameCard } from '../GameCard/index.js';
import { LayerBadge } from '../LayerBadge/index.js';
import { activeTurnPulse, seatEnter } from '../../styles/animations.js';
import { getCardImageUrl } from '../../lib/cardImages.js';
import type { Seat } from '../../pages/Game/Table/seatLayout.js';
import type { MockPlayer } from '../../hooks/useMockMatch.js';

export interface PlayerSeatProps {
  player: MockPlayer;
  seat: Seat;
  /** 轮到此玩家行动 */
  isCurrent: boolean;
  /** 角色卡面显示的 cardId；未翻露传 undefined/null → 背面 */
  characterCardId?: string | null;
  /** 长按/双击打开详情 */
  onOpenDetail: (cardId: string) => void;
}

export function PlayerSeat({
  player,
  seat,
  isCurrent,
  characterCardId,
  onOpenDetail,
}: PlayerSeatProps) {
  const cardId = characterCardId ?? '__back__';
  const orientation = seat.isMaster ? 'landscape' : 'portrait';
  const size = seat.slot === 'bottom' ? 'lg' : 'md';
  const imageUrl = characterCardId ? getCardImageUrl(characterCardId) : undefined;

  return (
    <motion.div
      className={cn(
        'absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 rounded-xl p-2',
        seat.slot === 'bottom' && 'z-30',
        seat.slot === 'top' && 'z-20',
        seat.slot === 'ring' && 'z-10',
        !player.isAlive && 'opacity-40',
      )}
      style={{ left: `${seat.x * 100}%`, top: `${seat.y * 100}%` }}
      variants={seatEnter}
      initial="hidden"
      animate="visible"
      data-testid={`player-seat-${player.id}`}
      data-slot={seat.slot}
    >
      {/* 左：角色卡（含脉冲光外框） */}
      <motion.div
        className="rounded-lg"
        variants={activeTurnPulse}
        animate={isCurrent ? 'active' : 'idle'}
      >
        <GameCard
          cardId={cardId}
          imageUrl={imageUrl}
          orientation={orientation}
          size={size}
          onLongPress={() => onOpenDetail(cardId)}
          aria-label={`${player.nickname}${seat.isMaster ? '（梦主）' : ''}`}
        />
      </motion.div>

      {/* 右：层徽 + 手牌数 + 昵称 */}
      <div className="flex flex-col items-start gap-1">
        <LayerBadge layer={player.currentLayer} size={size === 'lg' ? 'md' : 'sm'} />
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] text-slate-100">
          <span aria-hidden>🂠</span>
          <span className="tabular-nums">{player.handCount}</span>
        </span>
        <span
          className={cn(
            'max-w-[80px] truncate text-[11px] font-medium',
            seat.isMaster ? 'text-red-300' : 'text-foreground',
          )}
        >
          {player.nickname}
          {player.isRevealed && !seat.isMaster && (
            <span className="ml-1 text-[9px] text-yellow-400">已翻</span>
          )}
          {!player.isAlive && <span className="ml-1 text-[9px] text-red-400">💀</span>}
        </span>
      </div>
    </motion.div>
  );
}
