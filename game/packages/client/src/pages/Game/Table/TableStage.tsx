// TableStage - 围坐椭圆舞台容器（PC 端 ≥ 1024px）

import type { ReactNode } from 'react';
import { cn } from '../../../lib/utils.js';
import { PlayerSeat } from '../../../components/PlayerSeat/index.js';
import { computeSeats } from './seatLayout.js';
import type { StageState } from '../../../components/MatchRuntime/stageState.js';
import type { SeatMarker } from '../../../components/MatchRuntime/seatMarkers.js';

export interface TableStageProps {
  state: StageState;
  /** 长按某玩家角色卡查看详情 */
  onOpenCharacterDetail: (cardId: string) => void;
  /** 舞台中央节点（CenterPanel） */
  centerSlot?: ReactNode;
  /** 按座位号索引的状态标识；不传则不显示 */
  seatMarkers?: Readonly<Record<string, readonly SeatMarker[]>>;
  className?: string;
}

export function TableStage({
  state,
  onOpenCharacterDetail,
  centerSlot,
  seatMarkers,
  className,
}: TableStageProps) {
  const seats = computeSeats({
    playerOrder: state.playerOrder,
    viewerID: state.viewerID,
    masterID: state.dreamMasterID,
  });

  return (
    <div
      className={cn(
        'relative mx-auto w-full max-w-5xl',
        'aspect-[16/10]', // 椭圆舞台的基础长宽比
        'rounded-[3rem] border-2 border-line-strong',
        'bg-gradient-to-br from-panel-2 via-background to-panel',
        'shadow-inner',
        className,
      )}
      data-testid="table-stage"
    >
      {/* 中央桌面区 */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[55%] max-w-md">
        {centerSlot}
      </div>

      {/* 所有 Seat */}
      {seats.map((seat) => {
        const player = state.players[seat.id];
        if (!player) return null;
        const characterCardId =
          player.isRevealed || seat.isViewer ? player.characterId || null : null;
        return (
          <PlayerSeat
            key={seat.id}
            player={player}
            seat={seat}
            isCurrent={state.currentPlayerID === seat.id}
            characterCardId={characterCardId}
            onOpenDetail={onOpenCharacterDetail}
            markers={seatMarkers?.[seat.id]}
          />
        );
      })}
    </div>
  );
}
