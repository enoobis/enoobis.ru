<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import { useReaderStore } from "../stores/reader";
import { useAuthStore } from "../stores/auth";
import { getReaderProgress, setReaderProgress } from "../utils/readerProgress";

GlobalWorkerOptions.workerPort = new PdfWorker();

const props = defineProps<{
  url: string;
  title: string;
  progressKey?: string;
}>();

const emit = defineEmits<{ close: [] }>();

const reader = useReaderStore();
const auth = useAuthStore();
const loading = ref(true);
const err = ref("");
const pageCount = ref(0);
const currentPage = ref(1);
const zoom = ref(1);
const stageEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const pageLayouts = ref<{ width: number; height: number }[]>([]);

let pdfDoc: PDFDocumentProxy | null = null;
let pageRawSizes: { w: number; h: number }[] = [];
let reflowTimer: ReturnType<typeof setTimeout> | null = null;
let loadSeq = 0;
let renderSeq = 0;

function storageKey(): string | null {
  if (!props.progressKey) return null;
  const uid = auth.user?.id ?? "local";
  return `${uid}:${props.progressKey}`;
}

const activeLayout = computed(() => pageLayouts.value[currentPage.value - 1] ?? null);

function navOffset(): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--reader-top");
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 52;
}

function viewportBox() {
  const padX = window.innerWidth <= 640 ? 12 : 24;
  const padY = window.innerWidth <= 640 ? 8 : 16;
  const el = stageEl.value;
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

function rebuildLayouts() {
  pageLayouts.value = pageRawSizes.map(({ w, h }) => pageCssSize(w, h));
}

function persistProgress() {
  const key = storageKey();
  if (!key || pageCount.value === 0) return;
  setReaderProgress(key, currentPage.value);
}

function savedStartPage(): number {
  const key = storageKey();
  if (!key) return 1;
  return getReaderProgress(key) ?? 1;
}

async function loadPageMetrics(doc: PDFDocumentProxy, seq: number) {
  const raw: { w: number; h: number }[] = new Array(doc.numPages);
  const batch = 20;
  for (let start = 1; start <= doc.numPages; start += batch) {
    if (seq !== loadSeq) return;
    const end = Math.min(start + batch - 1, doc.numPages);
    const nums = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    const pages = await Promise.all(nums.map((n) => doc.getPage(n)));
    for (let i = 0; i < pages.length; i++) {
      const v = pages[i].getViewport({ scale: 1 });
      raw[start - 1 + i] = { w: v.width, h: v.height };
    }
  }
  pageRawSizes = raw;
  rebuildLayouts();
}

async function renderCurrentPage() {
  const num = currentPage.value;
  const canvas = canvasEl.value;
  if (!pdfDoc || !canvas || num < 1 || num > pageCount.value) return;

  const seq = ++renderSeq;
  const myDoc = pdfDoc;
  try {
    const page = await myDoc.getPage(num);
    if (pdfDoc !== myDoc || seq !== renderSeq) return;
    const base = page.getViewport({ scale: 1 });
    const { width: cssWidth, height: cssHeight } = pageCssSize(base.width, base.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
    const ctx = canvas.getContext("2d");
    if (!ctx || seq !== renderSeq) return;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  } catch {
    /* next navigation will retry */
  }
}

async function waitForLayout() {
  await nextTick();
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function setPage(num: number, save = true) {
  const next = Math.max(1, Math.min(num, pageCount.value || 1));
  if (next === currentPage.value) return;
  currentPage.value = next;
  reader.setPage(next, pageCount.value);
  if (save) persistProgress();
  void renderCurrentPage();
}

function prevPage() {
  if (currentPage.value <= 1) return;
  setPage(currentPage.value - 1);
}

function nextPage() {
  if (currentPage.value >= pageCount.value) return;
  setPage(currentPage.value + 1);
}

function onTap(event: MouseEvent) {
  if (loading.value || err.value) return;
  const root = stageEl.value;
  if (!root) return;
  const rect = root.getBoundingClientRect();
  const x = event.clientX - rect.left;
  if (x < rect.width * 0.38) prevPage();
  else if (x > rect.width * 0.62) nextPage();
}

async function openAtPage(num: number) {
  await waitForLayout();
  const start = Math.max(1, Math.min(num, pageCount.value));
  currentPage.value = start;
  reader.setPage(start, pageCount.value);
  await renderCurrentPage();
}

function reflow() {
  rebuildLayouts();
  void nextTick().then(async () => {
    await waitForLayout();
    await renderCurrentPage();
  });
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
  persistProgress();
  emit("close");
}

async function loadPdf() {
  const seq = ++loadSeq;
  loading.value = true;
  err.value = "";
  currentPage.value = 1;
  pageCount.value = 0;
  pageLayouts.value = [];
  pageRawSizes = [];
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
    pageCount.value = doc.numPages;
    await loadPageMetrics(doc, seq);
    if (seq !== loadSeq) return;
    loading.value = false;
    if (seq !== loadSeq) return;
    await openAtPage(savedStartPage());
    if (seq !== loadSeq) return;
  } catch (e) {
    if (seq !== loadSeq) return;
    err.value = e instanceof Error ? e.message : "ошибка";
    loading.value = false;
  }
}

function onKey(event: KeyboardEvent) {
  if (event.key === "Escape") close();
  if (event.key === "ArrowLeft" || event.key === "PageUp") prevPage();
  if (event.key === "ArrowRight" || event.key === "PageDown") nextPage();
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

onMounted(() => {
  reader.register({
    title: props.title,
    close,
    zoomIn,
    zoomOut,
  });
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);
  void loadPdf();
});

onBeforeUnmount(() => {
  persistProgress();
  reader.unregister();
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("resize", onResize);
  if (reflowTimer) clearTimeout(reflowTimer);
  pdfDoc?.cleanup();
  pdfDoc = null;
});
</script>

<template>
  <div class="pdf-reader" role="dialog" aria-modal="true" :aria-label="title">
    <div
      ref="stageEl"
      class="pdf-stage"
      @click="onTap"
    >
      <p v-if="loading" class="pdf-state">
        <span class="spinner" aria-hidden="true" /> загрузка
      </p>
      <p v-else-if="err" class="pdf-state error">{{ err }}</p>
      <div
        v-else-if="activeLayout"
        class="pdf-page-wrap"
        :style="{
          width: `${activeLayout.width}px`,
          height: `${activeLayout.height}px`,
        }"
      >
        <canvas ref="canvasEl" class="pdf-canvas" />
      </div>
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

.pdf-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem;
  touch-action: manipulation;
  user-select: none;
  cursor: default;
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
  background: var(--surface);
  border-radius: 2px;
  box-shadow: 0 0 0 1px var(--border);
  overflow: hidden;
}

.pdf-canvas {
  display: block;
  vertical-align: top;
}

@media (max-width: 640px) {
  .pdf-stage {
    padding: 0.4rem;
  }
}
</style>
