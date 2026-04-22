// SHOOT 骰子动画浮层 —— 射击牌打出后展示骰面快速切换，落定后停留 1s 再回调
// 对照：plans/design/06-frontend-design.md §6.6 Dice3D

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { diceSvgPath } from '../Dice3D';
import type { DiceColor } from '../Dice3D';

export interface ShootDiceOverlayProps {
  /** 原始骰值 1-6，有值时展示动画 */
  roll: number | null | undefined;
  /** 骰子颜色（SHOOT 红 / 心锁蓝），默认红 */
  color?: DiceColor;
  /** 动画完成（骰面落定 + 停留）后回调 */
  onComplete?: () => void;
}

// 骰面快速切换动画时长
const ROLL_ANIMATION_MS = 500;
// 落定后展示终值的停留时间
const SHOW_FINAL_MS = 1000;

export function ShootDiceOverlay({ roll, color = 'red', onComplete }: ShootDiceOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [displayFace, setDisplayFace] = useState(1);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const prevRollRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // roll 值变化时启动动画
  useEffect(() => {
    if (roll == null || roll === prevRollRef.current) return;
    prevRollRef.current = roll;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);

    setVisible(true);
    setRolling(true);

    // 快速随机切换骰面
    intervalRef.current = setInterval(() => {
      setDisplayFace(Math.floor(Math.random() * 6) + 1);
    }, 60);

    // 500ms 后停止切换，展示终值
    timerRef.current = setTimeout(() => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = undefined;
      setDisplayFace(roll);
      setRolling(false);

      // 停留 1s 后淡出并回调
      timerRef.current = setTimeout(() => {
        setVisible(false);
        onCompleteRef.current?.();
      }, SHOW_FINAL_MS);
    }, ROLL_ANIMATION_MS);
  }, [roll]);

  if (roll == null) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          data-testid="shoot-dice-overlay"
        >
          <motion.div
            className="flex flex-col items-center gap-3 rounded-xl bg-card/90 px-8 py-6 shadow-lg backdrop-blur-sm"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <img
              src={diceSvgPath(color, displayFace)}
              alt={`骰子 ${displayFace}`}
              className="h-16 w-16 select-none"
              draggable={false}
            />
            <span className="text-sm font-medium text-foreground">
              {rolling ? '掷骰中...' : displayFace}
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
