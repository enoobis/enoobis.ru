<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import { useReaderStore } from "../stores/reader";

GlobalWorkerOptions.workerPort = new PdfWorker();

const props = defineProps<{
  url: string;
  title: string;
}>();

const emit = defineEmits<{ close: [] }>();

const reader = useReaderStore();
const loading = ref(true);
const err = ref("");
const pageCount = ref(0);
const currentPage = ref(1);
const zoom = ref(1);
const scrollEl = ref<HTMLElement | null>(null);
const pageEls = ref<(HTMLElement | null)[]>([]);

let pdfDoc: PDFDocumentProxy | null = null;
let baseRatio = 1.414;
let observer: IntersectionObserver | null = null;
let reflowTimer: ReturnType<typeof setTimeout> | null = null;
let scrollRaf = 0;
let loadSeq = 0;
const rendered = new Set<number>();

function navOffset(): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--reader-top");
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 52;
}

function viewportBox() {
  const padX = window.innerWidth <= 640 ? 12 : 24;
  const padY = window.innerWidth <= 640 ? 8 : 16;
  const el = scrollEl.value;
  const w = el ? el.clientWidth - padX * 2 : window.innerWidth - padX * 2;
  const h = window.innerHeight - navOffset() - padY * 2;
  return {
    width: Math.max(200, w),
    height: Math.max(160, h),
  };
}

function pageCssSize(pageW: number, pageH: number) {
  const box = viewportBox();
  const fit = Math.min(box.width / pageW, box.height / pageH);
  const scale = fit * zoom.value;
  return {
    width: pageW * scale,
    height: pageH * scale,
  };
}

function setPlaceholders() {
  const box = viewportBox();
  const fit = Math.min(box.width, box.height / baseRatio);
  const cssWidth = fit * zoom.value;
  for (const el of pageEls.value) {
    if (!el) continue;
    el.style.width = `${cssWidth}px`;
    el.style.height = `${cssWidth * baseRatio}px`;
  }
}

async function renderPageInto(num: number) {
  if (!pdfDoc || rendered.has(num)) return;
  const wrap = pageEls.value[num - 1];
  if (!wrap) return;
  const canvas = wrap.querySelector("canvas") as HTMLCanvasElement | null;
  if (!canvas) return;
  const myDoc = pdfDoc;
  const page = await myDoc.getPage(num);
  if (pdfDoc !== myDoc) return;
  const base = page.getViewport({ scale: 1 });
  const { width: cssWidth, height: cssHeight } = pageCssSize(base.width, base.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  wrap.style.width = `${cssWidth}px`;
  wrap.style.height = `${cssHeight}px`;
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  rendered.add(num);
}

async function waitForLayout() {
  await nextTick();
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

async function waitForPageRefs() {
  for (let i = 0; i < 40; i++) {
    await nextTick();
    const last = pageCount.value - 1;
    if (pageEls.value[0] && (last < 0 || pageEls.value[last])) return;
  }
}

function scrollToPage(num: number) {
  const root = scrollEl.value;
  const el = pageEls.value[num - 1];
  if (!root || !el) return;
  const padTop = parseFloat(getComputedStyle(root).paddingTop || "0");
  const delta = el.getBoundingClientRect().top - root.getBoundingClientRect().top - padTop;
  root.scrollTop += delta;
}

function updateVisiblePage() {
  const root = scrollEl.value;
  if (!root || pageCount.value === 0) return;

  const rootRect = root.getBoundingClientRect();
  const anchorY = rootRect.top + Math.min(root.clientHeight * 0.12, 48);
  const viewTop = rootRect.top + 4;
  const viewBottom = rootRect.bottom - 4;

  let best = 0;
  let bestDist = Infinity;

  for (const el of pageEls.value) {
    if (!el) continue;
    const num = Number(el.dataset.page);
    if (!Number.isFinite(num) || num < 1) continue;
    const rect = el.getBoundingClientRect();
    if (rect.height <= 1) continue;
    if (rect.bottom <= viewTop || rect.top >= viewBottom) continue;
    const dist = Math.abs(rect.top - anchorY);
    if (dist < bestDist) {
      bestDist = dist;
      best = num;
    }
  }

  if (best === 0) {
    const gap = parseFloat(getComputedStyle(root).rowGap || getComputedStyle(root).gap || "12") || 12;
    let offset = 0;
    best = 1;
    for (let i = 0; i < pageEls.value.length; i++) {
      const el = pageEls.value[i];
      if (!el) continue;
      const h = el.getBoundingClientRect().height;
      if (h <= 1) continue;
      if (root.scrollTop < offset + h) {
        best = i + 1;
        break;
      }
      offset += h + gap;
      best = i + 1;
    }
  }

  if (currentPage.value !== best) {
    currentPage.value = best;
    reader.setPage(best, pageCount.value);
  }
}

function onScroll() {
  if (scrollRaf) cancelAnimationFrame(scrollRaf);
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0;
    updateVisiblePage();
  });
}

