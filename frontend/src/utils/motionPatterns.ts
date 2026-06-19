export const MOTION_PATTERNS = {
  pageTransition: "motion-v spring blur between routes",
  headerReveal: "MotionReveal blur-up on PageHeader titles",
  listStagger: "MotionStagger + MotionStaggerItem for shop/inventory/admin lists",
  coinPop: "MotionCoinCount spring on balance change",
  toastSpring: "AppToast AnimatePresence slide spring",
  displacementHover: "DisplacementImage WebGL hover on static shop/inventory previews",
  pressFeedback: "MotionPress scale on primary actions",
} as const;

export type MotionPatternKey = keyof typeof MOTION_PATTERNS;
