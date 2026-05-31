<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  createPost,
  deletePost,
  getPostForEdit,
  publishPost,
  updatePost,
  uploadBlogImage,
} from "../api/blog";
import { useAuthStore } from "../stores/auth";
import { renderMarkdown } from "../utils/markdown";
import AppIcon from "../components/AppIcon.vue";

type ViewMode = "edit" | "split" | "preview";
type SaveTarget = "draft" | "submit";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const title = ref("");
const body = ref("");
const excerpt = ref("");
const slug = ref("");
const tagsText = ref("");

const err = ref("");
const loading = ref(false);
const saving = ref(false);
const uploading = ref(false);
const dragOver = ref(false);
const viewMode = ref<ViewMode>("split");
const autosaveStatus = ref<"" | "saving" | "saved">("");
const showSettings = ref(false);

const toolbarIconSize = 20;

const bodyInput = ref<HTMLTextAreaElement | null>(null);
const editorRoot = ref<HTMLElement | null>(null);

const editId = computed(() => (typeof route.params.id === "string" ? route.params.id : ""));
const isEdit = computed(() => !!editId.value);
const draftKey = computed(() => `blog-draft:${editId.value || "new"}`);

const charCount = computed(() => body.value.length);
const wordCount = computed(
  () =>
    body.value
      .replace(/[#_*`\-\[\]()!>]/g, " ")
      .split(/\s+/)
      .filter(Boolean).length,
);
const readMinutes = computed(() => Math.max(1, Math.ceil(wordCount.value / 220)));
const previewHtml = computed(() => renderMarkdown(body.value));
const submitLabel = computed(() => (auth.role === "admin" ? "опубликовать" : "на модерацию"));

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

function parseCsv(input: string) {
  return input
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

async function loadForEdit() {
  if (!isEdit.value || !auth.token) {
    restoreDraft();
    return;
  }
  loading.value = true;
  try {
    const post = await getPostForEdit(editId.value, auth.token);
    title.value = post.title;
    body.value = post.body;
    excerpt.value = post.excerpt;
    slug.value = post.slug;
    tagsText.value = post.tags.join(", ");
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    loading.value = false;
  }
}

function snapshot() {
  return JSON.stringify({
    title: title.value,
    body: body.value,
    excerpt: excerpt.value,
    slug: slug.value,
    tagsText: tagsText.value,
  });
}

function restoreDraft() {
  try {
    const raw = localStorage.getItem(draftKey.value);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && typeof data === "object") {
      title.value = data.title || "";
      body.value = data.body || "";
      excerpt.value = data.excerpt || "";
      slug.value = data.slug || "";
      tagsText.value = data.tagsText || "";
    }
  } catch {
    /* ignore */
  }
}

function scheduleAutosave() {
  if (isEdit.value) return;
  autosaveStatus.value = "saving";
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(draftKey.value, snapshot());
      autosaveStatus.value = "saved";
    } catch {
      autosaveStatus.value = "";
    }
  }, 600);
}

function clearDraft() {
  try {
    localStorage.removeItem(draftKey.value);
  } catch {
    /* ignore */
  }
}

async function save(target: SaveTarget) {
  if (!auth.token || saving.value) return;
  err.value = "";
  saving.value = true;
  try {
    const payload = {
      title: title.value,
      body: body.value,
      excerpt: excerpt.value || undefined,
      slug: slug.value || undefined,
      status: target === "draft" ? ("draft" as const) : ("published" as const),
      tags: parseCsv(tagsText.value),
      categories: [] as string[],
    };

    if (isEdit.value) {
      const updated = await updatePost(editId.value, auth.token, payload);
      if (target === "submit" && updated.status !== "published") {
        await publishPost(updated.id, auth.token);
      }
      clearDraft();
      await router.push(`/blogs/${editId.value}`);
    } else {
      const created = await createPost(auth.token, payload);
      if (target === "submit" && created.status !== "published") {
        await publishPost(created.id, auth.token);
      }
      clearDraft();
      await router.push(`/blogs/${created.id}`);
    }
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!isEdit.value || !auth.token) return;
  if (!confirm("удалить пост?")) return;
  try {
    await deletePost(editId.value, auth.token);
    clearDraft();
    await router.push("/blogs");
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

async function uploadImageFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  if (!input.files?.length) return;
  await uploadAndInsert(input.files[0]);
  input.value = "";
}

async function uploadAndInsert(file: File) {
  if (!auth.token) return;
  if (!file.type.startsWith("image/")) return;
  try {
    uploading.value = true;
    const r = await uploadBlogImage(file, auth.token, editId.value || undefined);
    insertRaw(`\n![${file.name.replace(/\.[^.]+$/, "")}](${r.url})\n`);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    uploading.value = false;
  }
}

function onDrop(e: DragEvent) {
  dragOver.value = false;
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
  for (const f of files) void uploadAndInsert(f);
}

function onPaste(e: ClipboardEvent) {
  if (!e.clipboardData?.items) return;
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        e.preventDefault();
        void uploadAndInsert(file);
      }
    }
  }
}

