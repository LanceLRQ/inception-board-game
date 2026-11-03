import { useTranslation } from 'react-i18next';
import { Ban, Check } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useCardPressDetail } from '../../../hooks/useCardPressDetail';
import { CardArt } from '../../CardArt';
import type { HandCardItem } from '../controllerTypes';
import type { CardCategory } from '../model/handDerive';

interface DockHandCardProps {
  readonly item: HandCardItem;
  readonly tilt: number;
  readonly category: CardCategory;
  /** 目标要求的短文案；没有就不显示 */
  readonly targetText: string | null;
  /** 正在读 / 选中这张牌 */
  readonly reading: boolean;
  /** 行动阶段轮到本人但这张牌此刻打不出 */
  readonly blocked: boolean;
  readonly onTap: () => void;
  readonly onDetail: () => void;
}

export function DockHandCard({
  item,
  tilt,
  category,
  targetText,
  reading,
  blocked,
  onTap,
  onDetail,
}: DockHandCardProps) {
  const { t } = useTranslation();
  const { handlers } = useCardPressDetail({ onClick: onTap, onDetail });
  const highlighted = reading || item.selected;
  const stateText = item.selected
    ? t('desktop.hand.state.selectedDiscard')
    : reading
      ? t('desktop.hand.state.selected')
      : blocked
        ? t('desktop.hand.state.blocked')
        : null;

  return (
    <button
      type="button"
      {...handlers}
      // 屏幕阅读器等辅助技术触发的合成点击（鼠标 / 触摸的点按已由指针事件处理）
      onClick={(e) => {
        if (e.detail === 0) onTap();
      }}
      onContextMenu={(e) => e.preventDefault()}
      data-testid={`card-${item.index}`}
      data-category={category}
      data-selected={item.selected || undefined}
      data-reading={reading || undefined}
      data-blocked={blocked || undefined}
      title={item.name}
      aria-label={stateText ? `${item.name}（${stateText}）` : item.name}
      aria-pressed={highlighted}
      className="tabletop-hand-card"
      style={{ '--tilt': `${tilt}deg` } as CSSProperties}
    >
      <span className="tabletop-hand-art">
        <CardArt
          src={item.imageUrl}
          className="size-full"
          fallback={item.name}
          trimBorder={false}
        />
        {item.selected && (
          <span className="tabletop-hand-badge">
            <Check size={14} aria-hidden />
          </span>
        )}
        {blocked && (
          <span className="tabletop-hand-badge">
            <Ban size={14} aria-hidden />
          </span>
        )}
      </span>
      <span className="tabletop-card-label">{item.name}</span>
      <span className="sr-only">{targetText}</span>
    </button>
  );
}
