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
