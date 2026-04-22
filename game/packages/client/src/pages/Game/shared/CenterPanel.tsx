// CenterPanel - 桌面中央共享区域
// 布局（对照主人提供的示意图 / 06c-match-table-layout.md §5）：
//   顶部 4 行：L4 → L1，每行一层，包含「层徽 · 金库（金库牌正/背面）· 心锁」
//   底部一行：用过的牌（弃牌堆） · 可用牌堆（背面 + 剩余数量；当前玩家回合点击摸牌）
//
// 梦境层固定按 4→1 排序（顶层数字大、底层数字小，贴合梦境越深层数越小的物理直觉）。

import { useState } from 'react';
import { GameCard } from '../../../components/GameCard/index.js';
import { diceSvgPath } from '../../../components/Dice3D/index.js';
import { getCardImageUrl } from '../../../lib/cardImages.js';
import { getCardName } from '../../../lib/cards.js';
import { cn } from '../../../lib/utils.js';
import type { MockMatchState, MockVault } from '../../../hooks/useMockMatch.js';
import type { CardID } from '@icgame/shared';

export interface CenterPanelProps {
  state: MockMatchState;
  /** 焦点层：用于高亮当前 viewer / 梦主操作的层（不决定布局顺序，仅作视觉强调） */
  focusLayer: number;
  /** 点击金库（尚未接入；占位回调） */
  onOpenVault?: (vaultId: string) => void;
  /** 点击弃牌堆 */
  onOpenDiscard?: () => void;
  /** 当前玩家回合点击摸牌堆 */
  onDrawDeck?: () => void;
  /** viewer 是否可摸牌（当前回合 + draw/action 阶段） */
  canDraw?: boolean;
  className?: string;
}

/** 梦境层固定 4→1 排序 */
const LAYER_ORDER = [4, 3, 2, 1] as const;

function VaultCell({
  vault,
  onOpenVault,
}: {
  vault: MockVault | undefined;
  onOpenVault?: (vaultId: string) => void;
}) {
  if (!vault) {
    return (
      <div className="flex h-[68px] w-12 items-center justify-center rounded border border-dashed border-slate-700 text-[9px] text-muted-foreground">
        无金库
      </div>
    );
  }
  // 金库卡面：未翻开用金库背面图；已翻开按 contentType 映射到 shared 注册的 vault 卡 ID
  const vaultCardMap: Record<string, string> = {
    secret: 'vault_secret',
    coin: 'vault_gold',
    empty: 'vault_back',
  };
  const cardId = vault.isOpened ? (vaultCardMap[vault.contentType] ?? 'vault_back') : 'vault_back';
  const imageUrl = getCardImageUrl(cardId);
  return (
    <button
      type="button"
      onClick={() => onOpenVault?.(vault.id)}
      className="transition-transform hover:scale-105"
      data-testid={`vault-cell-${vault.id}`}
      aria-label={vault.isOpened ? `金库（${vault.contentType}）` : '金库（未翻开）'}
    >
      <GameCard
        cardId={cardId}
        imageUrl={imageUrl}
        size="sm"
        orientation="portrait"
        disableDetail // 金库牌按 06c §6 规则不触发长按/双击详情
      />
    </button>
  );
}

