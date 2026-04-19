// CardDetailModal - 长按查看卡牌详情弹窗
// 对照：plans/design/06-frontend-design.md §6.4.2 卡牌详情

import { motion, AnimatePresence } from 'framer-motion';
import type { CardID } from '@icgame/shared';

export interface CardDetailModalProps {
  cardId: CardID | null;
  onClose: () => void;
}

export function CardDetailModal({ cardId, onClose }: CardDetailModalProps) {
  return (
    <AnimatePresence>
      {cardId && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="卡牌详情"
        >
          <motion.div
            className="max-w-sm rounded-xl bg-card p-6 shadow-2xl"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex h-40 items-center justify-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 text-slate-300">
              <span className="text-sm">{cardId}</span>
            </div>
            <h3 className="mb-2 text-lg font-semibold text-foreground">{cardId}</h3>
            <p className="text-sm text-muted-foreground">
              （卡牌文案占位 · Phase 3 接入真实效果描述）
            </p>
            <button
              type="button"
              className="mt-4 w-full rounded-md border border-border bg-secondary py-2 text-sm text-foreground hover:bg-secondary/80"
              onClick={onClose}
            >
              关闭
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
