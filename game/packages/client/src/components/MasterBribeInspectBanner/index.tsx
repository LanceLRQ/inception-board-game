// 梦主查看盗梦者贿赂牌 banner（梦主端 · 效果②）
// 对照：docs/manual/04-action-cards.md §梦境窥视 效果②
// "仅梦主使用，查看一名盗梦者的所有贿赂牌。"

import { Eye, Handshake, ShieldX, HelpCircle } from 'lucide-react';
import { computeMasterBribeInspectState } from './logic.js';
import type { SetupState } from '@icgame/game-engine';

export interface MasterBribeInspectBannerProps {
  G: SetupState | null | undefined;
  viewerPlayerID: string;
  makeMove: (move: string, args: unknown[]) => Promise<void> | void;
}

function bribeIcon(status: string) {
  if (status === 'deal') return <Handshake className="h-4 w-4 text-rose-500" />;
  if (status === 'dealt') return <ShieldX className="h-4 w-4 text-slate-500" />;
  return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
}

function bribeLabel(status: string): string {
  if (status === 'deal') return 'DEAL · 成交（该盗梦者已转阵营）';
  if (status === 'dealt') return '碎裂 · 未成交';
  return status;
}

export function MasterBribeInspectBanner({
  G,
  viewerPlayerID,
  makeMove,
}: MasterBribeInspectBannerProps) {
  const { visible, targetThiefID, bribes } = computeMasterBribeInspectState(G, viewerPlayerID);
  if (!visible) return null;

  return (
    <div
      role="alert"
      className="mt-3 rounded-lg border border-rose-500/50 bg-rose-500/10 p-3 text-sm shadow-sm"
    >
      <div className="flex items-start gap-2">
        <Eye className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />
        <div className="flex-1 space-y-2">
          <div className="font-medium text-rose-900 dark:text-rose-200">
            查看盗梦者 {targetThiefID ?? '?'} 的全部贿赂牌（仅你可见）
          </div>
          <div className="space-y-1.5">
            {bribes.length === 0 ? (
              <div className="text-xs text-muted-foreground">该盗梦者未持有贿赂牌。</div>
            ) : (
              bribes.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-2 rounded bg-background/60 px-2 py-1.5"
                >
                  {bribeIcon(b.status)}
                  <span className="text-xs">{bribeLabel(b.status)}</span>
                </div>
              ))
            )}
          </div>
          <div>
            <button
              type="button"
              onClick={() => void makeMove('peekerAcknowledge', [])}
              className="rounded border border-rose-500 bg-rose-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-600"
            >
              已确认
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
