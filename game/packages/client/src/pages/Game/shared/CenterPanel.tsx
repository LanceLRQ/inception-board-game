// CenterPanel - 桌面中央共享区域（金库 + 心锁 + 焦点层 + 响应窗口入口）
// 对照：plans/design/06c-match-table-layout.md §5（供 TableStage / MatchTrack 共用）

import { HeartLockIndicator } from '../../../components/HeartLockIndicator/index.js';
import { LayerBadge } from '../../../components/LayerBadge/index.js';
import { cn } from '../../../lib/utils.js';
import type { MockMatchState } from '../../../hooks/useMockMatch.js';

export interface CenterPanelProps {
  state: MockMatchState;
  /** 焦点层：盗梦者视角通常是 viewer.currentLayer；梦主可切换 */
  focusLayer: number;
  /** 点击金库（尚未接入；占位回调） */
  onOpenVault?: (vaultId: string) => void;
  className?: string;
}

export function CenterPanel({ state, focusLayer, onOpenVault, className }: CenterPanelProps) {
  const layerState = state.layers[focusLayer];
  const vaultsHere = state.vaults.filter((v) => v.layer === focusLayer);
  const playersHere = layerState?.playersInLayer ?? [];

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border-2 border-indigo-500/40',
        'bg-gradient-to-br from-indigo-900/60 to-slate-900/80 p-4 shadow-xl',
        className,
      )}
      data-testid="center-panel"
    >
      {/* 层号 + 心锁 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayerBadge layer={focusLayer} size="lg" />
          <div className="flex flex-col">
            <span className="text-xs text-indigo-300">焦点层</span>
            <span className="text-xs text-muted-foreground">
              {layerState?.nightmareRevealed ? '梦魇已揭露' : '梦境平稳'}
            </span>
          </div>
        </div>
        <HeartLockIndicator
          count={layerState?.heartLockValue ?? 0}
          max={Math.max(layerState?.heartLockValue ?? 0, 5)}
        />
      </div>

      {/* 同层玩家 */}
      {playersHere.length > 0 && (
        <div className="flex flex-wrap gap-1 text-[10px]">
          <span className="text-muted-foreground">同层：</span>
          {playersHere.map((pid) => (
            <span key={pid} className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-indigo-200">
              {state.players[pid]?.nickname ?? pid}
            </span>
          ))}
        </div>
      )}

      {/* 金库 */}
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[10px] text-muted-foreground">金库：</span>
        {vaultsHere.length === 0 ? (
          <span className="text-[10px] text-muted-foreground">（本层无金库）</span>
        ) : (
          vaultsHere.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onOpenVault?.(v.id)}
              className={cn(
                'rounded border px-1.5 py-0.5 text-[10px]',
                v.isOpened
                  ? v.contentType === 'secret'
                    ? 'border-purple-500 bg-purple-500/20 text-purple-200'
                    : v.contentType === 'coin'
                      ? 'border-amber-500 bg-amber-500/20 text-amber-200'
                      : 'border-slate-500 bg-slate-700 text-slate-300'
                  : 'border-slate-600 bg-slate-800 text-slate-400',
              )}
            >
              {v.isOpened ? v.contentType : '???'}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