function insertRaw(snippet: string) {
  const el = bodyInput.value;
  if (!el) {
    body.value = `${body.value}${snippet}`;
    return;
  }
  const start = el.selectionStart ?? body.value.length;
  const left = body.value.slice(0, start);
  const right = body.value.slice(start);
  body.value = `${left}${snippet}${right}`;
  nextTick(() => {
    const pos = left.length + snippet.length;
    el.focus();
    el.setSelectionRange(pos, pos);
  });
}

function insertWrap(prefix: string, suffix = prefix, placeholder = "текст") {
  const el = bodyInput.value;
  if (!el) {
    body.value += `${prefix}${placeholder}${suffix}`;
    return;
  }
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? start;
  const left = body.value.slice(0, start);
  const selected = body.value.slice(start, end) || placeholder;
  const right = body.value.slice(end);
  body.value = `${left}${prefix}${selected}${suffix}${right}`;
  nextTick(() => {
    const selStart = left.length + prefix.length;
    const selEnd = selStart + selected.length;
    el.focus();
    el.setSelectionRange(selStart, selEnd);
  });
}

function insertLine(prefix: string) {
  const el = bodyInput.value;
  if (!el) {
    body.value += `\n${prefix}`;
    return;
  }
  const start = el.selectionStart ?? 0;
  const before = body.value.slice(0, start);
  const after = body.value.slice(start);
  const needsBreak = before.length > 0 && !before.endsWith("\n");
  const lead = needsBreak ? "\n" : "";
  body.value = `${before}${lead}${prefix}${after}`;
  nextTick(() => {
    const pos = before.length + lead.length + prefix.length;
    bodyInput.value?.focus();
    bodyInput.value?.setSelectionRange(pos, pos);
  });
}

function insertBlock(block: string) {
  const el = bodyInput.value;
  if (!el) {
    body.value += `\n${block}\n`;
    return;
  }
  const start = el.selectionStart ?? 0;
  const before = body.value.slice(0, start);
  const after = body.value.slice(start);
  const lead = before.length > 0 && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
  body.value = `${before}${lead}${block}\n${after}`;
  nextTick(() => {
    const pos = before.length + lead.length + block.length + 1;
    bodyInput.value?.focus();
    bodyInput.value?.setSelectionRange(pos, pos);
  });
}

function addLink() {
  const url = prompt("url", "https://");
  if (!url) return;
  const el = bodyInput.value;
  if (!el) {
    body.value += `[link](${url})`;
    return;
  }
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? start;
  const left = body.value.slice(0, start);
  const selected = body.value.slice(start, end) || "ссылка";
  const right = body.value.slice(end);
  body.value = `${left}[${selected}](${url})${right}`;
}

function onKeydown(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const k = e.key.toLowerCase();
  if (k === "b") {
    e.preventDefault();
    insertWrap("**");
  } else if (k === "i") {
    e.preventDefault();
    insertWrap("*");
  } else if (k === "k") {
    e.preventDefault();
    addLink();
  } else if (k === "e") {
    e.preventDefault();
    insertWrap("`", "`", "code");
  } else if (k === "s") {
    e.preventDefault();
    void save("submit");
  } else if (k === "p" && e.shiftKey) {
    e.preventDefault();
    cycleViewMode();
  } else if (k === "enter" && e.shiftKey) {
    e.preventDefault();
    void save("submit");
  }
}

function cycleViewMode() {
  const order: ViewMode[] = ["edit", "split", "preview"];
  const idx = order.indexOf(viewMode.value);
  viewMode.value = order[(idx + 1) % order.length];
}

watch(
  [title, body, excerpt, slug, tagsText],
  () => scheduleAutosave(),
);

onMounted(() => {
  void loadForEdit();
});

onBeforeUnmount(() => {
  if (autosaveTimer) clearTimeout(autosaveTimer);
});
</script>

