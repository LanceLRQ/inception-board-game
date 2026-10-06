// 行动轴：手机上 64px 宽的紧凑竖列，每格 = 44px 头像 + 层 / 手牌数角标 + 名字；
// 平板（≥768px）加宽到 176px，每格改成横排：头像在左，名字、层 / 手牌数、状态标识在右。
// 行动轴只看不选目标：点头像只会为已翻开的角色打开卡牌详情。
// 当前行动者、本人、已迷失三种状态各有样式，且都不只靠颜色表达。

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { SeatStatusBadges } from '../../SeatStatusBadges';
import type { SeatView } from '../model/seatModel';

interface MobileRailProps {
  readonly slots: readonly SeatView[];
  readonly onOpenDetail: (characterId: string) => void;
}

function RailSlot({
  slot,
  onOpenDetail,
}: {
  slot: SeatView;
  onOpenDetail: (characterId: string) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement | null>(null);
  const { isCurrent } = slot;
  useEffect(() => {
    if (isCurrent) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [isCurrent]);

  const status = [
    slot.isMaster ? t('mobile.rail.master') : null,
    slot.isViewer ? t('seat.me') : null,
    isCurrent ? t('mobile.rail.current') : null,
    slot.isLost ? t('mobile.rail.lost') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const avatarLabel = slot.characterId
    ? t('seat.seeDetail', { name: slot.nickname })
    : `${slot.nickname} · ${t('mobile.rail.hidden')}`;

  return (
    <div
      ref={ref}
      className={cn(
        'relative flex shrink-0 flex-col items-center gap-[3px] tablet:flex-row tablet:gap-2.5',
        slot.isLost && 'opacity-40 saturate-[.3]',
      )}
      data-testid={`rail-slot-${slot.id}`}
      data-current={isCurrent || undefined}
      data-viewer={slot.isViewer || undefined}
      aria-current={isCurrent ? 'true' : undefined}
    >
      <button
        type="button"
        disabled={!slot.characterId}
        onClick={() => slot.characterId && onOpenDetail(slot.characterId)}
        aria-label={`${avatarLabel}${status ? `（${status}）` : ''}`}
        data-testid={`player-avatar-${slot.id}`}
        className={cn(
          'relative size-11 shrink-0 touch-manipulation overflow-hidden rounded-[10px] border bg-panel disabled:cursor-default tablet:size-14',
          isCurrent
            ? 'border-acc shadow-[0_0_0_1px_var(--ms-acc),0_0_16px_-3px_var(--ms-acc)]'
            : 'border-line-strong',
          slot.isViewer && 'outline outline-1 outline-offset-2 outline-acc [outline-style:dashed]',
        )}
      >
        {slot.imageUrl && (
          <img src={slot.imageUrl} alt="" draggable={false} className="size-full object-cover" />
        )}
        {slot.isLost && (
          <span className="absolute left-0 top-0 border border-line-strong bg-background px-[3px] py-0.5 font-mono text-[7px] leading-none tracking-[.1em] text-dim">
            {t('mobile.rail.lost')}
          </span>
        )}
      </button>
      <div className="flex min-w-0 flex-col items-center gap-[3px] tablet:flex-1 tablet:items-start tablet:gap-1">
        <div className="flex gap-[3px] font-mono text-[8px] leading-none tracking-[.04em] tablet:gap-1 tablet:text-[10px]">
          <span
            className="border border-line bg-panel px-[3px] py-0.5 text-dim"
            data-layer={slot.layer}
            aria-label={t('seat.layerAria', { layer: slot.layer })}
          >
            L{slot.layer}
          </span>
          <span
            className="border border-dashed border-line bg-panel px-[3px] py-0.5 text-faint"
            aria-label={t('seat.handAria', { n: slot.handCount })}
          >
            {t('mobile.rail.hand', { n: slot.handCount })}
          </span>
        </div>
        <span
          className={cn(
            'flex max-w-14 items-center gap-0.5 text-[8.5px] leading-tight tracking-[.03em] tablet:-order-1 tablet:max-w-full tablet:text-xs',
            isCurrent
              ? 'font-semibold text-acc-bright'
              : slot.isViewer
                ? 'text-foreground'
                : 'text-dim',
          )}
        >
          {isCurrent && <Play className="size-2 shrink-0 fill-current" aria-hidden />}
          {slot.isViewer && (
            <span className="shrink-0 border border-acc px-px text-[7px] leading-none text-acc-bright">
              {t('seat.me')}
            </span>
          )}
          <span className="truncate">{slot.nickname}</span>
        </span>
        {slot.markers.length > 0 && (
          <SeatStatusBadges
            markers={slot.markers}
            seatId={slot.id}
            size="sm"
            className="justify-center tablet:justify-start"
          />
        )}
      </div>
    </div>
  );
}

export function MobileRail({ slots, onOpenDetail }: MobileRailProps) {
  const { t } = useTranslation();
  return (
    <aside
      aria-label={t('mobile.rail.aria')}
      data-testid="turn-order-rail"
      className="flex w-16 shrink-0 flex-col gap-[7px] overflow-y-auto border-r border-line px-[5px] py-[9px] [scrollbar-width:none] tablet:w-44 tablet:gap-2.5 tablet:px-3 tablet:py-3 [&::-webkit-scrollbar]:hidden"
    >
      {slots.map((slot) => (
        <RailSlot key={slot.id} slot={slot} onOpenDetail={onOpenDetail} />
      ))}
    </aside>
  );
}
