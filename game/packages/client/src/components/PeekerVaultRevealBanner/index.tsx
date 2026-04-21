// 盗梦者金库查看 banner（peeker 端）
// 对照：docs/manual/04-action-cards.md §梦境窥视 效果①
// "你查看任意一层梦境的金库，且不得公布你看到的结果"
//
// 依赖 engine playerView 已将 peekerID 视角下 vaultLayer 对应 vault 透传 contentType

import { Eye, KeyRound, Coins, HelpCircle } from 'lucide-react';
import { computePeekerVaultRevealState } from './logic.js';
import type { SetupState } from '@icgame/game-engine';

export interface PeekerVaultRevealBannerProps {
  G: SetupState | null | undefined;
  viewerPlayerID: string;
  makeMove: (move: string, args: unknown[]) => Promise<void> | void;
}

function vaultIcon(contentType: string) {
  if (contentType === 'secret') return <KeyRound className="h-4 w-4 text-red-500" />;
  if (contentType === 'coin') return <Coins className="h-4 w-4 text-amber-500" />;
  if (contentType === 'empty') return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
  return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
}

function vaultLabel(contentType: string): string {
  if (contentType === 'secret') return '秘密（梦境核心）';
  if (contentType === 'coin') return '金币（普通金库）';
  if (contentType === 'empty') return '空（无内容）';
  if (contentType === 'hidden') return '未授权 — 请联系开发者（UI 故障）';
  return contentType;
}

export function PeekerVaultRevealBanner({
  G,
  viewerPlayerID,
  makeMove,
}: PeekerVaultRevealBannerProps) {
  const { visible, layer, vaults } = computePeekerVaultRevealState(G, viewerPlayerID);
  if (!visible) return null;

  return (
    <div
      role="alert"
      className="mt-3 rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm shadow-sm"
    >
      <div className="flex items-start gap-2">
        <Eye className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
        <div className="flex-1 space-y-2">
          <div className="font-medium text-emerald-900 dark:text-emerald-200">
            第 {layer ?? '?'} 层金库内容（仅你可见）
          </div>
          <div className="space-y-1.5">
            {vaults.length === 0 ? (
              <div className="text-xs text-muted-foreground">该层无金库。</div>
            ) : (
              vaults.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-2 rounded bg-background/60 px-2 py-1.5"
                >
                  {vaultIcon(v.contentType)}
                  <span className="text-xs">
                    {vaultLabel(v.contentType)}
                    {v.isOpened && ' · 已开启'}
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            规则：不得公布你看到的结果（社交约束，引擎不强制）。
          </div>
          <div>
            <button
              type="button"
              onClick={() => void makeMove('peekerAcknowledge', [])}
              className="rounded border border-emerald-500 bg-emerald-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-600"
            >
              已确认
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
