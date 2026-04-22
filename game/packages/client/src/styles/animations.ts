import type { Variants } from 'framer-motion';

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

export const slideUp: Variants = {
  hidden: { y: 40, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { y: 40, opacity: 0, transition: { duration: 0.2 } },
};

export const slideDown: Variants = {
  hidden: { y: -40, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { y: -40, opacity: 0, transition: { duration: 0.2 } },
};

export const popIn: Variants = {
  hidden: { scale: 0.8, opacity: 0 },
  visible: { scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 20 } },
  exit: { scale: 0.8, opacity: 0, transition: { duration: 0.15 } },
};

export const shake: Variants = {
  hidden: { x: 0 },
  visible: {
    x: [0, -8, 8, -6, 6, -3, 3, 0],
    transition: { duration: 0.4 },
  },
};

export const cardFlip: Variants = {
  front: { rotateY: 0 },
  back: { rotateY: 180 },
};

/**
 * 当前行动玩家的脉冲光（金色）
 * 用于 PlayerSeat / RailSlot / ActionDock 外框
 * 对照：plans/design/06c-match-table-layout.md §7.2
 */
export const activeTurnPulse: Variants = {
  idle: { boxShadow: '0 0 0 0 rgba(250, 204, 21, 0)' },
  active: {
    boxShadow: [
      '0 0 0 0 rgba(250, 204, 21, 0)',
      '0 0 0 6px rgba(250, 204, 21, 0.4)',
      '0 0 0 0 rgba(250, 204, 21, 0)',
    ],
    transition: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' },
  },
};

/** 围坐 Seat 入场：按角度方向做微偏移淡入 */
export const seatEnter: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

/** 行动轴 Slot 从左侧滑入 */
export const railSlotEnter: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.25, ease: 'easeOut' } },
};
