// MasterPanelCollapsible - 移动端 viewer=盗梦者 时顶部梦主专区折叠栏
// 对照：plans/design/06c-match-table-layout.md §2.2 / §5.5
//
// 收起：56px 高，显示激活世界观徽记 + 梦魇计数
// 展开：全屏 Drawer，内部挂 MasterConsole（mobile-drawer layout）

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { cn } from '../../../lib/utils.js';
import { MasterConsole } from '../shared/MasterConsole.js';
import type { MockMatchState } from '../../../hooks/useMockMatch.js';

export interface MasterPanelCollapsibleProps {
  state: MockMatchState;
  onOpenDetail?: (cardId: string) => void;
  className?: string;
}

export function MasterPanelCollapsible({
  state,
  onOpenDetail,
  className,
}: MasterPanelCollapsibleProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={cn(
          'flex h-14 w-full items-center justify-between gap-2 border-b border-red-500/30',
          'bg-gradient-to-r from-red-950/40 to-slate-950/60 px-3 text-xs text-red-200',
          className,
        )}
        data-testid="master-panel-collapsed"
        aria-label="展开梦主专区"
      >
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] text-red-300">
            梦主
          </span>
          <span>世界观：待加载</span>
          <span>梦魇：0/6</span>
        </div>
        <ChevronDown className="h-4 w-4" aria-hidden />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="fixed inset-0 z-40 bg-black/70 p-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setExpanded(false)}
            role="dialog"
            aria-modal="true"
            aria-label="梦主专区"
            data-testid="master-panel-expanded"
          >
            <motion.div
              initial={{ y: -40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -40, opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={(e) => e.stopPropagation()}
              className="relative"
            >
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="absolute right-2 top-2 z-10 rounded-full bg-black/60 p-1.5 text-white"
                aria-label="收起"
              >
                <X className="h-4 w-4" />
              </button>
              <MasterConsole state={state} layout="mobile-drawer" onOpenDetail={onOpenDetail} />
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="mt-2 flex w-full items-center justify-center gap-1 rounded-md bg-card py-2 text-xs text-muted-foreground"
              >
                <ChevronUp className="h-3 w-3" aria-hidden />
                收起
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
