import { onUnmounted, ref } from "vue";

/** одноразовый класс-триггер для css-анимации нажатия */
export function usePop(duration = 480) {
  const popped = ref<string | null>(null);
  let timer = 0;
  let frame = 0;

  function pop(key: string) {
    window.clearTimeout(timer);
    cancelAnimationFrame(frame);
    popped.value = null;
    frame = requestAnimationFrame(() => {
      popped.value = key;
      timer = window.setTimeout(() => {
        popped.value = null;
      }, duration);
    });
  }

  onUnmounted(() => {
    window.clearTimeout(timer);
    cancelAnimationFrame(frame);
  });

  return { popped, pop };
}
