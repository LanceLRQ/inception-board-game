// 梦境窥视派贿赂决策 banner（梦主端）
// 对照：docs/manual/04-action-cards.md §梦境窥视 解析
// "梦主先决定是否让该盗梦者抽取 1 张贿赂牌，然后该盗梦者再查看任意一层梦境的金库"

import { Coins } from 'lucide-react';
import { computeMasterPeekBribeState } from './logic.js';
import type { SetupState } from '@icgame/game-engine';

export interface MasterPeekBribeBannerProps {
  G: SetupState | null | undefined;
  viewerPlayerID: string;
  nicknameOf?: (playerID: string) => string;
  makeMove: (move: string, args: unknown[]) => Promise<void> | void;
}

export function MasterPeekBribeBanner({
  G,
  viewerPlayerID,
  nicknameOf,
  makeMove,
}: MasterPeekBribeBannerProps) {
  const { visible, peekerID, layer, inPoolCount } = computeMasterPeekBribeState(G, viewerPlayerID);
  if (!visible) return null;

  const peekerName = peekerID ? (nicknameOf?.(peekerID) ?? peekerID) : '盗梦者';

  return (
    <div
      role="alert"
      className="mt-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm shadow-sm"
    >
      <div className="flex items-start gap-2">
        <Coins className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
        <div className="flex-1 space-y-2">
          <div className="font-medium text-amber-900 dark:text-amber-200">
            {peekerName} 窥视第 {layer ?? '?'} 层 — 是否派发 1 张贿赂牌？
          </div>
          <div className="text-xs text-muted-foreground">
            贿赂池还有 {inPoolCount} 张可派；命中 DEAL 将使 {peekerName} 立即转为梦主阵营。
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void makeMove('masterPeekBribeDecision', [true])}
              className="rounded border border-amber-500 bg-amber-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-600"
            >
              派发贿赂
            </button>
            <button
              type="button"
              onClick={() => void makeMove('masterPeekBribeDecision', [false])}
              className="rounded border border-border bg-background px-2.5 py-1 text-xs hover:bg-accent"
            >
              跳过
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
