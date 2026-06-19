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
  y: 32,
  scale: 0.92,
  filter: "blur(10px)",
};

export const pageActive = {
  opacity: 1,
  y: 0,
  scale: 1,
  filter: "blur(0px)",
};

export const pageExit = {
  opacity: 0,
  y: -18,
  scale: 1.03,
  filter: "blur(8px)",
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
    y: 22,
    scale: 0.88,
    rotate: -2,
    filter: "blur(6px)",
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    rotate: 0,
    filter: "blur(0px)",
    transition: springPop,
  },
};

export const cardHover = {
  scale: 1.04,
  y: -6,
  transition: springSnappy,
};

export const cardTap = {
  scale: 0.96,
  transition: { duration: 0.08 },
};

export const revealHidden = {
  opacity: 0,
  y: 14,
  filter: "blur(8px)",
};

export const revealVisible = {
  opacity: 1,
  y: 0,
  filter: "blur(0px)",
  transition: springSoft,
};

export const pressHover = {
  scale: 1.02,
  y: -2,
  transition: springSnappy,
};

export const pressTap = {
  scale: 0.98,
  transition: { duration: 0.08 },
};

export const menuPanelEnter = {
  opacity: 0,
  y: -10,
  scale: 0.98,
  filter: "blur(6px)",
};

export const menuPanelActive = {
  opacity: 1,
  y: 0,
  scale: 1,
  filter: "blur(0px)",
  transition: springSnappy,
};

export const menuPanelExit = {
  opacity: 0,
  y: -8,
  scale: 0.99,
  filter: "blur(4px)",
  transition: { duration: 0.16 },
};
