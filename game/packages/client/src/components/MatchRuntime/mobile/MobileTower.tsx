// 层塔：第 4 层在上、第 1 层在下，最下是迷失层（L0）
// 非焦点层压成单行；焦点层展开（多一行说明、金库缩略图可点开详情）；手牌坞展开时只留焦点层。
// 平板（≥768px）上字号与骰子放大，占位者不再截短，非焦点层也带出金库状态；内容区限宽居中。
// 底部一行最新动态。梦主视角下，视图里多给的信息（未翻开的梦魇、未开金库的内容）如实显示。

import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ChevronRight, Crown, Skull, TriangleAlert, Vault } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { getCardImageUrl } from '../../../lib/cardImages';
import { getCardName } from '../../../lib/cards';
import { Die } from '../../Die';
import type {
  BoardModel,
  BoardNightmare,
  BoardOccupant,
  BoardLayer,
  BoardVault,
} from '../model/boardModel';
import { visibleBoardLayers } from '../model/boardModel';
import type { MobileMode } from '../viewportMode';

/** 心锁骰的边长（像素）：[非焦点层, 焦点层]，平板放大 */
export function heartLockDieSizes(mode: MobileMode): readonly [number, number] {
  return mode === 'tablet' ? [24, 30] : [16, 20];
}

interface MobileTowerProps {
  readonly board: BoardModel;
  readonly dockOpen: boolean;
  readonly mode: MobileMode;
  /** 打开金库详情（金库牌卡面编号） */
  readonly onOpenVault: (face: string) => void;
}

