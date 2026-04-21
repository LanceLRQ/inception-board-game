// TargetPlayerPickerDialog · 选目标玩家对话框（从 LocalMatchRuntime 提炼）
// 对照：plans/2-1-3-1-2-ui-cozy-wave.md 阶段 2
//
// 适用于所有"需选目标玩家"场景：SHOOT / KICK / 念力牵引 / 共鸣 / shift 等
// 同层/跨层约束由卡牌 id 决定（参考 logic.isSameLayerRequired）
//
// 设计取舍：
//  - 死亡宣言（decree picker）仍由调用方通过 decreeSlot 渲染插入 DialogBody，
//    本 Dialog 不直接拥有 decree 状态；Stage 4 再拆出 DeathDecreePickerDialog

import type { ReactNode } from 'react';
import { Target } from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { computeTargetOptions } from './logic';

export interface TargetPlayerPickerDialogProps {
  /** 控制 open；传入 null/undefined 表示关闭 */
  pending: {
    card: string;
    move: string;
  } | null;
  viewerPlayerID: string;
  viewerLayer: number;
  players: Record<
    string,
    { isAlive: boolean; currentLayer: number; nickname?: string } | undefined
  >;
  /** 卡牌显示名（可选） */
  cardNameOf?: (cardId: string) => string;
  onPick: (targetPlayerID: string) => void;
  onCancel: () => void;
  /** 可选插槽：死亡宣言 / 额外选项（由调用方渲染） */
  decreeSlot?: ReactNode;
}

export function TargetPlayerPickerDialog({
  pending,
  viewerPlayerID,
  viewerLayer,
  players,
  cardNameOf,
  onPick,
  onCancel,
  decreeSlot,
}: TargetPlayerPickerDialogProps) {
  const open = pending != null;
  const cardName = pending?.card ? (cardNameOf?.(pending.card) ?? pending.card) : '';
  const options = computeTargetOptions({
    cardId: pending?.card,
    viewerLayer,
    viewerPlayerID,
    players,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
      blocking={false}
      size="md"
      data-testid="target-player-picker-dialog"
    >
      <DialogHeader>
        <DialogTitle>
          <span className="inline-flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" aria-hidden />
            {cardName ? `${cardName} · 选择目标玩家` : '选择目标玩家'}
          </span>
        </DialogTitle>
        <DialogDescription>同层限制由卡牌规则决定；跨层不可选的目标已置灰。</DialogDescription>
      </DialogHeader>
      <DialogBody>
        {decreeSlot}
        <div className="flex flex-wrap gap-2">
          {options.length === 0 ? (
            <span className="text-xs text-muted-foreground">无可选目标</span>
          ) : (
            options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={opt.disabled}
                title={opt.disabled ? '该 SHOOT 仅限同层目标' : undefined}
                onClick={() => {
                  if (opt.disabled) return;
                  onPick(opt.id);
                }}
                className="rounded-full bg-destructive px-3 py-1 text-xs text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-40"
                data-testid={`target-player-${opt.id}`}
              >
                {opt.name}
                {opt.disabled && opt.crossLayerNumber !== null
                  ? ` · L${opt.crossLayerNumber}（跨层）`
                  : ''}
              </button>
            ))
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
          data-testid="target-player-cancel"
        >
          取消
        </button>
      </DialogFooter>
    </Dialog>
  );
}
