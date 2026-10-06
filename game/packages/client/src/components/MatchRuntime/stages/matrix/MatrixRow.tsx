// 「梦境矩阵」进程表的一行：层 / 金库 / 心锁 / 占位 / 状态 五列
// 金库缩略图与梦魇牌可点开详情（金库详情禁止翻面），梦境层牌不触发详情；点层名把它设为焦点层。

import { useTranslation } from 'react-i18next';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import { getCardImageUrl } from '../../../../lib/cardImages';
import { getCardName } from '../../../../lib/cards';
import { CardArt } from '../../../CardArt';
import { Die } from '../../../Die';
import type { BoardLayer, BoardNightmare, BoardVault } from '../../model/boardModel';
import { nodeNames, rowMarker, vaultCell } from './matrixRows';

interface MatrixRowProps {
  readonly row: BoardLayer;
  readonly focus: boolean;
  readonly onFocus: (layer: number) => void;
  readonly onOpenCard: (cardId: string) => void;
}

function VaultCell({ vault, onOpen }: { vault: BoardVault; onOpen: (cardId: string) => void }) {
  const { t } = useTranslation();
  const cell = vaultCell(vault);
  const content = cell.kind === 'sealed' ? '' : t(`board.tower.vaultContent.${cell.content}`);
  const text = t(`desktop.board.matrix.vault.${cell.kind}`, { content });
  const label = vault.opened
    ? t('board.tower.vaultOpened', { content: t(`board.tower.vaultContent.${vault.contentType}`) })
    : t('board.tower.vaultClosed');
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <button
        type="button"
        onClick={() => onOpen(vault.face)}
        aria-label={`${t('board.tower.openVault')}：${label}`}
        title={label}
        data-testid={`vault-thumb-${vault.id}`}
        data-opened={vault.opened || undefined}
        className="matrix-vault ms-card relative z-[1] aspect-[26/35] h-[clamp(18px,4.6cqh,26px)] shrink-0 overflow-hidden"
      >
        <CardArt src={getCardImageUrl(vault.face)} className="size-full" />
      </button>
      <span className="matrix-vault-text truncate" data-opened={vault.opened || undefined}>
        {text}
      </span>
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
  // 完整说明留给无障碍名称与悬停提示；表格里只放短标签，列宽有限
  const full = nightmare.revealed
    ? name
      ? t('board.tower.nightmareNamed', { name })
      : t('board.tower.nightmareRevealed')
    : t('board.tower.nightmareReady');
  const text = nightmare.revealed
    ? (name ?? t('desktop.board.matrix.nightmare.revealed'))
    : t('desktop.board.matrix.nightmare.ready');
  const body = (
    <>
      <TriangleAlert className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{text}</span>
    </>
  );
  const common = {
    'data-testid': 'nightmare-tag',
    'data-revealed': nightmare.revealed || undefined,
    title: full,
    'aria-label': full,
  };
  return nightmare.cardId ? (
    <button
      type="button"
      className="matrix-nightmare relative z-[1]"
      onClick={() => onOpen(nightmare.cardId!)}
      {...common}
    >
      {body}
    </button>
  ) : (
    <span className="matrix-nightmare relative z-[1]" role="img" {...common}>
      {body}
    </span>
  );
}

export function MatrixRow({ row, focus, onFocus, onOpenCard }: MatrixRowProps) {
  const { t } = useTranslation();
  const lost = row.layer === 0;
  const marker = rowMarker(row, focus);
  const nodes = nodeNames(row.occupants, t('seat.me'));
  const markerText =
    marker === 'unlocking'
      ? t('board.tower.unlocking')
      : marker === 'here'
        ? t('board.tower.herePlayer')
        : marker === 'focus'
          ? t('desktop.board.matrix.marker.focus')
          : null;

  return (
    <div
      role="row"
      data-testid={`layer-row-${row.layer}`}
      data-layer={row.layer}
      data-focus={focus || undefined}
      data-lost={lost || undefined}
      data-viewer-layer={row.hasViewer || undefined}
      data-marker={marker ?? undefined}
      className="matrix-row relative grid min-h-0 flex-1 items-center"
    >
      <div role="cell" className="flex min-w-0 items-center">
        <button
          type="button"
          onClick={() => onFocus(row.layer)}
          aria-pressed={focus}
          aria-label={t('desktop.board.focusLayer', {
            layer: row.layer,
            name: t(`board.layerName.${row.layer}`),
          })}
          data-testid={`layer-focus-${row.layer}`}
          className="matrix-layername flex min-w-0 items-center gap-1 after:absolute after:inset-0 after:content-['']"
        >
          <ChevronRight className="matrix-pointer size-3 shrink-0" aria-hidden />
          <span className="font-mono text-[11px] tracking-[.06em]">L{row.layer}</span>
          <span className="truncate text-[12px] font-semibold tracking-[.1em] whitespace-nowrap">
            {t(`board.layerName.${row.layer}`)}
          </span>
        </button>
      </div>
      {lost ? (
        <div role="cell" className="col-span-2 min-w-0">
          <span className="matrix-dim block truncate text-[10.5px] tracking-[.04em]">
            {row.occupants.length > 0 ? t('board.tower.lostHere') : t('board.tower.lostEmpty')}
          </span>
        </div>
      ) : (
        <>
          <div role="cell" className="flex min-w-0 flex-col justify-center">
            {row.vaults.map((v) => (
              <VaultCell key={v.id} vault={v} onOpen={onOpenCard} />
            ))}
          </div>
          <div role="cell" className="flex items-center gap-1 text-lock">
            <Die value={row.heartLock} kind="lock" size={15} />
            <span className="font-mono text-[10px] tabular-nums">{row.heartLock}</span>
          </div>
        </>
      )}
      <div role="cell" className="min-w-0">
        <span className="matrix-nodes block truncate text-[11px]" title={nodes}>
          {nodes}
        </span>
      </div>
      <div role="cell" className="flex min-w-0 items-center justify-end gap-1.5">
        {row.nightmare && <NightmareTag nightmare={row.nightmare} onOpen={onOpenCard} />}
        {markerText && (
          <span className="matrix-marker shrink-0 font-mono text-[9px] tracking-[.12em] whitespace-nowrap">
            {markerText}
          </span>
        )}
      </div>
    </div>
  );
}
