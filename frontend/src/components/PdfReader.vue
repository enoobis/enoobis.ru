<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import AppIcon from "./AppIcon.vue";

GlobalWorkerOptions.workerSrc = pdfWorker;

const props = defineProps<{
  url: string;
  title: string;
}>();

const emit = defineEmits<{ close: [] }>();

const loading = ref(true);
const err = ref("");
const pageNum = ref(1);
const pageCount = ref(0);
const scale = ref(1.15);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const scrollEl = ref<HTMLElement | null>(null);

let pdfDoc: PDFDocumentProxy | null = null;

async function loadPdf() {
  loading.value = true;
  err.value = "";
  pageNum.value = 1;
  pageCount.value = 0;
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
    pageCount.value = pdfDoc.numPages;
    await renderPage();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    loading.value = false;
  }
}

async function renderPage() {
  if (!pdfDoc || !canvasEl.value) return;
  const page = await pdfDoc.getPage(pageNum.value);
  const viewport = page.getViewport({ scale: scale.value });
  const canvas = canvasEl.value;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  scrollEl.value?.scrollTo({ top: 0, behavior: "smooth" });
}

function prevPage() {
  if (pageNum.value <= 1) return;
  pageNum.value -= 1;
  void renderPage();
}

function nextPage() {
  if (pageNum.value >= pageCount.value) return;
  pageNum.value += 1;
  void renderPage();
}

function zoomIn() {
  scale.value = Math.min(scale.value + 0.15, 2.5);
  void renderPage();
}

function zoomOut() {
  scale.value = Math.max(scale.value - 0.15, 0.75);
  void renderPage();
}

function onKey(event: KeyboardEvent) {
  if (event.key === "Escape") {
    emit("close");
    return;
  }
  if (event.key === "ArrowLeft") prevPage();
  if (event.key === "ArrowRight") nextPage();
}

watch(
  () => props.url,
  () => void loadPdf(),
);

onMounted(() => {
  window.addEventListener("keydown", onKey);
  void loadPdf();
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  pdfDoc?.cleanup();
  pdfDoc = null;
});
</script>

<template>
  <div class="pdf-reader" role="dialog" aria-modal="true" :aria-label="title">
    <header class="pdf-head glass">
      <span class="pdf-title">{{ title }}</span>
      <div v-if="pageCount > 0" class="pdf-controls">
        <button type="button" class="secondary icon-only" :disabled="pageNum <= 1" aria-label="назад" @click="prevPage">
          <AppIcon name="back" :size="20" />
        </button>
        <span class="pdf-page">{{ pageNum }} / {{ pageCount }}</span>
        <button
          type="button"
          class="secondary icon-only"
          :disabled="pageNum >= pageCount"
          aria-label="вперёд"
          @click="nextPage"
        >
          <span class="flip"><AppIcon name="back" :size="20" /></span>
        </button>
        <span class="pdf-sep" aria-hidden="true" />
        <button type="button" class="secondary icon-only" aria-label="уменьшить" @click="zoomOut">
          <span class="zoom-glyph">−</span>
        </button>
        <button type="button" class="secondary icon-only" aria-label="увеличить" @click="zoomIn">
          <span class="zoom-glyph">+</span>
        </button>
      </div>
      <button type="button" class="secondary icon-only pdf-close" aria-label="закрыть" @click="emit('close')">
        <AppIcon name="close" :size="20" />
      </button>
    </header>

    <div ref="scrollEl" class="pdf-body">
      <p v-if="loading" class="pdf-state">
        <span class="spinner" aria-hidden="true" /> загрузка
      </p>
      <p v-else-if="err" class="pdf-state error">{{ err }}</p>
      <div v-else class="pdf-page-wrap">
        <canvas ref="canvasEl" class="pdf-canvas" />
      </div>
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
  gap: 0.75rem;
  padding: 0.55rem 0.85rem;
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

.pdf-controls {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.pdf-page {
  min-width: 4.5rem;
  text-align: center;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.pdf-sep {
  width: 1px;
  height: 1.25rem;
  background: var(--border);
  margin: 0 0.15rem;
}

.icon-only {
  min-height: 36px;
  width: 36px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.icon-only:hover {
  transform: none;
}

.pdf-close {
  flex-shrink: 0;
}

.flip {
  transform: rotate(180deg);
}

.zoom-glyph {
  font-size: 1.1rem;
  font-weight: 600;
  line-height: 1;
}

.pdf-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  justify-content: center;
  padding: 1rem;
}

.pdf-state {
  margin: auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--muted);
}

.pdf-page-wrap {
  margin: auto;
}

.pdf-canvas {
  display: block;
  max-width: 100%;
  height: auto;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

@media (max-width: 640px) {
  .pdf-head {
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .pdf-title {
    flex: 1 1 100%;
    order: -1;
  }
  .pdf-controls {
    flex: 1;
    justify-content: center;
  }
  .pdf-body {
    padding: 0.5rem;
  }
}
</style>
