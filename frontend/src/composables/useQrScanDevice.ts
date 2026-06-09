import { onMounted, onUnmounted, ref } from "vue";

const MOBILE_MAX = 820;

function isMobileDevice() {
  if (typeof window === "undefined") return false;
  const coarse =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  const touch = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
  const narrow = window.innerWidth <= MOBILE_MAX;
  return (coarse || touch) && narrow;
}

export function useQrScanDevice() {
  const canScanQr = ref(false);

  function sync() {
    canScanQr.value = isMobileDevice();
  }

  onMounted(() => {
    sync();
    window.addEventListener("resize", sync);
  });

  onUnmounted(() => {
    window.removeEventListener("resize", sync);
  });

  return { canScanQr };
}
