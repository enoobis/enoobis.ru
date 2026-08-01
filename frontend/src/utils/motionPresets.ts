import { stagger } from "motion-v";

export const springPop = {
  type: "spring" as const,
  stiffness: 520,
  damping: 22,
  mass: 0.75,
};

export const springSnappy = {
  type: "spring" as const,
  stiffness: 420,
  damping: 28,
  mass: 0.85,
};

export const springSoft = {
  type: "spring" as const,
  stiffness: 280,
  damping: 26,
  mass: 1,
};

export const pageEnter = {
  opacity: 0,
  y: 8,
};

export const pageActive = {
  opacity: 1,
  y: 0,
  transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
};

export const pageExit = {
  opacity: 0,
  y: -4,
  transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
};

export const listContainer = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: stagger(0.07, { from: "first" }),
      staggerChildren: 0.07,
    },
  },
};

export const listItem = {
  hidden: {
    opacity: 0,
    y: 8,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: springSoft,
  },
};

export const cardHover = {
  y: -2,
  transition: springSnappy,
};

export const cardTap = {
  opacity: 0.82,
  transition: { duration: 0.1 },
};

export const revealHidden = {
  opacity: 0,
  y: 6,
};

export const revealVisible = {
  opacity: 1,
  y: 0,
  transition: springSoft,
};

export const pressHover = {
  opacity: 0.92,
  transition: springSnappy,
};

export const pressTap = {
  opacity: 0.72,
  transition: { duration: 0.1 },
};

export const menuPanelEnter = {
  opacity: 0,
  y: -6,
};

export const menuPanelActive = {
  opacity: 1,
  y: 0,
  transition: springSnappy,
};

export const menuPanelExit = {
  opacity: 0,
  y: -4,
  transition: { duration: 0.16 },
};

export const tweenFast = { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const };

export const pageEnterLite = { opacity: 0, y: 10 };
export const pageActiveLite = { opacity: 1, y: 0 };
export const pageExitLite = { opacity: 0, y: -6, transition: { duration: 0.14 } };

export const revealHiddenLite = { opacity: 0, y: 6 };
export const revealVisibleLite = { opacity: 1, y: 0, transition: tweenFast };

export const listItemLite = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: tweenFast },
};

export const toastEnterLite = { opacity: 0, y: 10 };
export const toastActiveLite = { opacity: 1, y: 0, transition: tweenFast };
export const toastExitLite = { opacity: 0, y: 6, transition: { duration: 0.14 } };

export const coinEnterLite = { opacity: 0, y: 6 };
export const coinActiveLite = { opacity: 1, y: 0, transition: tweenFast };
export const coinExitLite = { opacity: 0, transition: { duration: 0.1 } };
