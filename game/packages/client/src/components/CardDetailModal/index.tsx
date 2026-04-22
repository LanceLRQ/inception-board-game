// CardDetailModal - 长按/双击查看卡牌详情弹窗
// 支持双面角色（双子/双鱼/露娜）翻面预览
// 对照：plans/design/06-frontend-design.md §6.4.2 卡牌详情

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCw, X } from 'lucide-react';
import type { CardID } from '@icgame/shared';
import { getCardImageUrl, getCardBackImageUrl, hasCardBackImage } from '../../lib/cardImages';
import { getCardName, getCharacterSkillSummary } from '../../lib/cards';

export interface CardDetailModalProps {
  cardId: CardID | null;
  onClose: () => void;
  /**
   * 禁用翻面：传 true 时隐藏翻面按钮 + F 键无响应。
   * 用于金库等"正面已公开但背面是游戏机密"的卡种
   * （对照：plans/design/06c-match-table-layout.md §6.2）
   */
  disableFlip?: boolean;
}

/**
 * 纯函数：判定是否应渲染翻面按钮 / 响应 F 键。
 * 条件：卡牌本身有背面图 && 未被显式禁用。
 */
export function shouldShowFlipButton(cardId: CardID | null, disableFlip?: boolean): boolean {
  if (!cardId) return false;
  if (disableFlip) return false;
  return hasCardBackImage(cardId);
}

/** 内部内容组件：以 cardId 作为 React key 挂载，自然每次打开都重置状态 */
function ModalContent({
  cardId,
  onClose,
  disableFlip = false,
}: {
  cardId: CardID;
  onClose: () => void;
  disableFlip?: boolean;
}) {
  const [showBack, setShowBack] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (!disableFlip && (e.key === 'f' || e.key === 'F') && hasCardBackImage(cardId)) {
        setShowBack((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cardId, onClose, disableFlip]);

  const hasBack = shouldShowFlipButton(cardId, disableFlip);
  const displayUrl = showBack ? getCardBackImageUrl(cardId) : getCardImageUrl(cardId);
  const summary = getCharacterSkillSummary(cardId);
  const displayName = getCardName(cardId);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="卡牌详情"
      data-testid="card-detail-modal"
    >
      <motion.div
        className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-card shadow-2xl"
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 z-20 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
          aria-label="关闭"
          data-testid="card-detail-close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* 翻面按钮（仅双面角色） */}
        {hasBack && (
          <button
            type="button"
            onClick={() => setShowBack((v) => !v)}
            className="absolute right-12 top-2 z-20 flex items-center gap-1 rounded-full bg-primary/80 px-2 py-1 text-[11px] text-primary-foreground hover:bg-primary"
            aria-label="翻面"
            data-testid="card-detail-flip"
            title="按 F 键也可翻面"
          >
            <RotateCw className="h-3 w-3" />
            {showBack ? '看正面' : '看背面'}
          </button>
        )}

        {/* 卡图（翻面动画） */}
        <div className="flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 p-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={showBack ? 'back' : 'front'}
              initial={{ rotateY: -90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ rotateY: 90, opacity: 0 }}
              transition={{ duration: 0.28 }}
              style={{ perspective: 1000 }}
              className="flex w-full max-w-[260px] items-center justify-center"
            >
              {displayUrl ? (
                <img
                  src={displayUrl}
                  alt={displayName}
                  className="h-auto w-full rounded-md shadow-lg"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="flex h-60 w-full items-center justify-center rounded-md bg-slate-700 text-slate-300">
                  <span className="text-sm">{displayName || cardId}</span>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 文字说明 */}
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          <h3 className="text-lg font-semibold text-foreground">{summary?.name ?? displayName}</h3>
          {summary?.skills.map((s) => (
            <div key={s.name} className="rounded border border-border bg-muted/40 p-2">
              <div className="mb-1 text-sm font-medium text-primary">{s.name}</div>
              <p className="text-xs leading-relaxed text-muted-foreground">{s.description}</p>
            </div>
          ))}
          {!summary && (
            <p className="text-xs text-muted-foreground">
              {cardId.startsWith('action_')
                ? '行动牌，详细效果见规则说明'
                : cardId.startsWith('nightmare_')
                  ? '梦魇牌，由梦主激活'
                  : '卡牌详情'}
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function CardDetailModal({ cardId, onClose, disableFlip }: CardDetailModalProps) {
  return (
    <AnimatePresence>
      {cardId && (
        <ModalContent key={cardId} cardId={cardId} onClose={onClose} disableFlip={disableFlip} />
      )}
    </AnimatePresence>
  );
}
