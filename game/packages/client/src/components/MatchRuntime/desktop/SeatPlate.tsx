// 座位牌：阵营点、角色卡面、角色名 / 昵称、所在层徽、手牌数、状态标识
// 座位只看不选目标：点角色卡只会为已翻开的角色打开卡牌详情。
// 当前行动者、已迷失、未翻露各有自己的状态样式，且都不只靠颜色表达（文字标签 + 形状）。
// 样式钩子类名：ms-seat / ms-card / ms-layerbadge（具体样式见 styles/skins）。

import { useTranslation } from 'react-i18next';
import { Layers, Play, Skull } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { CardArt } from '../../CardArt';
import { SeatStatusBadges } from '../../SeatStatusBadges';
import type { SeatView } from '../model/seatModel';
import type { PlannedSeat, SeatDensity } from './seatPlan';

interface SeatPlateProps {
  readonly seat: SeatView;
  readonly planned: PlannedSeat;
  readonly density: SeatDensity;
  /** 梦主座位旁的世界观卡名；视图里没有就是空数组，不显示 */
  readonly worldViews: readonly string[];
  readonly onOpenDetail: (characterId: string) => void;
}

/** 角色卡面尺寸（像素）：盗梦者竖排，梦主横排 */
const ART_SIZE: Record<SeatDensity, { thief: [number, number]; master: [number, number] }> = {
  grand: { thief: [128, 170], master: [188, 126] },
  full: { thief: [96, 128], master: [140, 94] },
  mid: { thief: [64, 86], master: [96, 64] },
  compact: { thief: [40, 54], master: [72, 48] },
};

export function SeatPlate({ seat, planned, density, worldViews, onOpenDetail }: SeatPlateProps) {
  const { t } = useTranslation();
  const [artW, artH] = ART_SIZE[density][seat.isMaster ? 'master' : 'thief'];
  const horizontal = density === 'compact' || seat.isMaster;
  const compact = density === 'compact';
  const big = density === 'full' || density === 'grand';

  const name = seat.characterName ?? t('desktop.seat.hiddenName');
  const flag = seat.isCurrent
    ? { icon: Play, text: t('desktop.seat.current') }
    : seat.isLost
      ? { icon: Skull, text: t('desktop.seat.lost') }
      : seat.isMaster
        ? { icon: null, text: t('desktop.seat.master') }
        : null;
  const label = [seat.nickname, seat.characterName, flag?.text].filter(Boolean).join(' · ');
  const FlagIcon = flag?.icon ?? null;

  const art = (
    <button
      type="button"
      disabled={!seat.characterId}
      onClick={() => seat.characterId && onOpenDetail(seat.characterId)}
      aria-label={
        seat.characterId
          ? t('desktop.seat.seeDetail', { name: seat.characterName ?? seat.nickname })
          : `${seat.nickname} · ${t('desktop.seat.unrevealed')}`
      }
      data-testid={`player-avatar-${seat.id}`}
      data-revealed={seat.characterId ? true : undefined}
      className="ms-card relative block shrink-0 overflow-hidden disabled:cursor-default"
      style={{ width: artW, height: artH }}
    >
      <CardArt src={seat.imageUrl} className="size-full" />
      {!compact && !seat.isMaster && (
        <span className="ms-seat-revtag absolute bottom-1 left-1">
          {seat.characterId ? t('desktop.seat.revealed') : t('desktop.seat.unrevealed')}
        </span>
      )}
    </button>
  );

  const meta = (
    <div className={cn('flex items-center gap-1.5', !horizontal && 'justify-center')}>
      <span
        className="ms-layerbadge"
        data-layer={seat.layer}
        aria-label={t('seat.layerAria', { layer: seat.layer })}
      >
        L{seat.layer}
      </span>
      <span
        className="flex items-center gap-0.5 font-mono text-[10px] text-faint"
        title={t('seat.handAria', { n: seat.handCount })}
        aria-label={t('seat.handAria', { n: seat.handCount })}
      >
        <Layers className="size-2.5" aria-hidden />
        <span className="tabular-nums">{seat.handCount}</span>
      </span>
      <SeatStatusBadges markers={seat.markers} seatId={seat.id} size="sm" />
    </div>
  );

  const flagRow = (
    <div
      className={cn(
        'ms-seat-flag flex h-3.5 items-center gap-1 font-mono text-[9px] leading-none tracking-[.2em]',
        !horizontal && 'justify-center',
      )}
      aria-hidden
    >
      {flag && (
        <>
          {FlagIcon && <FlagIcon className="size-2.5 fill-current" />}
          {flag.text}
        </>
      )}
    </div>
  );

  return (
    <div
      role="group"
      aria-label={label}
      data-testid={`player-seat-${seat.id}`}
      data-density={density}
      data-master={seat.isMaster || undefined}
      data-current={seat.isCurrent || undefined}
      data-lost={seat.isLost || undefined}
      data-revealed={seat.characterId ? true : undefined}
      className={cn(
        'ms-seat absolute z-10 box-border flex overflow-hidden transition-[left,top] duration-300',
        horizontal ? 'flex-row items-center gap-2.5 px-2.5' : 'flex-col items-center px-2 py-2',
        density === 'mid' && !horizontal && 'gap-0.5 px-1.5 py-1.5',
      )}
      style={{
        left: planned.x,
        top: planned.y,
        width: planned.w,
        height: planned.h,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <span
        className="ms-faction-dot"
        data-faction={seat.isMaster ? 'master' : 'thief'}
        aria-hidden
      />
      {!horizontal && flagRow}
      {art}
      {horizontal ? (
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          {flagRow}
          <b
            className={cn(
              'ms-seat-name block truncate font-heading font-bold tracking-[.08em]',
              seat.isMaster && !compact
                ? density === 'grand'
                  ? 'text-[21px]'
                  : 'text-[17px]'
                : 'text-[13px]',
            )}
          >
            {name}
          </b>
          <span className="block truncate font-mono text-[10px] tracking-[.1em] text-dim">
            {seat.nickname}
          </span>
          {seat.isMaster && !compact && worldViews.length > 0 && (
            <span
              className="line-clamp-2 text-[10.5px] leading-snug text-dim"
              data-testid="seat-worldview"
            >
              {t('desktop.seat.worldView', { names: worldViews.join('、') })}
            </span>
          )}
          {meta}
        </div>
      ) : (
        <>
          <b
            className={cn(
              'ms-seat-name mt-1.5 block w-full truncate text-center font-heading font-bold tracking-[.08em]',
              density === 'grand' ? 'text-[17px]' : big ? 'text-[14px]' : 'mt-1 text-[12px]',
            )}
          >
            {name}
          </b>
          <span className="block w-full truncate text-center font-mono text-[10px] tracking-[.1em] text-dim">
            {seat.nickname}
          </span>
          <div className={cn('mt-auto', big && 'pb-0.5')}>{meta}</div>
        </>
      )}
    </div>
  );
}
