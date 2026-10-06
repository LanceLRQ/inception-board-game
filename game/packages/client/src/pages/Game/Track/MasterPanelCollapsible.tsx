// MasterPanelCollapsible - 移动端 viewer=盗梦者 时顶部梦主专区折叠栏
//
// 收起：56px 高，显示激活世界观徽记 + 梦魇计数
// 展开：全屏 Drawer，内部挂 MasterConsole（mobile-drawer layout）

import { useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { cn } from '../../../lib/utils.js';
import { Button } from '../../../components/ui/button.js';
import { Sheet, SheetContent } from '../../../components/ui/sheet.js';
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
          'flex h-14 w-full items-center justify-between gap-2 border-b border-blood/30',
          'bg-gradient-to-r from-blood/20 to-background/60 px-3 text-xs text-destructive',
          className,
        )}
        data-testid="master-panel-collapsed"
        aria-label="展开梦主专区"
      >
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-blood/20 px-2 py-0.5 text-[10px] text-destructive">
            梦主
          </span>
          <span>世界观：待加载</span>
          <span>梦魇：0/6</span>
        </div>
        <ChevronDown className="h-4 w-4" aria-hidden />
      </button>

      <Sheet open={expanded} onOpenChange={setExpanded}>
        <SheetContent
          side="top"
          showCloseButton={false}
          aria-label="梦主专区"
          data-testid="master-panel-expanded"
          className="max-h-dvh gap-2 overflow-y-auto p-3"
        >
          <div className="relative">
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              onClick={() => setExpanded(false)}
              className="absolute right-2 top-2 z-10 rounded-full bg-background/80"
              aria-label="收起"
            >
              <X className="h-4 w-4" />
            </Button>
            <MasterConsole state={state} layout="mobile-drawer" onOpenDetail={onOpenDetail} />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setExpanded(false)}
            className="w-full text-xs text-muted-foreground"
          >
            <ChevronUp className="h-3 w-3" aria-hidden />
            收起
          </Button>
        </SheetContent>
      </Sheet>
    </>
  );
}
