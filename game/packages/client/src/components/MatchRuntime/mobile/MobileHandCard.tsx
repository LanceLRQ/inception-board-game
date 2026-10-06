// 手牌坞里的一张牌：点按 = 读牌，长按 2 秒 / 双击 / 键盘 = 卡牌详情（统一走 useCardPressDetail）
// 状态双编码：选中 = 抬起 + 描边（弃牌选中另加对勾徽标）；此刻打不出 = 变暗 + 禁用图标。

import { useTranslation } from 'react-i18next';
import { Ban, Check } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useCardPressDetail } from '../../../hooks/useCardPressDetail';
import type { HandCardItem } from '../controllerTypes';
import type { CardCategory } from './dockDerive';

const CATEGORY_BAR: Record<CardCategory, string> = {
  attack: 'bg-blood',
  unlock: 'bg-lock',
  support: 'bg-acc',
};

interface MobileHandCardProps {
  readonly item: HandCardItem;
  readonly category: CardCategory;
  /** 展开态的大卡 */
  readonly big?: boolean;
  /** 正在读这张牌 */
  readonly reading: boolean;
  /** 行动阶段轮到本人但这张牌此刻打不出 */
  readonly blocked: boolean;
  /** 大卡下方的小字（类别 · 目标要求） */
  readonly caption?: string;
  readonly onTap: () => void;
  readonly onDetail: () => void;
}

export function MobileHandCard({
  item,
  category,
  big = false,
  reading,
  blocked,
  caption,
  onTap,
  onDetail,
}: MobileHandCardProps) {
  const { t } = useTranslation();
  const { handlers } = useCardPressDetail({ onClick: onTap, onDetail });
  const highlighted = reading || item.selected;
  const stateLabel = item.selected
    ? t('mobile.dock.selectedDiscard')
    : reading
      ? t('mobile.dock.selected')
      : blocked
        ? t('mobile.dock.blocked')
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
      title={item.name}
      aria-label={stateLabel ? `${item.name}（${stateLabel}）` : item.name}
      aria-pressed={highlighted}
      className={cn(
        'relative block shrink-0 touch-manipulation select-none text-left transition-transform [-webkit-touch-callout:none]',
        big ? 'w-[88px]' : 'w-[58px]',
        highlighted && '-translate-y-[3px]',
      )}
    >
      <span
        className={cn(
          'relative block overflow-hidden border bg-panel',
          big ? 'h-[122px] w-[88px]' : 'h-20 w-[58px]',
          highlighted
            ? 'border-acc shadow-[0_0_0_1px_var(--ms-acc),0_8px_20px_-8px_var(--ms-acc)]'
            : 'border-line-strong',
          blocked && 'opacity-40 grayscale',
        )}
      >
        <i className={cn('absolute inset-x-0 top-0 z-[2] h-[3px]', CATEGORY_BAR[category])} />
        {item.imageUrl && (
          <img
            src={item.imageUrl}
            alt=""
            draggable={false}
            className="size-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
        {item.selected && (
          <span className="absolute right-0.5 top-1 z-[3] flex size-4 items-center justify-center rounded-full bg-acc text-background">
            <Check className="size-3" aria-hidden />
          </span>
        )}
        {blocked && (
          <span className="absolute bottom-0.5 right-0.5 z-[3] flex size-4 items-center justify-center rounded-full bg-background text-dim">
            <Ban className="size-3" aria-hidden />
          </span>
        )}
      </span>
      <span
        className={cn(
          'mt-[3px] block truncate text-center leading-[1.1] tracking-[.03em]',
          big ? 'text-[10.5px]' : 'text-[9.5px]',
          highlighted ? 'text-acc-bright' : big ? 'text-foreground' : 'text-dim',
        )}
      >
        {item.name}
      </span>
      {big && caption && (
        <span className="mt-px block truncate text-center font-mono text-[7.5px] tracking-[.06em] text-faint">
          {caption}
        </span>
      )}
    </button>
  );
}
