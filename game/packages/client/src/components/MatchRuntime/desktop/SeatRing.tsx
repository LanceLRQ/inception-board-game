// 座位环：把规划好的座位牌摆到舞台上；本人不占座位（由底部坞承载）
// 座位只看不选目标。

import type { ChatEntry } from '../../../match/chat';
import { Fragment } from 'react';
import type { SeatView } from '../model/seatModel';
import { ChatBubble } from '../shared/ChatBubble';
import { SeatPlate } from './SeatPlate';
import { bubbleSpot, type SeatPlan } from './seatPlan';

interface SeatRingProps {
  readonly plan: SeatPlan;
  readonly seats: ReadonlyMap<string, SeatView>;
  readonly worldViews: readonly string[];
  readonly onOpenDetail: (characterId: string) => void;
  /** 此刻还在显示的短语气泡，键是座位 */
  readonly bubbles?: ReadonlyMap<string, ChatEntry>;
  /** 舞台宽度，气泡放不下时据此换到座位牌另一侧 */
  readonly stageWidth?: number;
}

export function SeatRing({
  plan,
  seats,
  worldViews,
  onOpenDetail,
  bubbles,
  stageWidth = Number.POSITIVE_INFINITY,
}: SeatRingProps) {
  return (
    <>
      {plan.seats.map((planned) => {
        const seat = seats.get(planned.id);
        if (!seat) return null;
        const spot = bubbleSpot(planned, stageWidth);
        return (
          <Fragment key={planned.id}>
            <SeatPlate
              seat={seat}
              planned={planned}
              density={plan.density}
              worldViews={worldViews}
              onOpenDetail={onOpenDetail}
            />
            <ChatBubble
              entry={bubbles?.get(planned.id)}
              seatId={planned.id}
              side={spot.side}
              className="absolute"
              style={{
                left: spot.x,
                top: spot.y,
                transform: spot.side === 'right' ? 'translateX(-100%)' : undefined,
              }}
            />
          </Fragment>
        );
      })}
    </>
  );
}
