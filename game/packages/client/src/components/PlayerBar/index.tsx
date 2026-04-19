// PlayerBar - 玩家状态栏（头像 / 昵称 / 手牌数 / 存活 / 层）
// 对照：plans/design/06-frontend-design.md §6.4.5 玩家栏

import { cn } from '../../lib/utils.js';
import type { MockPlayer } from '../../hooks/useMockMatch.js';

export interface PlayerBarProps {
  player: MockPlayer;
  isCurrent?: boolean;
  isSelf?: boolean;
  /** 是否合法目标（第二步选目标时高亮） */
  isLegalTarget?: boolean;
  /** 是否可点击（选中目标时） */
  clickable?: boolean;
  onClick?: () => void;
}

export function PlayerBar({
  player,
  isCurrent,
  isSelf,
  isLegalTarget,
  clickable,
  onClick,
}: PlayerBarProps) {
  const dim = !player.isAlive;

  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      aria-pressed={isLegalTarget ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors',
        'min-h-[44px]', // 触控区
        isCurrent && 'border-yellow-400 bg-yellow-400/10',
        !isCurrent && 'border-border bg-card',
        isLegalTarget && 'border-primary shadow-[0_0_8px_rgba(59,130,246,0.6)] animate-pulse',
        dim && 'opacity-40 line-through',
        clickable && !dim && 'cursor-pointer hover:bg-accent/40',
        !clickable && 'cursor-default',
      )}
    >
      {/* 像素头像占位 */}
      <div
        className={cn(
          'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border text-[10px] font-bold',
          player.faction === 'master'
            ? 'border-red-500 bg-red-500/20 text-red-400'
            : 'border-indigo-500 bg-indigo-500/20 text-indigo-400',
        )}
      >
        {player.nickname.slice(0, 1)}
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="flex items-center gap-1 text-sm font-medium text-foreground">
          <span className="truncate">{player.nickname}</span>
          {isSelf && <span className="text-[10px] text-primary">（我）</span>}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>层{player.currentLayer}</span>
          <span>手{player.handCount}</span>
          {!player.isAlive && <span className="text-red-400">已死</span>}
          {player.isRevealed && <span className="text-yellow-500">已翻</span>}
        </div>
      </div>
    </button>
  );
}
