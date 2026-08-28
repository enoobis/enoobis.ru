import { prefersReducedMotion } from "./reducedMotion";

type HapticPattern = "tap" | "toggle" | "success" | "error";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 8,
  toggle: 14,
  success: [10, 40, 16],
  error: [22, 50, 22],
};

function canVibrate(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return false;
  if (prefersReducedMotion()) return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

export function haptic(pattern: HapticPattern = "tap") {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    /* устройство может отклонить вибрацию без жеста пользователя */
  }
}