export function CenterPanel({
  state,
  focusLayer,
  onOpenVault,
  onOpenDiscard,
  onDrawDeck,
  canDraw,
  className,
}: CenterPanelProps) {
  const [showDiscard, setShowDiscard] = useState(false);

  // 弃牌历史弹层：最后打出的在最顶
  const discardList: CardID[] = [...state.discardPile].reverse();

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-2xl border-2 border-indigo-500/40',
        'bg-gradient-to-br from-indigo-900/60 to-slate-900/80 p-3 shadow-xl',
        className,
      )}
      data-testid="center-panel"
    >
      {/* 梦境层数：移动端纵排（L4 顶、L1 底）/ PC 横排（L4 左 → L1 右） */}
      <div className="flex flex-col gap-1.5 lg:flex-row lg:gap-2">
        {LAYER_ORDER.map((layerNum) => {
          const layerState = state.layers[layerNum];
          const vault = state.vaults.find((v) => v.layer === layerNum);
          const isFocus = focusLayer === layerNum;

          return (
            <div
              key={layerNum}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-2 py-1.5',
                'lg:flex-1 lg:flex-col lg:items-center lg:gap-2 lg:py-2',
                isFocus
                  ? 'border-yellow-400/60 bg-yellow-400/5 shadow-[0_0_8px_rgba(250,204,21,0.25)]'
                  : 'border-indigo-500/20 bg-slate-900/40',
              )}
              data-testid={`layer-row-${layerNum}`}
              data-focus={isFocus || undefined}
            >
              {/* 层徽（使用梦境层卡图） */}
              <GameCard
                cardId={`dream_${layerNum}`}
                imageUrl={getCardImageUrl(`dream_${layerNum}`)}
                size="sm"
                orientation="portrait"
                disableDetail
                aria-label={`梦境层 ${layerNum}`}
              />

              {/* 金库 */}
              <VaultCell vault={vault} onOpenVault={onOpenVault} />

              {/* 心锁（蓝色骰面，静态不掷）+ 梦魇 */}
              <div className="flex min-w-0 flex-1 flex-col gap-1 lg:w-full lg:flex-none lg:items-center">
                <div className="flex items-center gap-2">
                  {(() => {
                    const hl = layerState?.heartLockValue ?? 0;
                    const clamped = Math.max(0, Math.min(hl, 6));
                    return clamped === 0 ? (
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-xs font-semibold text-blue-500/40 ring-1 ring-blue-500/20"
                        aria-hidden="true"
                      >
                        0
                      </div>
                    ) : (
                      <img
                        src={diceSvgPath('blue', clamped)}
                        alt={`心锁 ${clamped} 点`}
                        draggable={false}
                        className="h-8 w-8 select-none drop-shadow-sm"
                      />
                    );
                  })()}
                </div>
                {layerState?.nightmareRevealed && (
                  <span className="text-[9px] text-red-400">⚠ 梦魇已揭露</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部：弃牌堆 + 可用牌堆 */}
      <div className="mt-1 flex items-stretch justify-around gap-3 border-t border-indigo-500/20 pt-2">
        {/* 用过的牌（弃牌堆）—— 点击打开历史弹层 */}
        <button
          type="button"
          onClick={() => {
            if (state.discardPile.length > 0) setShowDiscard(true);
            onOpenDiscard?.();
          }}
          className="flex flex-col items-center gap-1 transition-transform hover:scale-105"
          data-testid="discard-pile"
          aria-label={`弃牌堆（${state.discardPile.length} 张）`}
        >
          <div className="relative">
            {state.discardPile.length === 0 ? (
              <div className="flex h-[68px] w-12 items-center justify-center rounded border border-dashed border-slate-700 text-[9px] text-muted-foreground">
                空
              </div>
            ) : (
              <GameCard
                cardId={state.discardPile[state.discardPile.length - 1] ?? null}
                imageUrl={getCardImageUrl(state.discardPile[state.discardPile.length - 1])}
                size="sm"
                orientation="portrait"
                disableDetail
              />
            )}
            {state.discardPile.length > 0 && (
              <span className="absolute -right-1 -top-1 rounded-full bg-slate-800 px-1 text-[9px] text-slate-200 shadow">
                {state.discardPile.length}
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground">用过的牌</span>
        </button>

        {/* 可用牌堆（背面 + 剩余数量） */}
        <button
          type="button"
          onClick={canDraw ? onDrawDeck : undefined}
          disabled={!canDraw}
          className={cn(
            'flex flex-col items-center gap-1 transition-transform',
            canDraw ? 'hover:scale-105 cursor-pointer' : 'cursor-not-allowed opacity-80',
          )}
          data-testid="deck-pile"
          data-can-draw={canDraw || undefined}
          aria-label={`可用牌堆（剩余 ${state.deckCount} 张${canDraw ? '，点击摸牌' : ''}）`}
        >
          <div className="relative">
            <GameCard
              cardId="action_back"
              imageUrl={getCardImageUrl('action_back')}
              size="sm"
              orientation="portrait"
              disableDetail
            />
            <span className="absolute -right-1 -top-1 rounded-full bg-indigo-600 px-1 text-[9px] text-indigo-50 shadow">
              {state.deckCount}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {canDraw ? '可摸牌' : '可用牌堆'}
          </span>
        </button>
      </div>

      {/* 弃牌历史弹层：最后打出的在最顶 */}
      {showDiscard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowDiscard(false)}
          data-testid="discard-history-overlay"
        >
          <div
            className="relative mx-4 max-h-[70vh] w-full max-w-md overflow-y-auto rounded-2xl border border-indigo-500/30 bg-slate-900 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">
                过牌历史（{discardList.length} 张）
              </h4>
              <button
                type="button"
                onClick={() => setShowDiscard(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-slate-700 hover:text-foreground"
                aria-label="关闭"
              >
                ✕
              </button>
            </div>
            {discardList.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">暂无弃牌</div>
            ) : (
              <div className="flex flex-col gap-2">
                {discardList.map((cardId, i) => (
                  <div
                    key={`${cardId}-${i}`}
                    className="flex items-center gap-3 rounded-lg border border-slate-700/50 bg-slate-800/50 px-2 py-1.5"
                  >
                    <GameCard
                      cardId={cardId}
                      imageUrl={getCardImageUrl(cardId)}
                      size="sm"
                      orientation="portrait"
                      disableDetail
                    />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-foreground">
                        {getCardName(cardId)}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        第 {discardList.length - i} 张
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
