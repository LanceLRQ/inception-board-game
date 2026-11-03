// 牌桌：梦境层卡片 + 牌堆一行，所有主题的中央舞台共用；主题只决定外框、标题与装饰

import { useTranslation } from 'react-i18next';
import type { CenterStageProps } from '../types';
import { PileRow } from '../../shared/PileRow';
import { LayerCards } from './LayerCards';

export function TableBoard({ board, onFocusLayer, onOpenCard }: CenterStageProps) {
  const { t } = useTranslation();
  return (
    <div className="tabletop-board-body">
      <LayerCards
        className="flex-1"
        layers={board.layers}
        focusLayer={board.focusLayer}
        onFocus={onFocusLayer}
        onOpenCard={onOpenCard}
      />
      <PileRow deck={board.deck} piles={board.piles} onOpenCard={onOpenCard} />
      <p className="tabletop-event" role="status" aria-live="polite">
        <span aria-hidden>↳</span>
        {board.activity
          ? t(`board.activity.${board.activity.kind}`, board.activity.params)
          : '选中一张手牌，准备你的行动。'}
      </p>
    </div>
  );
}
