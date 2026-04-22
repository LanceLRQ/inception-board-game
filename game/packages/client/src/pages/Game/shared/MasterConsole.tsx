// MasterConsole - 梦主专属控制台（世界观 / 梦魇 / 贿赂池）
// 对照：plans/design/06c-match-table-layout.md §5.5
//
// 两种布局：
//   pc-sidebar：PC 右侧固定 panel（宽 280-320px）
//   mobile-drawer：移动端顶部折叠栏 → 展开为全屏 Drawer
//
// Phase 3 阶段以占位为主，实际接入世界观/梦魇状态留待 Phase 4。

import { cn } from '../../../lib/utils.js';
import { ScrollText, Sparkles, Coins } from 'lucide-react';
import type { MockMatchState } from '../../../hooks/useMockMatch.js';

export interface MasterConsoleProps {
  state: MockMatchState;
  layout: 'pc-sidebar' | 'mobile-drawer';
  /** 长按查看某卡详情（世界观/梦魇卡） */
  onOpenDetail?: (cardId: string) => void;
  className?: string;
}

export function MasterConsole({
  state: _state,
  layout,
  onOpenDetail: _onOpenDetail,
  className,
}: MasterConsoleProps) {
  return (
    <aside
      className={cn(
        'flex flex-col gap-3 rounded-2xl border-2 border-red-500/30 bg-gradient-to-b from-red-950/40 to-slate-950/60 p-4 shadow-lg',
        layout === 'pc-sidebar' && 'w-[300px] shrink-0',
        layout === 'mobile-drawer' && 'w-full',
        className,
      )}
      data-testid="master-console"
      data-layout={layout}
      aria-label="梦主控制台"
    >
      <div className="flex items-center gap-2 border-b border-red-500/30 pb-2">
        <Sparkles className="h-4 w-4 text-red-400" aria-hidden />
        <h3 className="text-sm font-semibold text-red-300">梦主控制台</h3>
      </div>

      {/* 世界观 */}
      <section>
        <div className="mb-1 flex items-center gap-1 text-xs text-red-300">
          <ScrollText className="h-3 w-3" aria-hidden />
          激活的世界观
        </div>
        <div className="rounded border border-red-500/20 bg-slate-900/60 p-2 text-[11px] text-muted-foreground">
          （Phase 4 接入真实世界观卡牌效果）
        </div>
      </section>

      {/* 梦魇 */}
      <section>
        <div className="mb-1 flex items-center gap-1 text-xs text-red-300">
          <Sparkles className="h-3 w-3" aria-hidden />
          梦魇库存 <span className="text-[10px] text-muted-foreground">0 / 6</span>
        </div>
        <div className="rounded border border-red-500/20 bg-slate-900/60 p-2 text-[11px] text-muted-foreground">
          （Phase 3 接入 6 张梦魇牌触发界面）
        </div>
      </section>

      {/* 贿赂池 */}
      <section>
        <div className="mb-1 flex items-center gap-1 text-xs text-red-300">
          <Coins className="h-3 w-3" aria-hidden />
          贿赂池
        </div>
        <div className="rounded border border-red-500/20 bg-slate-900/60 p-2 text-[11px] text-muted-foreground">
          （Phase 4 接入贿赂系统）
        </div>
      </section>
    </aside>
  );
}
