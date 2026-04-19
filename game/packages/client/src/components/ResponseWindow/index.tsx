// 响应窗口 - 30s 倒计时统一组件
// 对照：plans/design/06-frontend-design.md §6.4 shared/ResponseWindow

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils.js';
import { popIn } from '../../styles/animations.js';

export interface ResponseWindowProps {
  /** 是否激活（有响应窗口打开） */
  active: boolean;
  /** 超时秒数 */
  timeout?: number;
  /** 响应类型标签 */
  label?: string;
  /** 超时自动回调 */
  onTimeout?: () => void;
  /** 主动响应回调 */
  onRespond?: () => void;
  /** 放弃响应回调 */
  onPass?: () => void;
  /** 当前玩家是否可以响应 */
  canRespond?: boolean;
  /** 附加类名 */
  className?: string;
}

export function ResponseWindow({
  active,
  timeout = 30,
  label = '等待响应',
  onTimeout,
  onRespond,
  onPass,
  canRespond = true,
  className,
}: ResponseWindowProps) {
  const [remaining, setRemaining] = useState(timeout);
  const [prevActive, setPrevActive] = useState(active);

  // React 推荐模式：props 变化时同步调整 state（渲染期间调用 setState）
  // 参考：https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (active !== prevActive) {
    setPrevActive(active);
    if (active) {
      setRemaining(timeout);
    }
  }

  // 倒计时：所有 setState 都在 interval 回调中
  useEffect(() => {
    if (!active) return;

    const interval = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(interval);
          return 0;
        }
        return r - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [active]);

  const expired = active && remaining <= 0;

  // 超时回调（仅触发一次）
  const expiredCalledRef = useRef(false);
  const handleTimeout = useCallback(() => {
    if (!expiredCalledRef.current) {
      expiredCalledRef.current = true;
      onTimeout?.();
    }
  }, [onTimeout]);

  useEffect(() => {
    if (expired) {
      handleTimeout();
    }
    if (!active) {
      expiredCalledRef.current = false;
    }
  }, [expired, active, handleTimeout]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className={cn('fixed inset-x-0 top-16 z-50 mx-auto max-w-md px-4', className)}
          variants={popIn}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <div className="rounded-xl border border-yellow-500/50 bg-yellow-950/90 p-4 shadow-lg backdrop-blur-sm">
            {/* 标题行 */}
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-yellow-200">{label}</span>
              <span
                className={cn(
                  'font-mono text-lg font-bold',
                  remaining <= 5 ? 'text-red-400 animate-pulse' : 'text-yellow-300',
                )}
              >
                {remaining}s
              </span>
            </div>

            {/* 进度条 */}
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-yellow-900/50">
              <motion.div
                className="h-full rounded-full bg-yellow-400"
                initial={{ width: '100%' }}
                animate={{ width: `${(remaining / timeout) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>

            {/* 操作按钮 */}
            {canRespond ? (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onRespond}
                  className="flex-1 rounded-lg bg-yellow-500 px-4 py-2 text-sm font-medium text-black hover:bg-yellow-400 transition-colors"
                >
                  响应（出牌）
                </button>
                <button
                  type="button"
                  onClick={onPass}
                  className="flex-1 rounded-lg border border-yellow-500/30 px-4 py-2 text-sm font-medium text-yellow-200 hover:bg-yellow-900/50 transition-colors"
                >
                  放弃
                </button>
              </div>
            ) : (
              <p className="text-center text-sm text-yellow-300/70">等待其他玩家响应...</p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
