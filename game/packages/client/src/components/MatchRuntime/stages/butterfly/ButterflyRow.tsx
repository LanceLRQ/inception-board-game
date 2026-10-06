// 「庄周梦蝶」长卷的一层：竖排层签 + 金库缩略图与题注 + 心锁骰 + 梦魇印 + 占位者
// 第 1–4 层各画一重山，越近越深；迷失层在山外，画一只蝶。焦点层多出占位者与说明一行。
// 金库缩略图与梦魇牌可点开详情（金库详情禁止翻面），梦境层牌不触发详情；点层签把这一层设为焦点层。

import { useTranslation } from 'react-i18next';
import { Crown, TriangleAlert } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { getCardImageUrl } from '../../../../lib/cardImages';
import { getCardName } from '../../../../lib/cards';
import { CardArt } from '../../../CardArt';
import { Die } from '../../../Die';
import type { BoardLayer, BoardNightmare, BoardVault } from '../../model/boardModel';
import { ButterflyGlyph } from './ButterflyGlyph';
import { occupantLine, ridgeShape, rowTag, vaultCaption } from './butterflyRows';

interface ButterflyRowProps {
  readonly row: BoardLayer;
  readonly focus: boolean;
  readonly onFocus: (layer: number) => void;
  readonly onOpenCard: (cardId: string) => void;
}

function VaultSeal({ vault, onOpen }: { vault: BoardVault; onOpen: (cardId: string) => void }) {
  const { t } = useTranslation();
  const caption = vaultCaption(vault);
  const content = caption.kind === 'closed' ? '' : t(`board.tower.vaultContent.${caption.content}`);
  const label =
    caption.kind === 'opened'
      ? t('board.tower.vaultOpened', { content })
      : t('board.tower.vaultClosed');
  const text =
    caption.kind === 'opened'
      ? label
      : caption.kind === 'known'
        ? t('desktop.board.vaultKnown', { content })
        : label;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <button
        type="button"
        onClick={() => onOpen(vault.face)}
        aria-label={`${t('board.tower.openVault')}：${label}`}
        title={label}
        data-testid={`vault-thumb-${vault.id}`}
        data-opened={vault.opened || undefined}
        className="butterfly-vault ms-card relative z-[1] aspect-[26/35] h-[clamp(22px,5.6cqh,34px)] shrink-0 overflow-hidden"
      >
        <CardArt src={getCardImageUrl(vault.face)} className="size-full" />
      </button>
      <span className="butterfly-vault-text truncate" data-opened={vault.opened || undefined}>
        {text}
      </span>
    </span>
  );
}

function NightmareSeal({
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
  const common = {
    'data-testid': 'nightmare-tag',
    'data-revealed': nightmare.revealed || undefined,
  };
  return nightmare.cardId ? (
    <button
      type="button"
      className="butterfly-nightmare relative z-[1]"
      onClick={() => onOpen(nightmare.cardId!)}
      {...common}
    >
      {body}
    </button>
  ) : (
    <span className="butterfly-nightmare relative z-[1]" {...common}>
      {body}
    </span>
  );
}

export function ButterflyRow({ row, focus, onFocus, onOpenCard }: ButterflyRowProps) {
  const { t } = useTranslation();
  const lost = row.layer === 0;
  const ridge = ridgeShape(row.layer);
  const tag = rowTag(row, focus);
  const tagText =
    tag === 'unlocking'
      ? t('board.tower.unlocking')
      : tag === 'here'
        ? t('board.tower.herePlayer')
        : tag === 'focus'
          ? t('board.tower.focusTag')
          : null;
  const names = occupantLine(row.occupants, t('seat.me'));

  return (
    <div
      role="group"
      aria-label={t(`board.layerName.${row.layer}`)}
      data-testid={`layer-row-${row.layer}`}
      data-layer={row.layer}
      data-focus={focus || undefined}
      data-lost={lost || undefined}
      data-viewer-layer={row.hasViewer || undefined}
      data-tag={tag ?? undefined}
      className={cn(
        'butterfly-row relative flex min-h-0 items-center gap-3 px-3',
        focus
          ? 'max-h-[clamp(96px,30cqh,180px)] flex-[2.1_1_0]'
          : 'max-h-[clamp(44px,12cqh,90px)] flex-[1_1_0]',
      )}
    >
      {ridge && (
        <svg
          className="butterfly-ridge absolute inset-x-0 bottom-0 w-full"
          viewBox="0 0 100 40"
          preserveAspectRatio="none"
          aria-hidden
          focusable="false"
        >
          <path className="butterfly-ridge-fill" d={ridge.fill} />
          <path className="butterfly-ridge-line" d={ridge.line} vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      <button
        type="button"
        onClick={() => onFocus(row.layer)}
        aria-pressed={focus}
        aria-label={t('desktop.board.focusLayer', {
          layer: row.layer,
          name: t(`board.layerName.${row.layer}`),
        })}
        data-testid={`layer-focus-${row.layer}`}
        className="butterfly-tag relative z-[1] shrink-0 after:absolute after:-inset-1 after:content-['']"
      >
        <span className="butterfly-tag-name">{t(`board.layerName.${row.layer}`)}</span>
      </button>
      <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-1">
        <div className="flex min-w-0 items-center gap-3">
          {lost ? (
            <>
              <ButterflyGlyph className="butterfly-flyer size-[clamp(22px,5.4cqh,34px)] shrink-0" />
              <span className="butterfly-dim min-w-0 flex-1 truncate text-[11.5px]">
                {row.occupants.length > 0 ? t('board.tower.lostHere') : t('board.tower.lostEmpty')}
              </span>
            </>
          ) : (
            <>
              <span className="flex min-w-0 flex-col justify-center">
                {row.vaults.map((v) => (
                  <VaultSeal key={v.id} vault={v} onOpen={onOpenCard} />
                ))}
              </span>
              <span className="butterfly-lock flex shrink-0 items-center gap-1 text-lock">
                <Die value={row.heartLock} kind="lock" size={focus ? 22 : 18} />
                <span className="font-mono text-[10.5px] tabular-nums">{row.heartLock}</span>
              </span>
              {row.nightmare && <NightmareSeal nightmare={row.nightmare} onOpen={onOpenCard} />}
            </>
          )}
          <span className="ml-auto flex min-w-0 shrink items-center gap-2">
            {!focus && names && (
              <span className="butterfly-names truncate text-[11px]" title={names}>
                {names}
              </span>
            )}
            {tagText && (
              <span className="butterfly-seal shrink-0 whitespace-nowrap" data-tag={tag}>
                {tagText}
              </span>
            )}
          </span>
        </div>
        {focus && (
          <>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {row.occupants.map((o) => (
                <span
                  key={o.id}
                  data-testid={`occupant-${o.id}`}
                  data-self={o.isSelf || undefined}
                  className="butterfly-occ flex max-w-44 items-center gap-1 text-[11px]"
                >
                  {o.isMaster && <Crown className="size-3 shrink-0 text-acc" aria-hidden />}
                  <span className="truncate">
                    {o.isSelf ? t('seat.me') : o.name}
                    {o.characterName && ` · ${o.characterName}`}
                  </span>
                </span>
              ))}
            </div>
            <p className="butterfly-note butterfly-dim truncate text-[11px]">
              {t(row.note.key, row.note.params)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
