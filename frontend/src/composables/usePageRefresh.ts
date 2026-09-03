import { onMounted, onUnmounted } from "vue";

let current: (() => Promise<void> | void) | null = null;

export function usePageRefresh(fn: () => Promise<void> | void) {
  onMounted(() => {
    current = fn;
  });
  onUnmounted(() => {
    if (current === fn) current = null;
  });
}

export async function runPageRefresh() {
  const started = Date.now();
  await current?.();
  const wait = 280 - (Date.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
