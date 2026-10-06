// 层塔：第 4 层在上、第 1 层在下，最下是迷失层（L0）
// 非焦点层压成单行；焦点层展开（多一行说明、金库缩略图可点开详情）；手牌坞展开时只留焦点层。
// 底部一行最新动态。梦主视角下，视图里多给的信息（未翻开的梦魇、未开金库的内容）如实显示。

import { useTranslation } from 'react-i18next';
import { ChevronRight, Crown, Skull, TriangleAlert, Vault } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { getCardImageUrl } from '../../../lib/cardImages';
import { getCardName } from '../../../lib/cards';
import { LockDie } from './LockDie';
import type { TowerNightmare, TowerOccupant, TowerRow, TowerVault } from './towerModel';
import { deriveFocusNote } from './towerModel';
import type { Activity } from './latestActivity';

interface MobileTowerProps {
  readonly rows: readonly TowerRow[];
  readonly focusLayer: number;
  readonly dockOpen: boolean;
  readonly activity: Activity | null;
  readonly pendingUnlock: { playerID: string; layer: number } | null;
  readonly nicknameOf: (playerID: string) => string;
  /** 打开金库详情（金库牌卡面编号） */
  readonly onOpenVault: (face: string) => void;
}

function Occupants({ occupants }: { occupants: readonly TowerOccupant[] }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 gap-1 overflow-hidden">
      {occupants.map((o) => (
        <span
          key={o.id}
          data-testid={`occupant-${o.id}`}
          className={cn(
            'flex max-w-20 items-center gap-0.5 border bg-panel px-1.5 py-0.5 text-[9px] whitespace-nowrap',
            o.isSelf ? 'border-acc text-foreground' : 'border-line-strong text-dim',
          )}
        >
          {o.isMaster && <Crown className="size-2.5 shrink-0 text-acc-bright" aria-hidden />}
          <span className="truncate">{o.isSelf ? t('mobile.rail.me') : o.name}</span>
        </span>
      ))}
    </div>
  );
}

/** 金库：已开 / 看得到内容的显示卡面缩略图（可点开详情），其余显示金库图标 */
function VaultMark({
  vault,
  large,
  onOpen,
}: {
  vault: TowerVault;
  large?: boolean;
  onOpen: (face: string) => void;
}) {
  const { t } = useTranslation();
  const label = vault.opened
    ? t('mobile.tower.vaultOpened', {
        content: t(`mobile.tower.vaultContent.${vault.contentType}`),
      })
    : t('mobile.tower.vaultClosed');
  const url = getCardImageUrl(vault.face);
  return (
    <button
      type="button"
      onClick={() => onOpen(vault.face)}
      aria-label={`${t('mobile.tower.openVault')}：${label}`}
      title={label}
      data-testid={`vault-thumb-${vault.id}`}
      className={cn(
        "relative shrink-0 touch-manipulation overflow-hidden border border-line-strong bg-panel after:absolute after:-inset-2 after:content-['']",
        large ? 'h-11 w-8' : 'h-[27px] w-5',
      )}
    >
      {url ? (
        <img src={url} alt="" draggable={false} className="size-full object-cover" />
      ) : (
        <Vault className="m-auto size-3 text-dim" aria-hidden />
      )}
    </button>
  );
}

function NightmareTag({ nightmare }: { nightmare: TowerNightmare }) {
  const { t } = useTranslation();
  const name = nightmare.cardId ? getCardName(nightmare.cardId) : null;
  const text = nightmare.revealed
    ? name
      ? t('mobile.tower.nightmareNamed', { name })
      : t('mobile.tower.nightmareRevealed')
    : t('mobile.tower.nightmareReady');
  return (
    <span
      data-testid="nightmare-tag"
      className={cn(
        'flex items-center gap-0.5 border px-[5px] py-0.5 font-mono text-[8px] tracking-[.1em] whitespace-nowrap text-blood border-blood',
        nightmare.revealed ? 'border-solid' : 'border-dashed',
      )}
    >
      <TriangleAlert className="size-2 shrink-0" aria-hidden />
      <span className="max-w-24 truncate">{text}</span>
    </span>
  );
}

function HeartLock({ value, size }: { value: number; size: number }) {
  return (
    <span className="flex shrink-0 items-center gap-1 font-mono text-[9.5px] tracking-[.05em] text-lock">
      <LockDie value={value} size={size} />
      {value}
    </span>
  );
}

