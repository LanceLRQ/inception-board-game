// CardDetailModal - 长按/双击查看卡牌详情弹窗
// 支持双面角色（双子/双鱼/露娜）翻面预览
// 卡牌详情

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCw, X } from 'lucide-react';
import type { CardID } from '@icgame/shared';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { getCardImageUrl, getCardBackImageUrl, hasCardBackImage } from '../../lib/cardImages';
import { getCardName, getCharacterSkillSummary } from '../../lib/cards';

export interface CardDetailModalProps {
  cardId: CardID | null;
  onClose: () => void;
  /**
   * 禁用翻面：传 true 时隐藏翻面按钮 + F 键无响应。
   * 用于金库等"正面已公开但背面是游戏机密"的卡种
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
  active,
}: {
  cardId: CardID;
  onClose: () => void;
  disableFlip?: boolean;
  /** 弹层是否处于打开状态；关闭动画期间不再响应翻面快捷键 */
  active: boolean;
}) {
  const [showBack, setShowBack] = useState(false);

  // Esc / 点背景关闭由 Dialog 处理，这里只负责 F 键翻面
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (!disableFlip && (e.key === 'f' || e.key === 'F') && hasCardBackImage(cardId)) {
        setShowBack((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cardId, disableFlip, active]);

  const hasBack = shouldShowFlipButton(cardId, disableFlip);
  const displayUrl = showBack ? getCardBackImageUrl(cardId) : getCardImageUrl(cardId);
  const summary = getCharacterSkillSummary(cardId);
  const displayName = getCardName(cardId);

  return (
    <>
      {/* 关闭按钮 */}
      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        onClick={onClose}
        className="absolute right-2 top-2 z-20 rounded-full bg-background/80"
        aria-label="关闭"
        data-testid="card-detail-close"
      >
        <X className="h-4 w-4" />
      </Button>

      {/* 翻面按钮（仅双面角色） */}
      {hasBack && (
        <Button
          type="button"
          size="xs"
          onClick={() => setShowBack((v) => !v)}
          className="absolute right-12 top-2 z-20 rounded-full text-[11px]"
          aria-label="翻面"
          data-testid="card-detail-flip"
          title="按 F 键也可翻面"
        >
          <RotateCw className="h-3 w-3" />
          {showBack ? '看正面' : '看背面'}
        </Button>
      )}

      {/* 卡图（翻面动画） */}
      <div className="flex items-center justify-center bg-gradient-to-br from-panel-2 to-background p-4">
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
              <div className="flex h-60 w-full items-center justify-center rounded-md bg-panel-2 text-dim">
                <span className="text-sm">{displayName || cardId}</span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 文字说明 */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
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
    </>
  );
}

export function CardDetailModal({ cardId, onClose, disableFlip }: CardDetailModalProps) {
  // 关闭过渡期间 cardId 已为 null，仍需渲染最后一张卡，否则内容会先消失再淡出
  const [lastCardId, setLastCardId] = useState<CardID | null>(cardId);
  if (cardId && cardId !== lastCardId) setLastCardId(cardId);
  const displayId = cardId ?? lastCardId;

  return (
    <Dialog
      open={Boolean(cardId)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      blocking={false}
      showClose={false}
      aria-label="卡牌详情"
      data-testid="card-detail-modal"
      className="flex flex-col overflow-hidden p-0"
    >
      {displayId && (
        <ModalContent
          key={displayId}
          cardId={displayId}
          onClose={onClose}
          disableFlip={disableFlip}
          active={Boolean(cardId)}
        />
      )}
    </Dialog>
  );
}
