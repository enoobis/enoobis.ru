<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import AppIcon from "./AppIcon.vue";

GlobalWorkerOptions.workerPort = new PdfWorker();

const props = defineProps<{
  url: string;
  title: string;
}>();

const emit = defineEmits<{ close: [] }>();

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
const rendered = new Set<number>();

function containerWidth(): number {
  const el = scrollEl.value;
  const pad = window.innerWidth <= 640 ? 16 : 48;
  const w = el ? el.clientWidth - pad : 800;
  return Math.max(280, Math.min(w, 1000));
}

function setPlaceholders() {
  const cssWidth = containerWidth() * zoom.value;
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
  const page = await pdfDoc.getPage(num);
  const base = page.getViewport({ scale: 1 });
  const cssWidth = containerWidth() * zoom.value;
  const cssHeight = (cssWidth * base.height) / base.width;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  wrap.style.height = `${cssHeight}px`;
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  rendered.add(num);
}

function setupObserver() {
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const num = Number((e.target as HTMLElement).dataset.page);
        if (e.isIntersecting) {
          void renderPageInto(num);
          currentPage.value = num;
        }
      }
    },
    { root: scrollEl.value, rootMargin: "800px 0px" },
  );
  for (const el of pageEls.value) if (el) observer.observe(el);
}

function reflow() {
  rendered.clear();
  setPlaceholders();
  setupObserver();
}

function scheduleReflow() {
  if (reflowTimer) clearTimeout(reflowTimer);
  reflowTimer = setTimeout(reflow, 150);
}

function zoomIn() {
  zoom.value = Math.min(zoom.value + 0.2, 3);
  scheduleReflow();
}

function zoomOut() {
  zoom.value = Math.max(zoom.value - 0.2, 0.6);
  scheduleReflow();
}

async function loadPdf() {
  loading.value = true;
  err.value = "";
  rendered.clear();
  currentPage.value = 1;
  pageCount.value = 0;
  pageEls.value = [];
  pdfDoc?.cleanup();
  pdfDoc = null;
  try {
    const res = await fetch(props.url);
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
    pdfDoc = await getDocument({ data: buf }).promise;
    const first = await pdfDoc.getPage(1);
    const v = first.getViewport({ scale: 1 });
    baseRatio = v.height / v.width;
    pageCount.value = pdfDoc.numPages;
    loading.value = false;
    await nextTick();
    setPlaceholders();
    setupObserver();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
    loading.value = false;
  }
}

function onKey(event: KeyboardEvent) {
  if (event.key === "Escape") emit("close");
}

function onResize() {
  scheduleReflow();
}

watch(
  () => props.url,
  () => void loadPdf(),
);

onMounted(() => {
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);
  void loadPdf();
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("resize", onResize);
  if (reflowTimer) clearTimeout(reflowTimer);
  observer?.disconnect();
  pdfDoc?.cleanup();
  pdfDoc = null;
});
</script>

<template>
  <div class="pdf-reader" role="dialog" aria-modal="true" :aria-label="title">
    <header class="pdf-head">
      <button type="button" class="pdf-icon" aria-label="закрыть" @click="emit('close')">
        <AppIcon name="back" :size="20" />
      </button>
      <span class="pdf-title">{{ title }}</span>
      <span v-if="pageCount > 0" class="pdf-page">{{ currentPage }} / {{ pageCount }}</span>
      <div class="pdf-zoom">
        <button type="button" class="pdf-icon" aria-label="уменьшить" @click="zoomOut">
          <span class="glyph">−</span>
        </button>
        <button type="button" class="pdf-icon" aria-label="увеличить" @click="zoomIn">
          <span class="glyph">+</span>
        </button>
      </div>
    </header>

    <div ref="scrollEl" class="pdf-body">
      <p v-if="loading" class="pdf-state">
        <span class="spinner" aria-hidden="true" /> загрузка
      </p>
      <p v-else-if="err" class="pdf-state error">{{ err }}</p>
      <template v-else>
        <div
          v-for="n in pageCount"
          :key="n"
          :ref="(el) => (pageEls[n - 1] = el as HTMLElement | null)"
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
  inset: 0;
  z-index: 90;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.pdf-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.pdf-title {
  flex: 1;
  min-width: 0;
  font-size: 0.95rem;
  font-weight: 600;
  text-transform: lowercase;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pdf-page {
  font-size: 0.85rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.pdf-zoom {
  display: inline-flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

.pdf-icon {
  min-height: 40px;
  width: 40px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text);
}
.pdf-icon:hover {
  background: var(--surface2);
  transform: none;
}
.glyph {
  font-size: 1.2rem;
  font-weight: 600;
  line-height: 1;
}

.pdf-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
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
    gap: 0.4rem;
  }
}
</style>
