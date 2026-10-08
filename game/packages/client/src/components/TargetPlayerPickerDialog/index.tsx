// TargetPlayerPickerDialog · 选目标玩家对话框（从 LocalMatchRuntime 提炼）
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
  /** 梦主的座位、本人是不是梦主、持有贿赂牌的座位：移形换影与梦境窥视效果②的目标限制要用 */
  dreamMasterID?: string;
  viewerIsMaster?: boolean;
  bribeHolderIds?: readonly string[];
  /** 本人的角色与手牌张数、梦主的角色：SHOOT 跨层的豁免（摩羯 / 恐怖分子 / 木星）要用 */
  viewerCharacterId?: string | null;
  viewerHandCount?: number;
  masterCharacterId?: string | null;
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
  dreamMasterID,
  viewerIsMaster,
  bribeHolderIds,
  viewerCharacterId,
  viewerHandCount,
  masterCharacterId,
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
    ...(dreamMasterID !== undefined ? { dreamMasterID } : {}),
    ...(viewerIsMaster !== undefined ? { viewerIsMaster } : {}),
    ...(bribeHolderIds !== undefined ? { bribeHolderIds } : {}),
    ...(viewerCharacterId !== undefined ? { viewerCharacterId } : {}),
    ...(viewerHandCount !== undefined ? { viewerHandCount } : {}),
    ...(masterCharacterId !== undefined ? { masterCharacterId } : {}),
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
        <DialogDescription>
          {pending?.card === 'action_dream_peek'
            ? '只能查看已持有贿赂牌的盗梦者。'
            : '同层限制由卡牌规则决定；跨层不可选的目标已置灰。'}
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        {decreeSlot}
        <div className="flex flex-wrap gap-2">
          {options.length === 0 ? (
            <span className="text-xs text-muted-foreground" data-testid="target-player-empty">
              无可选目标
            </span>
          ) : (
            options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={opt.disabled}
                title={
                  opt.reason === 'masterTarget'
                    ? '盗梦者不能对梦主使用移形换影'
                    : opt.reason === 'sameLayer'
                      ? '该 SHOOT 仅限同层目标'
                      : opt.crossLayerAllowed
                        ? '你的角色或世界观允许这张 SHOOT 打向别的层'
                        : undefined
                }
                data-reason={opt.reason ?? undefined}
                onClick={() => {
                  if (opt.disabled) return;
                  onPick(opt.id);
                }}
                className="rounded-full bg-destructive px-3 py-1 text-xs text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-40"
                data-testid={`target-player-${opt.id}`}
              >
                {opt.name}
                {opt.reason === 'masterTarget'
                  ? ' · 梦主（不可选）'
                  : opt.reason === 'sameLayer' && opt.crossLayerNumber !== null
                    ? ` · L${opt.crossLayerNumber}（跨层）`
                    : opt.crossLayerAllowed && opt.crossLayerNumber !== null
                      ? ` · L${opt.crossLayerNumber}（跨层可射）`
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
