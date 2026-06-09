<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { getShare, shareDownloadUrl, shareReadUrl, type SharePayload } from "../api/storage";
import { renderMarkdown } from "../utils/markdown";
import PdfReader from "../components/PdfReader.vue";

const route = useRoute();

const data = ref<SharePayload | null>(null);
const loading = ref(true);
const errCode = ref("");

const readerOpen = ref(false);
const readerUrl = ref<string | null>(null);

const tokenStr = computed(() => String(route.params.token ?? ""));

const isPdfShare = computed(() => {
  if (data.value?.kind !== "file") return false;
  const m = (data.value.file.mime_type || "").toLowerCase();
  if (m.includes("pdf")) return true;
  return data.value.file.original_name.toLowerCase().endsWith(".pdf");
});

const ttlText = computed(() => {
  const exp = data.value?.expires_at;
  if (!exp) return "без срока";
  const ms = Date.parse(exp) - Date.now();
  if (ms <= 0) return "истекает";
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  if (d >= 1) return `ещё ${d} д`;
  if (h >= 1) return `ещё ${h} ч`;
  return `ещё ${Math.floor(ms / 60000)} мин`;
});

const renderedBody = computed(() =>
  data.value?.kind === "note" ? renderMarkdown(data.value.note.body) : "",
);

function fmt(n: number) {
  if (n < 1024) return `${n} б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} кб`;
  return `${(n / 1024 / 1024).toFixed(1)} мб`;
}

function openReader() {
  if (!isPdfShare.value) return;
  readerUrl.value = shareReadUrl(tokenStr.value);
  readerOpen.value = true;
}

function closeReader() {
  readerOpen.value = false;
  readerUrl.value = null;
}

onMounted(async () => {
  try {
    data.value = await getShare(tokenStr.value);
  } catch (e) {
    errCode.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    loading.value = false;
  }
});

watch(readerOpen, (open) => {
  document.documentElement.style.overflow = open ? "hidden" : "";
});

onBeforeUnmount(() => {
  document.documentElement.style.overflow = "";
  closeReader();
});
</script>

<template>
  <section class="shared">
    <p v-if="loading" class="muted">загрузка</p>

    <template v-else-if="errCode">
      <h1>ссылка недоступна</h1>
      <p class="muted">{{ errCode === "expired" ? "истёк срок" : errCode === "not_found" ? "не найдено" : errCode }}</p>
    </template>

    <template v-else-if="data?.kind === 'file'">
      <h1>{{ data.file.original_name }}</h1>
      <p class="muted">
        {{ fmt(data.file.size_bytes) }} · от @{{ data.owner_nickname }} · {{ ttlText }}
      </p>
      <div class="file-actions">
        <button v-if="isPdfShare" type="button" class="btn-link" @click="openReader">читать</button>
        <a :href="shareDownloadUrl(tokenStr)" class="btn-link">скачать</a>
      </div>
    </template>

    <template v-else-if="data?.kind === 'note'">
      <h1>{{ data.note.title || "заметка" }}</h1>
      <p class="muted">от @{{ data.owner_nickname }} · {{ ttlText }}</p>
      <article v-if="renderedBody" class="markdown-body" v-html="renderedBody" />
      <pre v-else class="plain">{{ data.note.body }}</pre>
    </template>

    <PdfReader
      v-if="readerOpen && readerUrl"
      :url="readerUrl"
      :title="data?.kind === 'file' ? data.file.original_name : ''"
      @close="closeReader"
    />
  </section>
</template>

<style scoped>
.shared {
  display: grid;
  gap: 0.65rem;
}

.file-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.btn-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.55rem 1rem;
  background: var(--surface);
  color: var(--text);
  width: max-content;
  text-transform: lowercase;
}

.btn-link:hover {
  background: var(--surface2);
}

.markdown-body {
  border-top: 1px solid var(--border);
  padding-top: 0.85rem;
}

.plain {
  white-space: pre-wrap;
  font-family: var(--mono, ui-monospace, monospace);
  font-size: 0.9rem;
  margin: 0;
  border-top: 1px solid var(--border);
  padding-top: 0.85rem;
}
</style>
