import { onMounted, onUnmounted, ref } from "vue";

const MOBILE_MAX = 640;

function isMobileViewport() {
  return typeof window !== "undefined" && window.innerWidth <= MOBILE_MAX;
}

export function useQrScanDevice() {
  const canScanQr = ref(false);

  function sync() {
    canScanQr.value = isMobileViewport();
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