function setupObserver() {
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const num = Number((e.target as HTMLElement).dataset.page);
        if (Number.isFinite(num) && num >= 1) void renderPageInto(num);
      }
    },
    { root: scrollEl.value, rootMargin: "240px 0px", threshold: 0.01 },
  );
  for (const el of pageEls.value) if (el) observer.observe(el);
}

async function resetScrollAndShowFirstPage() {
  await waitForPageRefs();
  const root = scrollEl.value;
  if (!root) return;

  setPlaceholders();
  await waitForLayout();

  root.scrollTop = 0;
  await renderPageInto(1);
  if (pageCount.value > 1) void renderPageInto(2);

  await waitForLayout();
  root.scrollTop = 0;
  scrollToPage(1);

  setupObserver();
  updateVisiblePage();
}

function reflow() {
  const keepTop = scrollEl.value?.scrollTop ?? 0;
  rendered.clear();
  setPlaceholders();
  setupObserver();
  if (scrollEl.value) scrollEl.value.scrollTop = keepTop;
  void renderPageInto(currentPage.value || 1);
  updateVisiblePage();
}

function scheduleReflow() {
  if (reflowTimer) clearTimeout(reflowTimer);
  reflowTimer = setTimeout(reflow, 150);
}

function zoomIn() {
  zoom.value = Math.min(zoom.value + 0.15, 2.5);
  scheduleReflow();
}

function zoomOut() {
  zoom.value = Math.max(zoom.value - 0.15, 0.5);
  scheduleReflow();
}

function close() {
  emit("close");
}

async function loadPdf() {
  const seq = ++loadSeq;
  loading.value = true;
  err.value = "";
  rendered.clear();
  currentPage.value = 1;
  pageCount.value = 0;
  pageEls.value = [];
  pdfDoc?.cleanup();
  pdfDoc = null;
  reader.setPage(0, 0);
  try {
    const res = await fetch(props.url);
    if (seq !== loadSeq) return;
    if (!res.ok) {
      let code = "";
      try {
        const j = (await res.json()) as { error?: string };
        code = j.error ?? "";
      } catch {
        /* ignore */
      }
      throw new Error(code || "не удалось загрузить");
    }
    const buf = await res.arrayBuffer();
    if (seq !== loadSeq) return;
    const doc = await getDocument({ data: buf }).promise;
    if (seq !== loadSeq) {
      doc.cleanup();
      return;
    }
    pdfDoc = doc;
    const first = await pdfDoc.getPage(1);
    const v = first.getViewport({ scale: 1 });
    baseRatio = v.height / v.width;
    pageCount.value = pdfDoc.numPages;
    pageEls.value = Array.from({ length: pdfDoc.numPages }, () => null);
    loading.value = false;
    if (seq !== loadSeq) return;
    await resetScrollAndShowFirstPage();
    if (seq !== loadSeq) return;
  } catch (e) {
    if (seq !== loadSeq) return;
    err.value = e instanceof Error ? e.message : "ошибка";
    loading.value = false;
  }
}

function onKey(event: KeyboardEvent) {
  if (event.key === "Escape") close();
}

function onResize() {
  scheduleReflow();
}

watch(
  () => props.url,
  () => void loadPdf(),
);

watch(
  () => props.title,
  (t) => {
    if (reader.active) reader.title = t;
  },
);

watch(scrollEl, (el, prev) => {
  prev?.removeEventListener("scroll", onScroll);
  el?.addEventListener("scroll", onScroll, { passive: true });
});

onMounted(() => {
  reader.register({
    title: props.title,
    close,
    zoomIn,
    zoomOut,
  });
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);
  scrollEl.value?.addEventListener("scroll", onScroll, { passive: true });
  void loadPdf();
});

onBeforeUnmount(() => {
  reader.unregister();
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("resize", onResize);
  scrollEl.value?.removeEventListener("scroll", onScroll);
  if (scrollRaf) cancelAnimationFrame(scrollRaf);
  if (reflowTimer) clearTimeout(reflowTimer);
  observer?.disconnect();
  pdfDoc?.cleanup();
  pdfDoc = null;
});
</script>

<template>
  <div class="pdf-reader" role="dialog" aria-modal="true" :aria-label="title">
    <div ref="scrollEl" class="pdf-body">
      <p v-if="loading" class="pdf-state">
        <span class="spinner" aria-hidden="true" /> загрузка
      </p>
      <p v-else-if="err" class="pdf-state error">{{ err }}</p>
      <template v-else>
        <div
          v-for="n in pageCount"
          :key="n"
          :ref="(el) => {
            pageEls[n - 1] = (el as HTMLElement | null) ?? null;
          }"
          class="pdf-page-wrap"
          :data-page="n"
        >
          <canvas class="pdf-canvas" />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.pdf-reader {
  position: fixed;
  top: var(--reader-top, 52px);
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 90;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.pdf-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overflow-anchor: none;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
}

.pdf-state {
  margin: auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--muted);
}

.pdf-page-wrap {
  flex-shrink: 0;
  background: #fff;
  border-radius: 2px;
  box-shadow: 0 0 0 1px var(--border);
  overflow: hidden;
}

.pdf-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

@media (max-width: 640px) {
  .pdf-body {
    padding: 0.4rem;
    gap: 0.5rem;
  }
}
</style>