function Occupants({ occupants }: { occupants: readonly BoardOccupant[] }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 gap-1 overflow-hidden tablet:flex-wrap tablet:gap-1.5">
      {occupants.map((o) => (
        <span
          key={o.id}
          data-testid={`occupant-${o.id}`}
          className={cn(
            'flex max-w-20 items-center gap-0.5 border bg-panel px-1.5 py-0.5 text-[9px] whitespace-nowrap tablet:max-w-40 tablet:px-2 tablet:py-1 tablet:text-[12px]',
            o.isSelf ? 'border-acc text-foreground' : 'border-line-strong text-dim',
          )}
        >
          {o.isMaster && (
            <Crown className="size-2.5 shrink-0 text-acc-bright tablet:size-3.5" aria-hidden />
          )}
          <span className="truncate">{o.isSelf ? t('seat.me') : o.name}</span>
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
  vault: BoardVault;
  large?: boolean;
  onOpen: (face: string) => void;
}) {
  const { t } = useTranslation();
  const label = vault.opened
    ? t('board.tower.vaultOpened', {
        content: t(`board.tower.vaultContent.${vault.contentType}`),
      })
    : t('board.tower.vaultClosed');
  const url = getCardImageUrl(vault.face);
  return (
    <button
      type="button"
      onClick={() => onOpen(vault.face)}
      aria-label={`${t('board.tower.openVault')}：${label}`}
      title={label}
      data-testid={`vault-thumb-${vault.id}`}
      className={cn(
        // 命中区靠伪元素扩到 44×44：缩略图本身只有 20×27 / 32×44
        "relative shrink-0 touch-manipulation border border-line-strong bg-panel after:absolute after:content-['']",
        large
          ? 'h-11 w-8 tablet:h-16 tablet:w-12 after:-inset-x-[7px] after:-inset-y-px'
          : 'h-[27px] w-5 tablet:h-10 tablet:w-7 after:-inset-x-[13px] after:-inset-y-[10px] tablet:after:-inset-x-[10px] tablet:after:-inset-y-[3px]',
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

/** 金库的状态文案：已开 = 内容；焦点层里梦主视角还能看到未开金库的内容 */
function vaultStateText(vault: BoardVault, t: TFunction, masterKnows = false): string {
  if (vault.opened) {
    return t('board.tower.vaultOpened', {
      content: t(`board.tower.vaultContent.${vault.contentType}`),
    });
  }
  if (masterKnows && vault.contentType !== 'hidden') {
    return t('board.tower.vaultMasterKnows', {
      content: t(`board.tower.vaultContent.${vault.contentType}`),
    });
  }
  return t('board.tower.vaultClosed');
}

function NightmareTag({ nightmare }: { nightmare: BoardNightmare }) {
  const { t } = useTranslation();
  const name = nightmare.cardId ? getCardName(nightmare.cardId) : null;
  const text = nightmare.revealed
    ? name
      ? t('board.tower.nightmareNamed', { name })
      : t('board.tower.nightmareRevealed')
    : t('board.tower.nightmareReady');
  return (
    <span
      data-testid="nightmare-tag"
      className={cn(
        'flex items-center gap-0.5 border px-[5px] py-0.5 font-mono text-[8px] tracking-[.1em] whitespace-nowrap text-blood border-blood tablet:px-2 tablet:py-1 tablet:text-[11px]',
        nightmare.revealed ? 'border-solid' : 'border-dashed',
      )}
    >
      <TriangleAlert className="size-2 shrink-0 tablet:size-3" aria-hidden />
      <span className="max-w-24 truncate tablet:max-w-48">{text}</span>
    </span>
  );
}

function HeartLock({ value, size }: { value: number; size: number }) {
  return (
    <span className="flex shrink-0 items-center gap-1 font-mono text-[9.5px] tracking-[.05em] text-lock tablet:gap-1.5 tablet:text-[13px]">
      <Die value={value} kind="lock" size={size} />
      {value}
    </span>
  );
}

function CompactSlab({
  row,
  dieSize,
  onOpenVault,
}: {
  row: BoardLayer;
  dieSize: number;
  onOpenVault: (face: string) => void;
}) {
  const { t } = useTranslation();
  const isLost = row.layer === 0;
  return (
    <div
      data-testid={`layer-row-${row.layer}`}
      data-layer={row.layer}
      data-viewer-layer={row.hasViewer || undefined}
      className={cn(
        'flex min-h-[34px] flex-[1_0_auto] items-center gap-2 border border-l-[3px] border-line border-l-grade px-2.5 py-[5px] short-land:min-h-[30px] short-land:py-[3px] tablet:min-h-[52px] tablet:gap-3 tablet:px-4 tablet:py-2',
        isLost
          ? 'min-h-7 flex-[0_0_28px] border-dashed bg-transparent tablet:min-h-9 tablet:flex-[0_0_36px]'
          : 'bg-panel',
      )}
    >
      <span className="w-5 shrink-0 font-mono text-[9.5px] font-semibold tracking-[.08em] text-acc tablet:w-7 tablet:text-xs">
        L{row.layer}
      </span>
      <span className="w-11 shrink-0 font-heading text-[11px] font-semibold tracking-[.1em] whitespace-nowrap tablet:w-16 tablet:text-sm">
        {t(`board.layerName.${row.layer}`)}
      </span>
      {isLost ? (
        <span className="min-w-0 truncate font-mono text-[9px] tracking-[.06em] text-faint tablet:text-[11px]">
          {row.occupants.length > 0 ? t('board.tower.lostHere') : t('board.tower.lostEmpty')}
        </span>
      ) : (
        <>
          <HeartLock value={row.heartLock} size={dieSize} />
          {/* 命中区扩到 44px 后相邻金库缩略图要隔开，免得互相盖住 */}
          <span className={cn('flex items-center', row.vaults.length > 1 ? 'gap-6' : 'gap-2')}>
            {row.vaults.map((v) => (
              <span key={v.id} className="flex items-center gap-2">
                <VaultMark vault={v} onOpen={onOpenVault} />
                <span className="hidden font-mono text-[11px] tracking-[.05em] text-dim tablet:inline">
                  {vaultStateText(v, t)}
                </span>
              </span>
            ))}
          </span>
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
  dieSize,
  onOpenVault,
}: {
  row: BoardLayer;
  dockOpen: boolean;
  dieSize: number;
  onOpenVault: (face: string) => void;
}) {
  const { t } = useTranslation();
  const isLost = row.layer === 0;
  const tag = row.unlocking
    ? t('board.tower.unlocking')
    : row.hasViewer
      ? t('board.tower.herePlayer')
      : null;
  return (
    <div
      data-testid={`layer-row-${row.layer}`}
      data-layer={row.layer}
      data-focus="true"
      data-viewer-layer={row.hasViewer || undefined}
      className={cn(
        'flex min-h-28 flex-col justify-center gap-[9px] border border-l-[3px] border-acc border-l-grade bg-panel px-3 py-[9px] short-land:gap-1 short-land:py-1.5 shadow-[0_10px_28px_-12px_color-mix(in_srgb,var(--ms-bg)_80%,transparent)] tablet:min-h-40 tablet:gap-3 tablet:px-5 tablet:py-4 [@media(max-height:640px)]:min-h-0',
        dockOpen ? 'flex-[1_1_auto]' : 'flex-[2.3_0_auto]',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-mono text-[9.5px] font-semibold tracking-[.08em] text-acc tablet:text-xs">
          L{row.layer}
        </span>
        <span className="min-w-0 flex-1 truncate font-heading text-[11px] font-semibold tracking-[.1em] tablet:text-base">
          {t(`board.layerName.${row.layer}`)} · {t('board.tower.focusTag')}
        </span>
        {tag && (
          <span className="shrink-0 border border-acc px-[7px] py-[3px] font-mono text-[8.5px] tracking-[.14em] whitespace-nowrap text-acc-bright tablet:px-2.5 tablet:py-1 tablet:text-[11px]">
            {tag}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2.5 tablet:gap-4">
        {isLost ? (
          <Skull className="size-5 text-dim tablet:size-7" aria-hidden />
        ) : (
          <HeartLock value={row.heartLock} size={dieSize} />
        )}
        {row.vaults.map((v) => (
          <span key={v.id} className="flex items-center gap-1.5">
            <VaultMark vault={v} large onOpen={onOpenVault} />
            <span className="font-mono text-[9px] tracking-[.05em] text-dim tablet:text-xs">
              {vaultStateText(v, t, true)}
            </span>
          </span>
        ))}
        {row.nightmare && <NightmareTag nightmare={row.nightmare} />}
        <Occupants occupants={row.occupants} />
      </div>
      <p className="truncate font-mono text-[9px] tracking-[.05em] text-dim tablet:text-xs">
        {t(row.note.key, row.note.params)}
      </p>
    </div>
  );
}

export function MobileTower({ board, dockOpen, mode, onOpenVault }: MobileTowerProps) {
  const { t } = useTranslation();
  const { activity, focusLayer } = board;
  const [slabDie, focusDie] = heartLockDieSizes(mode);
  return (
    <div
      aria-label={t('board.tower.aria')}
      data-testid="layer-tower"
      className="flex min-w-0 flex-1 flex-col gap-[7px] overflow-y-auto px-3 pb-2 pt-[9px] [scrollbar-width:none] tablet:gap-3 tablet:px-5 tablet:pb-4 tablet:pt-4 short-land:gap-1.5 short-land:py-1.5 [&::-webkit-scrollbar]:hidden"
    >
      {visibleBoardLayers(board.layers, focusLayer, dockOpen).map((row) =>
        row.layer !== focusLayer ? (
          <CompactSlab key={row.layer} row={row} dieSize={slabDie} onOpenVault={onOpenVault} />
        ) : (
          <FocusSlab
            key={row.layer}
            row={row}
            dockOpen={dockOpen}
            dieSize={focusDie}
            onOpenVault={onOpenVault}
          />
        ),
      )}
      {!dockOpen && activity && (
        <p
          className="flex shrink-0 items-center gap-[7px] px-0.5 py-px font-mono text-[9px] tracking-[.05em] text-faint tablet:text-[11px]"
          data-testid="latest-activity"
          aria-label={t('board.activity.aria')}
        >
          <ChevronRight className="size-2.5 shrink-0 text-dim" aria-hidden />
          <span className="truncate">{t(`board.activity.${activity.kind}`, activity.params)}</span>
        </p>
      )}
    </div>
  );
}
