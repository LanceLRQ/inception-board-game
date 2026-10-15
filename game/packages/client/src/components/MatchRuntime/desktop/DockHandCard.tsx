// 底部坞里的一张手牌：按原比例完整显示的卡图，下沿压一条标签（类别、卡名、目标要求 / 此刻可否打出）
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
      className="ms-handcard relative block aspect-[745/1040] h-full shrink-0 touch-manipulation select-none overflow-hidden text-left [-webkit-touch-callout:none]"
    >
      {/* 整张牌按原比例完整显示（黑边已由 CardArt 裁掉），卡名与状态压在牌的下沿 */}
      <span className="ms-handcard-art absolute inset-0 block overflow-hidden">
        <CardArt src={item.imageUrl} className="size-full" fallback={item.name} />
      </span>
      {item.selected && (
        <span className="ms-handcard-badge absolute right-1 top-1.5 z-[1] flex size-4 items-center justify-center rounded-full">
          <Check className="size-3" aria-hidden />
        </span>
      )}
      {blocked && (
        <span className="ms-handcard-badge absolute right-1 top-1.5 z-[1] flex size-4 items-center justify-center rounded-full">
          <Ban className="size-3" aria-hidden />
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-background via-background/85 to-transparent px-1.5 pb-1.5 pt-4">
        <span className="flex items-baseline justify-between gap-1 font-mono text-[8px] leading-tight tracking-[.16em] text-dim">
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
          <span className="block truncate font-mono text-[8px] leading-tight tracking-[.06em] text-dim">
            {targetText}
          </span>
        )}
      </span>
    </button>
  );
}
