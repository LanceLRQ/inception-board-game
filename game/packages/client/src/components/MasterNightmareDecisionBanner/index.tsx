// 梦主梦魇决策提示 Banner
// 对照：docs/manual/03-game-flow.md 第 94-102 行
// 触发：盗梦者打开金币金库 → 同层有未翻开梦魇 → 梦主 3 选 1 决策
//
// Banner 策略：
//   - 仅在梦主回合 + action 阶段 + 有待决策层时显示
//   - 直接内嵌 3 个决策按钮，避免梦主去技能面板里翻找
//   - 弃掉（不发动）+ 翻开梦魇 + 弃掉（派发贿赂流程单独走贿赂面板）
//   - 多层待决策时，按钮按层分组展示

import { AlertTriangle } from 'lucide-react';
import { computeNightmareDecisionState } from './logic.js';
import type { SetupState } from '@icgame/game-engine';

export interface MasterNightmareDecisionBannerProps {
  /** 当前游戏状态 */
  G: SetupState | null | undefined;
  /** 当前行动玩家 ID（ctx.currentPlayer） */
  currentPlayerID: string;
  /** 梦主玩家 ID（G.dreamMasterID） */
  dreamMasterID: string;
  /** 统一 makeMove 适配（外部注入） */
  makeMove: (move: string, args: unknown[]) => Promise<void> | void;
}

export function MasterNightmareDecisionBanner({
  G,
  currentPlayerID,
  dreamMasterID,
  makeMove,
}: MasterNightmareDecisionBannerProps) {
  const { visible, pendingLayers } = computeNightmareDecisionState(
    G,
    currentPlayerID,
    dreamMasterID,
  );
  if (!visible) return null;

  return (
    <div
      role="alert"
      className="mt-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm shadow-sm"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
        <div className="flex-1 space-y-2">
          <div className="font-medium text-amber-900 dark:text-amber-200">
            梦魇决策：盗梦者已打开金币金库，请在以下层选择处理方式
          </div>
          <div className="space-y-1.5">
            {pendingLayers.map((layer) => (
              <div
                key={layer}
                className="flex flex-wrap items-center gap-2 rounded bg-background/60 px-2 py-1.5"
              >
                <span className="text-xs font-medium text-muted-foreground">第 {layer} 层：</span>
                <button
                  type="button"
                  onClick={() => void makeMove('masterRevealNightmare', [layer])}
                  className="rounded border border-border bg-background px-2 py-1 text-xs hover:bg-accent"
                >
                  翻开梦魇
                </button>
                <button
                  type="button"
                  onClick={() => void makeMove('masterDiscardHiddenNightmare', [layer])}
                  className="rounded border border-border bg-background px-2 py-1 text-xs hover:bg-accent"
                >
                  弃掉（不发动）
                </button>
                <span className="text-[11px] text-muted-foreground">
                  （派发贿赂请从贿赂面板操作）
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
