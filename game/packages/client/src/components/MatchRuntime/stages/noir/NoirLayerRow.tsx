// 「深眠影院」中央舞台的一层：层号、层名、金库缩略图与状态、梦魇、心锁点阵
// 焦点层展开一行占位者；迷失层是一条虚线行。金库详情由外部打开（详情禁止翻面），梦境层牌不触发详情。

import { useTranslation } from 'react-i18next';
import { Crown, TriangleAlert, Vault } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { getCardImageUrl } from '../../../../lib/cardImages';
import { getCardName } from '../../../../lib/cards';
import { CardArt } from '../../../CardArt';
import { Die } from '../../../Die';
import type { BoardLayer, BoardNightmare, BoardVault } from '../../model/boardModel';
import { PixelAvatar } from '../../../PixelAvatar';

interface NoirLayerRowProps {
  readonly row: BoardLayer;
  readonly focus: boolean;
  readonly onFocus: (layer: number) => void;
  readonly onOpenCard: (cardId: string) => void;
}

function VaultThumb({ vault, onOpen }: { vault: BoardVault; onOpen: (cardId: string) => void }) {
  const { t } = useTranslation();
  const label = vault.opened
    ? t('board.tower.vaultOpened', { content: t(`board.tower.vaultContent.${vault.contentType}`) })
    : t('board.tower.vaultClosed');
  return (
    <button
      type="button"
      onClick={() => onOpen(vault.face)}
      aria-label={`${t('board.tower.openVault')}：${label}`}
      title={label}
      data-testid={`vault-thumb-${vault.id}`}
      data-opened={vault.opened || undefined}
      className="noir-vault ms-card relative z-[1] aspect-[26/35] h-[clamp(24px,6cqh,36px)] shrink-0 overflow-hidden"
    >
      <CardArt src={getCardImageUrl(vault.face)} className="size-full" />
    </button>
  );
}

function VaultChip({ vault }: { vault: BoardVault }) {
  const { t } = useTranslation();
  const text = vault.opened
    ? t('board.tower.vaultOpened', {
        content: t(`board.tower.vaultContent.${vault.contentType}`),
      })
    : vault.contentType !== 'hidden'
      ? t('desktop.board.vaultKnown', {
          content: t(`board.tower.vaultContent.${vault.contentType}`),
        })
      : t('board.tower.vaultClosed');
  return (
    <span className="noir-chip" data-opened={vault.opened || undefined}>
      <Vault className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{text}</span>
    </span>
  );
}

function NightmareTag({
  nightmare,
  onOpen,
}: {
  nightmare: BoardNightmare;
  onOpen: (cardId: string) => void;
}) {
  const { t } = useTranslation();
  const name = nightmare.cardId ? getCardName(nightmare.cardId) : null;
  const text = nightmare.revealed
    ? name
      ? t('board.tower.nightmareNamed', { name })
      : t('board.tower.nightmareRevealed')
    : t('board.tower.nightmareReady');
  const body = (
    <>
      <TriangleAlert className="size-3 shrink-0" aria-hidden />
      <span className="max-w-28 truncate">{text}</span>
    </>
  );
  const cls = cn(
    'noir-nightmare relative z-[1]',
    nightmare.revealed ? 'border-solid' : 'border-dashed',
  );
  return nightmare.cardId ? (
    <button
      type="button"
      className={cls}
      data-testid="nightmare-tag"
      onClick={() => onOpen(nightmare.cardId!)}
    >
      {body}
    </button>
  ) : (
    <span className={cls} data-testid="nightmare-tag">
      {body}
    </span>
  );
}

export function NoirLayerRow({ row, focus, onFocus, onOpenCard }: NoirLayerRowProps) {
  const { t } = useTranslation();
  const lost = row.layer === 0;
  const tag = row.unlocking
    ? t('board.tower.unlocking')
    : row.hasViewer
      ? t('board.tower.herePlayer')
      : null;

  return (
    <div
      data-testid={`layer-row-${row.layer}`}
      data-focus={focus || undefined}
      data-lost={lost || undefined}
      data-viewer-layer={row.hasViewer || undefined}
      className={cn(
        'noir-row relative flex min-h-0 flex-col justify-center gap-1.5 px-3.5',
        focus
          ? 'noir-row-focus max-h-[clamp(100px,32cqh,190px)] flex-[2.2_1_auto] py-2'
          : 'max-h-[clamp(48px,13cqh,120px)] flex-[1_1_auto] py-1',
        lost && 'flex-[0_0_auto]',
      )}
    >
      <div className={cn('flex min-w-0 items-center gap-2.5', focus && 'flex-wrap gap-y-1')}>
        <button
          type="button"
          onClick={() => onFocus(row.layer)}
          aria-pressed={focus}
          aria-label={t('desktop.board.focusLayer', {
            layer: row.layer,
            name: t(`board.layerName.${row.layer}`),
          })}
          data-testid={`layer-focus-${row.layer}`}
          className="noir-rowname flex shrink-0 items-center gap-2.5 after:absolute after:inset-0 after:content-['']"
        >
          <span
            className={cn(
              'w-6 font-mono text-[11px] tracking-[.1em]',
              !focus && '@max-[420px]:hidden',
            )}
          >
            L{row.layer}
          </span>
          <span className="font-heading text-[13px] font-semibold tracking-[.14em] whitespace-nowrap">
            {t(`board.layerName.${row.layer}`)}
          </span>
        </button>
        {lost ? (
          <span className="min-w-0 truncate font-mono text-[10px] tracking-[.06em] text-faint">
            {row.occupants.length > 0 ? t('board.tower.lostHere') : t('board.tower.lostEmpty')}
          </span>
        ) : (
          <>
            {row.vaults.map((v) => (
              <span key={v.id} className="flex min-w-0 shrink items-center gap-2">
                <VaultThumb vault={v} onOpen={onOpenCard} />
                <VaultChip vault={v} />
              </span>
            ))}
            {row.nightmare && <NightmareTag nightmare={row.nightmare} onOpen={onOpenCard} />}
            <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[10px] text-lock">
              <Die value={row.heartLock} kind="lock" size={focus ? 24 : 20} />
              <span className="tabular-nums hidden @min-[440px]:inline">{row.heartLock}</span>
            </span>
          </>
        )}
        {tag && (
          <span className="noir-focus-tag shrink-0 font-mono text-[9px] tracking-[.16em] whitespace-nowrap">
            {tag}
          </span>
        )}
      </div>
      {focus && (
        <div className="noir-occline flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {row.occupants.map((o) => (
              <span
                key={o.id}
                data-testid={`occupant-${o.id}`}
                data-self={o.isSelf || undefined}
                className="noir-occ flex max-w-44 items-center gap-1 text-[11px]"
              >
                <PixelAvatar seed={o.avatarSeed} size={14} rounded={false} />
                {o.isMaster && <Crown className="size-3 shrink-0 text-acc-bright" aria-hidden />}
                <span className="truncate">
                  {o.isSelf ? t('seat.me') : o.name}
                  {o.characterName && ` · ${o.characterName}`}
                </span>
              </span>
            ))}
          </div>
          <span className="ml-auto shrink-0 font-mono text-[9px] tracking-[.2em] text-faint">
            {t('desktop.board.focusLayerTag')}
          </span>
        </div>
      )}
    </div>
  );
}
