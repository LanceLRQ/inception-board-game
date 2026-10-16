// 牌桌：梦境层卡片 + 牌堆一行，所有主题的中央舞台共用；主题只决定外框、标题与装饰

import type { CenterStageProps } from '../types';
import { PileRow } from '../../shared/PileRow';
import { LayerCards } from './LayerCards';

export function TableBoard({ board, onFocusLayer, onOpenCard }: CenterStageProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <LayerCards
        className="flex-1"
        layers={board.layers}
        focusLayer={board.focusLayer}
        onFocus={onFocusLayer}
        onOpenCard={onOpenCard}
      />
      <PileRow deck={board.deck} piles={board.piles} onOpenCard={onOpenCard} />
    </div>
  );
}
