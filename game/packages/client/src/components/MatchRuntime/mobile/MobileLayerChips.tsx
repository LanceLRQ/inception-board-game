// 层级标签：L0–L4 一排，显示心锁值与金库是否已开；点按切换焦点层
// 可见高度 26px，用伪元素把热区扩到 44px；当前焦点用边框 + 下划线 + aria-pressed 多重表达。

import { useTranslation } from 'react-i18next';
import { Lock, PackageOpen } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { LayerChip } from './towerModel';

interface MobileLayerChipsProps {
  readonly chips: readonly LayerChip[];
  readonly focusLayer: number;
  readonly onFocus: (layer: number) => void;
}

export function MobileLayerChips({ chips, focusLayer, onFocus }: MobileLayerChipsProps) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t('mobile.chips.aria')}
      className="flex shrink-0 gap-1.5 px-3 py-[9px]"
      data-testid="layer-chips"
    >
      {chips.map((chip) => {
        const active = chip.layer === focusLayer;
        return (
          <button
            key={chip.layer}
            type="button"
            aria-pressed={active}
            aria-label={t('mobile.chips.chip', { layer: chip.layer, lock: chip.heartLock })}
            onClick={() => onFocus(chip.layer)}
            data-testid={`layer-chip-${chip.layer}`}
            className={cn(
              "relative flex h-[26px] min-w-0 flex-1 touch-manipulation items-center justify-center gap-[3px] overflow-hidden border px-1 font-mono text-[10px] tracking-[.04em] whitespace-nowrap after:absolute after:-inset-[9px] after:content-['']",
              active ? 'border-acc bg-acc-soft text-acc-bright' : 'border-line bg-panel text-dim',
            )}
          >
            <span>L{chip.layer}</span>
            {chip.layer > 0 && (
              <span className="flex items-center gap-px text-lock">
                <Lock className="size-2.5" aria-hidden />
                {chip.heartLock}
              </span>
            )}
            {chip.anyVaultOpened && (
              <PackageOpen className="size-2.5 text-acc-bright" aria-hidden />
            )}
            {active && <span className="absolute inset-x-1 bottom-0 h-0.5 bg-acc-bright" />}
          </button>
        );
      })}
    </nav>
  );
}
