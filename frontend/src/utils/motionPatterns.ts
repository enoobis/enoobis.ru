export const MOTION_PATTERNS = {
  navSearchExpand: "NavExpandSearch width expand from search icon",
} as const;

export type MotionPatternKey = keyof typeof MOTION_PATTERNS;