<template>
  <div ref="editorRoot" class="editor-shell">
    <header class="editor-top">
      <div class="editor-top-left">
        <span class="muted small">{{ wordCount }} слов · ~{{ readMinutes }} мин</span>
        <span v-if="autosaveStatus === 'saving'" class="muted small">сохраняем…</span>
        <span v-else-if="autosaveStatus === 'saved'" class="muted small">сохранено</span>
      </div>
      <div class="editor-top-right">
        <div class="seg">
          <button
            class="seg-btn"
            :class="{ active: viewMode === 'edit' }"
            type="button"
            @click="viewMode = 'edit'"
          >
            редактор
          </button>
          <button
            class="seg-btn"
            :class="{ active: viewMode === 'split' }"
            type="button"
            @click="viewMode = 'split'"
          >
            сплит
          </button>
          <button
            class="seg-btn"
            :class="{ active: viewMode === 'preview' }"
            type="button"
            @click="viewMode = 'preview'"
          >
            превью
          </button>
        </div>
        <button
          class="icon-only"
          type="button"
          :class="{ active: showSettings }"
          title="параметры"
          @click="showSettings = !showSettings"
        >
          <AppIcon name="settings" :size="16" />
        </button>
      </div>
    </header>

    <p v-if="err" class="error" style="margin: 0.5rem 0">{{ err }}</p>
    <p v-if="loading" class="muted">загрузка</p>

    <div v-if="showSettings" class="settings-panel card">
      <div class="form-grid">
        <label class="col-2">
          <span>заголовок</span>
          <input v-model="title" placeholder="заголовок" />
        </label>
        <label>
          <span>slug</span>
          <input v-model="slug" placeholder="auto" />
        </label>
        <label>
          <span>кратко</span>
          <input v-model="excerpt" placeholder="описание" />
        </label>
        <label class="col-2">
          <span>теги</span>
          <input v-model="tagsText" placeholder="через запятую" />
        </label>
      </div>
    </div>

    <div v-if="!showSettings" class="title-bar">
      <input
        v-model="title"
        class="title-input"
        placeholder="заголовок"
      />
    </div>

    <div class="toolbar" role="toolbar" aria-label="разметка">
      <div class="toolbar-group">
        <button class="tool-icon" type="button" title="жирный · ctrl+b" @click="insertWrap('**')">
          <AppIcon name="bold" :size="toolbarIconSize" />
        </button>
        <button class="tool-icon" type="button" title="курсив · ctrl+i" @click="insertWrap('*')">
          <AppIcon name="italic" :size="toolbarIconSize" />
        </button>
        <button class="tool-icon" type="button" title="код · ctrl+e" @click="insertWrap('`', '`', 'code')">
          <AppIcon name="code" :size="toolbarIconSize" />
        </button>
      </div>
      <div class="toolbar-group">
        <button class="tool-icon" type="button" title="заголовок" @click="insertLine('## ')">
          <AppIcon name="heading" :size="toolbarIconSize" />
        </button>
        <button class="tool-icon" type="button" title="список" @click="insertLine('- ')">
          <AppIcon name="list" :size="toolbarIconSize" />
        </button>
        <button class="tool-icon" type="button" title="цитата" @click="insertLine('> ')">
          <AppIcon name="quote" :size="toolbarIconSize" />
        </button>
      </div>
      <div class="toolbar-group toolbar-group-end">
        <button class="tool-icon" type="button" title="ссылка · ctrl+k" @click="addLink">
          <AppIcon name="link" :size="toolbarIconSize" />
        </button>
        <label class="tool-icon" title="картинка">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            @change="uploadImageFile"
          />
          <AppIcon name="image" :size="toolbarIconSize" />
        </label>
        <span v-if="uploading" class="muted small upload-hint">загрузка…</span>
      </div>
    </div>

    <div class="editor-body" :class="`mode-${viewMode}`">
      <div
        v-if="viewMode !== 'preview'"
        class="pane editor-pane"
        :class="{ 'drag-over': dragOver }"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop="onDrop"
      >
        <textarea
          ref="bodyInput"
          v-model="body"
          spellcheck="false"
          placeholder="markdown"
          @keydown="onKeydown"
          @paste="onPaste"
        />
      </div>
      <div v-if="viewMode !== 'edit'" class="pane preview-pane">
        <h1 v-if="title" class="preview-title">{{ title }}</h1>
        <div class="markdown-preview" v-html="previewHtml" />
        <p v-if="!body" class="muted small">превью</p>
      </div>
    </div>

    <footer class="editor-actions">
      <div class="actions">
        <button v-if="isEdit" class="secondary danger" type="button" @click="remove">удалить</button>
        <button type="button" :disabled="saving" @click="save('submit')">
          {{ saving ? "…" : submitLabel }}
        </button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.editor-shell {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.editor-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.6rem;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid var(--border);
}

.editor-top-left {
  display: inline-flex;
  align-items: center;
  gap: 0.85rem;
  flex-wrap: wrap;
}

