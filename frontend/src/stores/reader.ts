import { defineStore } from "pinia";
import { ref } from "vue";

export const useReaderStore = defineStore("reader", () => {
  const active = ref(false);
  const title = ref("");
  const page = ref(0);
  const pageCount = ref(0);

  let closeFn: (() => void) | null = null;
  let zoomInFn: (() => void) | null = null;
  let zoomOutFn: (() => void) | null = null;

  function register(opts: {
    title: string;
    close: () => void;
    zoomIn: () => void;
    zoomOut: () => void;
  }) {
    active.value = true;
    title.value = opts.title;
    page.value = 0;
    pageCount.value = 0;
    closeFn = opts.close;
    zoomInFn = opts.zoomIn;
    zoomOutFn = opts.zoomOut;
  }

  function unregister() {
    active.value = false;
    title.value = "";
    page.value = 0;
    pageCount.value = 0;
    closeFn = null;
    zoomInFn = null;
    zoomOutFn = null;
  }

  function setPage(current: number, total: number) {
    page.value = current;
    pageCount.value = total;
  }

  function close() {
    closeFn?.();
  }

  function zoomIn() {
    zoomInFn?.();
  }

  function zoomOut() {
    zoomOutFn?.();
  }

  return { active, title, page, pageCount, register, unregister, setPage, close, zoomIn, zoomOut };
});
