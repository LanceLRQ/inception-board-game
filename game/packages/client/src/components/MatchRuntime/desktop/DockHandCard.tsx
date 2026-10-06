// 底部坞里的一张手牌：卡图 + 标签区（类别、卡名、目标要求 / 此刻可否打出）
// 点按 = 选中（弃牌阶段 = 切换弃牌选择），长按 2 秒 / 双击 / 键盘 = 卡牌详情（统一走 useCardPressDetail）。
// 状态双编码：选中 = 抬起 + 描边 + 对勾徽标 + 文字；此刻打不出 = 变暗 + 禁用图标 + 文字。
// 样式钩子类名：ms-handcard / ms-card。

import { useTranslation } from 'react-i18next';
import { Ban, Check } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useCardPressDetail } from '../../../hooks/useCardPressDetail';
import { CardArt } from '../../CardArt';
import type { HandCardItem } from '../controllerTypes';
import type { CardCategory } from '../model/handDerive';

interface DockHandCardProps {
  readonly item: HandCardItem;
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
      className="ms-handcard relative flex aspect-[96/152] h-full shrink-0 touch-manipulation select-none flex-col text-left [-webkit-touch-callout:none]"
    >
      <span className="ms-handcard-art relative block min-h-0 flex-1 overflow-hidden">
        <CardArt src={item.imageUrl} className="size-full" fallback={item.name} />
        {item.selected && (
          <span className="ms-handcard-badge absolute right-1 top-1.5 flex size-4 items-center justify-center rounded-full">
            <Check className="size-3" aria-hidden />
          </span>
        )}
        {blocked && (
          <span className="ms-handcard-badge absolute bottom-1 right-1 flex size-4 items-center justify-center rounded-full">
            <Ban className="size-3" aria-hidden />
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-col px-1.5 pb-1.5 pt-1">
        <span className="flex items-baseline justify-between gap-1 font-mono text-[8px] leading-tight tracking-[.16em] text-faint">
          <span className="truncate">{t(`handInfo.category.${category}`)}</span>
          {stateText && (
            <span className={cn('shrink-0', highlighted ? 'text-acc-bright' : 'text-dim')}>
              {stateText}
            </span>
          )}
        </span>
        <b
          className={cn(
            'block truncate font-heading text-[13px] leading-snug font-black tracking-[.04em]',
            highlighted ? 'text-acc-bright' : 'text-foreground',
          )}
        >
          {item.name}
        </b>
        {targetText && (
          <span className="block truncate font-mono text-[8px] leading-tight tracking-[.06em] text-faint">
            {targetText}
          </span>
        )}
      </span>
    </button>
  );
}
