// 牌桌上的一层：以原版梦境牌的卡图为底，叠上层名、心锁、金库、梦魇与在场玩家
// 整张卡可点（设为焦点层）；金库缩略图与已知的梦魇可点开详情（金库详情禁止翻面），梦境层牌本身不触发详情。
// 样式钩子类名：ms-dreamcard（含 -veil / -head / -occ），状态属性 data-layer / data-focus / data-viewer-layer / data-unlocking。

import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Crown, TriangleAlert, Vault } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { getCardImageUrl } from '../../../../lib/cardImages';
import { getCardName } from '../../../../lib/cards';
import { CardArt } from '../../../CardArt';
import { Die } from '../../../Die';
import { PixelAvatar } from '../../../PixelAvatar';
import type { BoardLayer, BoardNightmare, BoardOccupant, BoardVault } from '../../model/boardModel';

interface DreamLayerCardProps {
  readonly row: BoardLayer;
  readonly focus: boolean;
  readonly onFocus: (layer: number) => void;
  readonly onOpenCard: (cardId: string) => void;
}

function vaultLabel(vault: BoardVault, t: TFunction): string {
  const content = t(`board.tower.vaultContent.${vault.contentType}`);
  if (vault.opened) return t('board.tower.vaultOpened', { content });
  return vault.contentType !== 'hidden'
    ? t('board.tower.vaultMasterKnows', { content })
    : t('board.tower.vaultClosed');
}

function VaultThumb({ vault, onOpen }: { vault: BoardVault; onOpen: (cardId: string) => void }) {
  const { t } = useTranslation();
  const label = vaultLabel(vault, t);
  return (
    <button
      type="button"
      onClick={() => onOpen(vault.face)}
      aria-label={`${t('board.tower.openVault')}：${label}`}
      title={label}
      data-testid={`vault-thumb-${vault.id}`}
      data-opened={vault.opened || undefined}
      className="ms-card relative z-[1] aspect-[745/1040] h-[clamp(26px,14cqh,46px)] shrink-0 overflow-hidden"
    >
      <CardArt src={getCardImageUrl(vault.face)} className="size-full" />
    </button>
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
      <span className="truncate">{text}</span>
    </>
  );
  const cls = cn(
    'ms-dreamcard-tag relative z-[1] flex max-w-full min-w-0 items-center gap-1',
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

/** 在场玩家：头像 + （焦点层或迷失层里）名字；本人、梦主、当前行动者各有标记 */
export function OccupantChip({ occupant, named }: { occupant: BoardOccupant; named: boolean }) {
  const { t } = useTranslation();
  const name = occupant.isSelf ? t('seat.me') : occupant.name;
  const full = occupant.characterName ? `${name} · ${occupant.characterName}` : name;
  return (
    <span
      data-testid={`occupant-${occupant.id}`}
      data-self={occupant.isSelf || undefined}
      data-current={occupant.isCurrent || undefined}
      title={full}
      className="ms-dreamcard-occ flex max-w-40 min-w-0 items-center gap-1 text-[11px]"
    >
      <PixelAvatar seed={occupant.avatarSeed} size={14} rounded={false} />
      {occupant.isMaster && <Crown className="size-3 shrink-0" aria-hidden />}
      {named ? <span className="truncate">{full}</span> : <span className="sr-only">{full}</span>}
    </span>
  );
}

export function DreamLayerCard({ row, focus, onFocus, onOpenCard }: DreamLayerCardProps) {
  const { t } = useTranslation();
  const tag = row.unlocking
    ? t('board.tower.unlocking')
    : row.hasViewer
      ? t('board.tower.herePlayer')
      : null;

  return (
    <div
      data-testid={`layer-row-${row.layer}`}
      data-layer={row.layer}
      data-focus={focus || undefined}
      data-viewer-layer={row.hasViewer || undefined}
      data-unlocking={row.unlocking || undefined}
      className={cn(
        'ms-dreamcard relative isolate flex min-h-0 min-w-0 flex-col justify-between gap-1 overflow-hidden p-2 [container-type:size]',
        focus ? 'flex-[1.35_1_0]' : 'flex-[1_1_0]',
      )}
    >
      <CardArt
        src={getCardImageUrl(row.dreamCardId)}
        className="absolute inset-0 -z-10 size-full"
      />
      <span className="ms-dreamcard-veil absolute inset-0 -z-10" aria-hidden />
      <div className="ms-dreamcard-head flex min-w-0 items-start justify-between gap-1">
        <button
          type="button"
          onClick={() => onFocus(row.layer)}
          aria-pressed={focus}
          aria-label={t('desktop.board.focusLayer', {
            layer: row.layer,
            name: t(`board.layerName.${row.layer}`),
          })}
          data-testid={`layer-focus-${row.layer}`}
          className="flex min-w-0 flex-col items-start text-left after:absolute after:inset-0 after:content-['']"
        >
          <span className="font-mono text-[10px] leading-none tracking-[.14em]">L{row.layer}</span>
          <span className="truncate font-heading text-[13px] leading-tight font-bold tracking-[.1em]">
            {t(`board.layerName.${row.layer}`)}
          </span>
        </button>
        <span
          className="flex shrink-0 items-center gap-1 font-mono text-[10px]"
          title={t('board.tower.heartLock', { n: row.heartLock })}
        >
          <Die value={row.heartLock} kind="lock" size={focus ? 22 : 18} />
        </span>
      </div>
      <div className="flex min-h-0 min-w-0 flex-wrap items-end gap-1">
        {row.vaults.map((v) => (
          <VaultThumb key={v.id} vault={v} onOpen={onOpenCard} />
        ))}
        {focus &&
          row.vaults.map((v) => (
            <span
              key={`${v.id}-label`}
              className="ms-dreamcard-tag flex min-w-0 items-center gap-1"
            >
              <Vault className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{vaultLabel(v, t)}</span>
            </span>
          ))}
        {row.nightmare && <NightmareTag nightmare={row.nightmare} onOpen={onOpenCard} />}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {row.occupants.map((o) => (
          <OccupantChip key={o.id} occupant={o} named={focus} />
        ))}
        {tag && (
          <span className="ms-dreamcard-flag ml-auto shrink-0 font-mono text-[9px] tracking-[.14em] whitespace-nowrap">
            {tag}
          </span>
        )}
      </div>
    </div>
  );
}
