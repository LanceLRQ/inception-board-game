// 座位环：把规划好的座位牌摆到舞台上；本人不占座位（由底部坞承载）
// 座位只看不选目标。

import type { SeatView } from '../model/seatModel';
import { SeatPlate } from './SeatPlate';
import type { SeatPlan } from './seatPlan';

interface SeatRingProps {
  readonly plan: SeatPlan;
  readonly seats: ReadonlyMap<string, SeatView>;
  readonly worldViews: readonly string[];
  readonly onOpenDetail: (characterId: string) => void;
}

export function SeatRing({ plan, seats, worldViews, onOpenDetail }: SeatRingProps) {
  return (
    <>
      {plan.seats.map((planned) => {
        const seat = seats.get(planned.id);
        if (!seat) return null;
        return (
          <SeatPlate
            key={planned.id}
            seat={seat}
            planned={planned}
            density={plan.density}
            worldViews={worldViews}
            onOpenDetail={onOpenDetail}
          />
        );
      })}
    </>
  );
}
