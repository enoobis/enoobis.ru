import { readonly, ref } from "vue";

const MOBILE_MAX = 640;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function prefersLiteMotion(): boolean {
  if (prefersReducedMotion()) return true;
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    window.innerWidth <= MOBILE_MAX
  );
}

const liteMotion = ref(prefersLiteMotion());

export function syncLiteMotion() {
  liteMotion.value = prefersLiteMotion();
}

export function useLiteMotion() {
  return readonly(liteMotion);
}

export function skipMotion(): boolean {
  return liteMotion.value;
}
