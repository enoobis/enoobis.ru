export const springSnappy = {
  type: "spring" as const,
  stiffness: 420,
  damping: 32,
  mass: 0.9,
};

export const searchTween = { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const };
