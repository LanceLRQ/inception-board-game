// TargetPickerDialog - 统一目标选择弹层（按 playerOrder 顺序 + 显示角色卡面）
// 对照：plans/design/06c-match-table-layout.md §5.3
//
// 主人要求："行动轴/Seat 只给看，需要行动选人的时候通过弹层来指定，
//   注意按顺序排列，然后显示对应的角色卡面，方便一眼认出。"
//
// 与既有 TargetPlayerPickerDialog 的区别：
//   - TargetPlayerPickerDialog（生产路径）：由 LocalMatchRuntime 的 pending state 驱动，简单按钮列表
//   - TargetPickerDialog（新 UI 路径）：由 useGameActions.intent.step='selectTarget' 驱动，显示角色卡面

import { useEffect } from 'react';
import { Target } from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.js';
import { GameCard } from '../GameCard/index.js';
import { LayerBadge } from '../LayerBadge/index.js';
import { cn } from '../../lib/utils.js';
import { getCardImageUrl } from '../../lib/cardImages.js';
import type { TargetCandidate } from './logic.js';

export interface TargetPickerDialogProps {
  open: boolean;
  /** 按 playerOrder 顺序排好的候选列表（来自 orderCandidates） */
  candidates: TargetCandidate[];
  /** 当前要打出的牌显示名，可选 */
  cardName?: string;
  onSelect: (playerID: string) => void;
  onCancel: () => void;
}

export function TargetPickerDialog({
  open,
  candidates,
  cardName,
  onSelect,
  onCancel,
}: TargetPickerDialogProps) {
  // 数字键 1-9 快选
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1;
        const c = candidates[idx];
        if (c && c.isLegal) {
          e.preventDefault();
          onSelect(c.playerID);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, candidates, onSelect]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
      blocking={false}
      size="lg"
      data-testid="target-picker-dialog"
    >
      <DialogHeader>
        <DialogTitle>
          <span className="inline-flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" aria-hidden />
            {cardName ? `${cardName} · 选择目标` : '选择目标'}
          </span>
        </DialogTitle>
        <DialogDescription>
          按回合顺序排列；合法目标可点，非法目标灰显。数字键 1-9 可快选。
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        {candidates.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">暂无可选目标</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {candidates.map((c, idx) => {
              const cardId = c.characterCardId ?? '__back__';
              const imageUrl = c.characterCardId ? getCardImageUrl(c.characterCardId) : undefined;
              return (
                <button
                  key={c.playerID}
                  type="button"
                  disabled={!c.isLegal}
                  title={c.illegalReason}
                  onClick={() => {
                    if (c.isLegal) onSelect(c.playerID);
                  }}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border-2 p-2 transition-colors',
                    c.isLegal
                      ? 'border-primary/40 bg-primary/5 hover:bg-primary/15 cursor-pointer'
                      : 'border-border/40 opacity-40 cursor-not-allowed grayscale',
                  )}
                  data-testid={`target-candidate-${c.playerID}`}
                  aria-disabled={!c.isLegal}
                >
                  <GameCard
                    cardId={cardId}
                    imageUrl={imageUrl}
                    orientation={c.faction === 'master' ? 'landscape' : 'portrait'}
                    size="md"
                    disableDetail
                    aria-label={`${c.nickname}${c.faction === 'master' ? '（梦主）' : ''}`}
                  />
                  <div className="flex items-center gap-1 text-[11px] font-medium">
                    <span className="tabular-nums text-muted-foreground">{idx + 1}.</span>
                    <span className="truncate max-w-[96px]">{c.nickname}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <LayerBadge layer={c.currentLayer} size="sm" />
                    {!c.isAlive && <span className="text-red-400">💀</span>}
                    {c.isRevealed && <span className="text-yellow-400">已翻</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
          data-testid="target-picker-cancel"
        >
          取消（ESC）
        </button>
      </DialogFooter>
    </Dialog>
  );
}