.editor-top-right {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.seg {
  display: inline-flex;
  gap: 0.1rem;
}

.seg-btn {
  background: transparent;
  border: none;
  color: var(--muted);
  border-radius: 6px;
  padding: 0.3rem 0.55rem;
  min-height: 30px;
  font-weight: 500;
  font-size: 0.85rem;
  text-transform: lowercase;
}

.seg-btn:hover {
  color: var(--text);
  background: var(--surface);
}

.seg-btn.active {
  color: var(--text);
}

.icon-only {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  min-height: 30px;
  padding: 0;
  border-radius: 6px;
  background: transparent;
  border: none;
  color: var(--muted);
}

.icon-only:hover,
.icon-only.active {
  background: var(--surface);
  color: var(--text);
}

.title-bar {
  margin-top: 0.35rem;
}

.title-input {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 1.65rem;
  font-weight: 600;
  padding: 0.5rem 0;
  color: var(--text);
}

.title-input:focus {
  outline: none;
  box-shadow: none;
}

.settings-panel {
  padding: 1rem;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.7rem 1rem;
}

.form-grid label,
.form-grid > div {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.form-grid .col-2 {
  grid-column: 1 / -1;
}

.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.85rem;
  padding: 0.65rem 0 0.75rem;
  margin-top: 0.15rem;
  border-bottom: 1px solid var(--border);
}

.toolbar-group {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.toolbar-group-end {
  margin-left: auto;
  flex-wrap: wrap;
  row-gap: 0.35rem;
}

.tool-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  min-width: 2.5rem;
  min-height: 2.5rem;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius);
  color: var(--muted);
  cursor: pointer;
}

.tool-icon:hover {
  background: var(--surface);
  color: var(--text);
}

.upload-hint {
  margin-left: 0.35rem;
}

.editor-body {
  display: grid;
  gap: 0.75rem;
  min-height: 60vh;
}

.editor-body.mode-edit,
.editor-body.mode-preview {
  grid-template-columns: 1fr;
}

.editor-body.mode-split {
  grid-template-columns: 1fr 1fr;
}

@media (max-width: 900px) {
  .editor-body.mode-split {
    grid-template-columns: 1fr;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
}

.pane {
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mode-split .pane {
  border-left: 1px solid var(--border);
  padding-left: 1rem;
}
.mode-split .pane:first-child {
  border-left: none;
  padding-left: 0;
}

.editor-pane {
  position: relative;
}

.editor-pane.drag-over {
  outline: 1px dashed #444;
  outline-offset: -4px;
}

.editor-pane textarea {
  flex: 1;
  width: 100%;
  min-height: 60vh;
  border: none;
  background: transparent;
  resize: vertical;
  padding: 0.5rem 0;
  font-family: var(--mono);
  font-size: 0.92rem;
  line-height: 1.7;
  color: var(--text);
}

.editor-pane textarea:focus {
  outline: none;
}

.preview-pane {
  overflow: auto;
  padding: 0.5rem 0;
}

.preview-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
  line-height: 1.25;
}

.markdown-preview :deep(h1) {
  font-size: 1.5rem;
  margin-top: 1.1rem;
}
.markdown-preview :deep(h2) {
  font-size: 1.25rem;
  margin-top: 1rem;
}
.markdown-preview :deep(h3) {
  font-size: 1.1rem;
  margin-top: 0.9rem;
}
.markdown-preview :deep(p) {
  line-height: 1.65;
}
.markdown-preview :deep(blockquote) {
  border-left: 3px solid var(--border);
  padding: 0.1rem 0.9rem;
  color: var(--muted);
  margin: 0.5rem 0;
}
.markdown-preview :deep(code) {
  background: #131313;
  padding: 0.1rem 0.35rem;
  border-radius: 6px;
  font-family: var(--mono);
  font-size: 0.9em;
}
.markdown-preview :deep(pre) {
  background: #0d0d0d;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.8rem 0.9rem;
  overflow: auto;
}
.markdown-preview :deep(pre code) {
  background: transparent;
  padding: 0;
}
.markdown-preview :deep(img) {
  max-width: 100%;
  border-radius: 8px;
  border: 1px solid var(--border);
}
.markdown-preview :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.6rem 0;
}
.markdown-preview :deep(th),
.markdown-preview :deep(td) {
  border: 1px solid var(--border);
  padding: 0.4rem 0.6rem;
  text-align: left;
}
.markdown-preview :deep(hr) {
  border: none;
  border-top: 1px solid var(--border);
  margin: 1rem 0;
}
.markdown-preview :deep(ul),
.markdown-preview :deep(ol) {
  padding-left: 1.4rem;
}

.editor-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6rem;
  flex-wrap: wrap;
  padding-top: 0.8rem;
  border-top: 1px solid var(--border);
}

.actions {
  display: inline-flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.secondary.danger {
  color: var(--danger);
}

.small {
  font-size: 0.8rem;
}
</style>