function CompactSlab({ row, onOpenVault }: { row: TowerRow; onOpenVault: (face: string) => void }) {
  const { t } = useTranslation();
  const isLost = row.layer === 0;
  return (
    <div
      data-testid={`layer-row-${row.layer}`}
      data-viewer-layer={row.hasViewer || undefined}
      className={cn(
        'flex min-h-[34px] flex-[1_0_auto] items-center gap-2 border border-l-[3px] border-line border-l-grade px-2.5 py-[5px]',
        isLost ? 'min-h-7 flex-[0_0_28px] border-dashed bg-transparent' : 'bg-panel',
      )}
    >
      <span className="w-5 shrink-0 font-mono text-[9.5px] font-semibold tracking-[.08em] text-acc">
        L{row.layer}
      </span>
      <span className="w-11 shrink-0 font-heading text-[11px] font-semibold tracking-[.1em] whitespace-nowrap">
        {t(`mobile.layerName.${row.layer}`)}
      </span>
      {isLost ? (
        <span className="min-w-0 truncate font-mono text-[9px] tracking-[.06em] text-faint">
          {row.occupants.length > 0 ? t('mobile.tower.lostHere') : t('mobile.tower.lostEmpty')}
        </span>
      ) : (
        <>
          <HeartLock value={row.heartLock} size={16} />
          {row.vaults.map((v) => (
            <VaultMark key={v.id} vault={v} onOpen={onOpenVault} />
          ))}
          {row.nightmare && <NightmareTag nightmare={row.nightmare} />}
        </>
      )}
      <div className="ml-auto flex min-w-0 overflow-hidden">
        <Occupants occupants={row.occupants} />
      </div>
    </div>
  );
}

function FocusSlab({
  row,
  dockOpen,
  note,
  unlocking,
  onOpenVault,
}: {
  row: TowerRow;
  dockOpen: boolean;
  note: string;
  unlocking: boolean;
  onOpenVault: (face: string) => void;
}) {
  const { t } = useTranslation();
  const isLost = row.layer === 0;
  const tag = unlocking
    ? t('mobile.tower.unlocking')
    : row.hasViewer
      ? t('mobile.tower.herePlayer')
      : null;
  return (
    <div
      data-testid={`layer-row-${row.layer}`}
      data-focus="true"
      data-viewer-layer={row.hasViewer || undefined}
      className={cn(
        'flex min-h-28 flex-col justify-center gap-[9px] border border-l-[3px] border-acc border-l-grade bg-panel px-3 py-[9px] shadow-[0_10px_28px_-12px_color-mix(in_srgb,var(--ms-bg)_80%,transparent)] [@media(max-height:640px)]:min-h-0',
        dockOpen ? 'flex-[1_1_auto]' : 'flex-[2.3_0_auto]',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-mono text-[9.5px] font-semibold tracking-[.08em] text-acc">
          L{row.layer}
        </span>
        <span className="min-w-0 flex-1 truncate font-heading text-[11px] font-semibold tracking-[.1em]">
          {t(`mobile.layerName.${row.layer}`)} · {t('mobile.tower.focusTag')}
        </span>
        {tag && (
          <span className="shrink-0 border border-acc px-[7px] py-[3px] font-mono text-[8.5px] tracking-[.14em] whitespace-nowrap text-acc-bright">
            {tag}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        {isLost ? (
          <Skull className="size-5 text-dim" aria-hidden />
        ) : (
          <HeartLock value={row.heartLock} size={20} />
        )}
        {row.vaults.map((v) => (
          <span key={v.id} className="flex items-center gap-1.5">
            <VaultMark vault={v} large onOpen={onOpenVault} />
            <span className="font-mono text-[9px] tracking-[.05em] text-dim">
              {v.opened
                ? t('mobile.tower.vaultOpened', {
                    content: t(`mobile.tower.vaultContent.${v.contentType}`),
                  })
                : v.contentType !== 'hidden'
                  ? t('mobile.tower.vaultMasterKnows', {
                      content: t(`mobile.tower.vaultContent.${v.contentType}`),
                    })
                  : t('mobile.tower.vaultClosed')}
            </span>
          </span>
        ))}
        {row.nightmare && <NightmareTag nightmare={row.nightmare} />}
        <Occupants occupants={row.occupants} />
      </div>
      <p className="truncate font-mono text-[9px] tracking-[.05em] text-dim">{note}</p>
    </div>
  );
}

export function MobileTower({
  rows,
  focusLayer,
  dockOpen,
  activity,
  pendingUnlock,
  nicknameOf,
  onOpenVault,
}: MobileTowerProps) {
  const { t } = useTranslation();
  return (
    <div
      aria-label={t('mobile.tower.aria')}
      data-testid="layer-tower"
      className="flex min-w-0 flex-1 flex-col gap-[7px] overflow-y-auto px-3 pb-2 pt-[9px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {rows.map((row) => {
        if (row.layer !== focusLayer) {
          return <CompactSlab key={row.layer} row={row} onOpenVault={onOpenVault} />;
        }
        const note = deriveFocusNote(row, pendingUnlock, nicknameOf);
        return (
          <FocusSlab
            key={row.layer}
            row={row}
            dockOpen={dockOpen}
            note={t(note.key, note.params)}
            unlocking={!!pendingUnlock && pendingUnlock.layer === row.layer}
            onOpenVault={onOpenVault}
          />
        );
      })}
      {!dockOpen && activity && (
        <p
          className="flex shrink-0 items-center gap-[7px] px-0.5 py-px font-mono text-[9px] tracking-[.05em] text-faint"
          data-testid="latest-activity"
          aria-label={t('mobile.activity.aria')}
        >
          <ChevronRight className="size-2.5 shrink-0 text-dim" aria-hidden />
          <span className="truncate">{t(`mobile.activity.${activity.kind}`, activity.params)}</span>
        </p>
      )}
    </div>
  );
}
