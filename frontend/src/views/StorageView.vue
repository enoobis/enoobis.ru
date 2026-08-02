<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  deleteFile,
  downloadFile,
  fileReadUrl,
  listFiles,
  uploadFile,
  type StoredFile,
} from "../api/files";
import {
  createNote,
  createShare,
  deleteNote,
  deleteShare,
  listNotes,
  listShares,
  shareReadUrl,
  updateNote,
  type Note,
  type ShareLink,
  type ShareTtl,
} from "../api/storage";
import AppIcon from "../components/AppIcon.vue";
import AppLoading from "../components/AppLoading.vue";
import PageHeader from "../components/PageHeader.vue";
import PdfReader from "../components/PdfReader.vue";
import { useAuthStore } from "../stores/auth";
import { filePreviewKind } from "../utils/filePreview";
import { toastError, toastSuccess } from "../utils/toast";

type Section = "files" | "notes";

const auth = useAuthStore();

const section = ref<Section>("files");
const canBlogAndStorage = computed(() => auth.canBlogAndStorage);

const files = ref<StoredFile[]>([]);
const used = ref(0);
const quota = ref(30 * 1024 * 1024);
const filesLoading = ref(false);
const uploading = ref(false);
const dragOver = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const notes = ref<Note[]>([]);
const notesLoading = ref(false);
const editingNote = ref<Note | null>(null);
const noteTitle = ref("");
const noteBody = ref("");

const shares = ref<ShareLink[]>([]);
const sharePicker = ref<{ type: "file" | "note"; id: string } | null>(null);
const shareDirectMode = ref(false);

const sharePickerFile = computed(() => {
  const p = sharePicker.value;
  if (!p || p.type !== "file") return null;
  return files.value.find((f) => f.id === p.id) ?? null;
});

const err = ref("");

const readerOpen = ref(false);
const readerUrl = ref<string | null>(null);
const readerTitle = ref("");
const readerProgressKey = ref<string | null>(null);

const mediaOpen = ref(false);
const mediaUrl = ref("");
const mediaKind = ref<"image" | "video" | null>(null);
const mediaTitle = ref("");

const mediaFullUrl = computed(() => {
  if (!mediaUrl.value) return "";
  if (mediaUrl.value.startsWith("http")) return mediaUrl.value;
  return `${window.location.origin}${mediaUrl.value}`;
});

const usedPercent = computed(() =>
  quota.value > 0 ? Math.min(100, Math.round((used.value / quota.value) * 100)) : 0,
);

function fmt(n: number) {
  if (n < 1024) return `${n} б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} кб`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} мб`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} гб`;
}

function describe(code: string) {
  if (code === "quota_exceeded") return "не хватает места";
  if (code === "file_too_large") return "файл слишком большой";
  if (code === "note_too_long") return "заметка слишком длинная";
  if (code === "read_only_pdf") return "чтение только для pdf";
  if (code === "preview_not_supported") return "просмотр недоступен";
  return code || "ошибка";
}

function canPreview(f: StoredFile) {
  return filePreviewKind(f.mime_type, f.original_name) !== null;
}

function canDirectLink(f: StoredFile) {
  const k = filePreviewKind(f.mime_type, f.original_name);
  return k === "video" || k === "image";
}

function sharePageUrl(token: string) {
  return `${window.location.origin}/s/${token}`;
}

function shareMediaUrl(token: string) {
  return `${window.location.origin}${shareReadUrl(token)}`;
}

async function copyText(url: string, msg: string) {
  await navigator.clipboard.writeText(url).catch(() => undefined);
  toastSuccess(msg);
}

async function openPreview(f: StoredFile) {
  if (!auth.token || !canPreview(f)) return;
  err.value = "";
  try {
    const { url, preview_kind } = await fileReadUrl(f.id, auth.token);
    if (preview_kind === "pdf") {
      readerTitle.value = f.original_name;
      readerProgressKey.value = f.id;
      readerUrl.value = url;
      readerOpen.value = true;
      return;
    }
    mediaTitle.value = f.original_name;
    mediaUrl.value = url;
    mediaKind.value = preview_kind;
    mediaOpen.value = true;
  } catch (e) {
    err.value = describe(e instanceof Error ? e.message : "ошибка");
  }
}

function closeReader() {
  readerOpen.value = false;
  readerUrl.value = null;
  readerTitle.value = "";
  readerProgressKey.value = null;
}

function closeMedia() {
  mediaOpen.value = false;
  mediaUrl.value = "";
  mediaKind.value = null;
  mediaTitle.value = "";
}

function closeAllPreview() {
  closeReader();
  closeMedia();
}

async function loadFiles() {
  if (!auth.token) return;
  filesLoading.value = true;
  try {
    const r = await listFiles(auth.token);
    files.value = r.items;
    used.value = r.used;
    quota.value = r.quota;
  } catch (e) {
    err.value = describe(e instanceof Error ? e.message : "ошибка");
  } finally {
    filesLoading.value = false;
  }
}

async function loadNotes() {
  if (!auth.token) return;
  notesLoading.value = true;
  try {
    const r = await listNotes(auth.token);
    notes.value = r.items;
  } catch (e) {
    err.value = describe(e instanceof Error ? e.message : "ошибка");
  } finally {
    notesLoading.value = false;
  }
}

async function loadShares() {
  if (!auth.token) return;
  try {
    const r = await listShares(auth.token);
    shares.value = r.items;
  } catch {
    /* ignore */
  }
}

async function onPickFiles(list: FileList | null) {
  if (!list || !auth.token) return;
  err.value = "";
  uploading.value = true;
  try {
    for (const f of Array.from(list)) {
      try {
        const created = await uploadFile(auth.token, f);
        files.value = [created, ...files.value];
        used.value += created.size_bytes;
      } catch (e) {
        err.value = describe(e instanceof Error ? e.message : "ошибка");
      }
    }
  } finally {
    uploading.value = false;
  }
}

function onFileInputChange(ev: Event) {
  const input = ev.target as HTMLInputElement;
  void onPickFiles(input.files);
  input.value = "";
}

function onDrop(ev: DragEvent) {
  ev.preventDefault();
  dragOver.value = false;
  void onPickFiles(ev.dataTransfer?.files ?? null);
}

async function onDeleteFile(f: StoredFile) {
  if (!auth.token) return;
  if (!confirm(`удалить ${f.original_name}?`)) return;
  try {
    await deleteFile(auth.token, f.id);
    files.value = files.value.filter((x) => x.id !== f.id);
    used.value = Math.max(0, used.value - f.size_bytes);
    shares.value = shares.value.filter((s) => !(s.target_type === "file" && s.target_id === f.id));
  } catch (e) {
    err.value = describe(e instanceof Error ? e.message : "ошибка");
  }
}

async function onDownload(f: StoredFile) {
  if (!auth.token) return;
  try {
    await downloadFile(auth.token, f.id, f.original_name);
  } catch (e) {
    err.value = describe(e instanceof Error ? e.message : "ошибка");
  }
}

function openNew() {
  editingNote.value = null;
  noteTitle.value = "";
  noteBody.value = "";
}

function openEdit(n: Note) {
  editingNote.value = n;
  noteTitle.value = n.title;
  noteBody.value = n.body;
}

async function saveNote() {
  if (!auth.token) return;
  err.value = "";
  try {
    if (editingNote.value) {
      const upd = await updateNote(auth.token, editingNote.value.id, {
        title: noteTitle.value,
        body: noteBody.value,
      });
      notes.value = notes.value.map((n) => (n.id === upd.id ? upd : n));
      toastSuccess("сохранено");
    } else {
      const created = await createNote(auth.token, {
        title: noteTitle.value,
        body: noteBody.value,
      });
      notes.value = [created, ...notes.value];
      toastSuccess("создано");
    }
    editingNote.value = null;
    noteTitle.value = "";
    noteBody.value = "";
  } catch (e) {
    err.value = describe(e instanceof Error ? e.message : "ошибка");
    toastError(e);
  }
}

async function onDeleteNote(n: Note) {
  if (!auth.token) return;
  if (!confirm("удалить заметку?")) return;
  try {
    await deleteNote(auth.token, n.id);
    notes.value = notes.value.filter((x) => x.id !== n.id);
    shares.value = shares.value.filter((s) => !(s.target_type === "note" && s.target_id === n.id));
    if (editingNote.value?.id === n.id) editingNote.value = null;
  } catch (e) {
    err.value = describe(e instanceof Error ? e.message : "ошибка");
  }
}

function shareFor(targetType: "file" | "note", id: string) {
  return shares.value.find((s) => s.target_type === targetType && s.target_id === id);
}

function foreverShareForFile(fileId: string) {
  return shares.value.find(
    (s) => s.target_type === "file" && s.target_id === fileId && !s.expires_at,
  );
}

function openShare(type: "file" | "note", id: string) {
  const file = type === "file" ? files.value.find((f) => f.id === id) : null;
  shareDirectMode.value = !!file && canDirectLink(file);
  sharePicker.value = { type, id };
}

async function ensureForeverFileShare(fileId: string): Promise<ShareLink | null> {
  if (!auth.token) return null;
  const existing = foreverShareForFile(fileId);
  if (existing) return existing;
  const created = await createShare(auth.token, {
    target_type: "file",
    target_id: fileId,
    ttl: "forever",
  });
  shares.value = [created, ...shares.value];
  return created;
}

async function copyDirectFileLink(f: StoredFile) {
  if (!auth.token || !canDirectLink(f)) return;
  err.value = "";
  try {
    const s = await ensureForeverFileShare(f.id);
    if (!s) return;
    await copyText(shareMediaUrl(s.token), "ссылка скопирована");
  } catch (e) {
    err.value = describe(e instanceof Error ? e.message : "ошибка");
    toastError(e);
  }
}

async function makeShare(ttl: ShareTtl) {
  if (!auth.token || !sharePicker.value) return;
  try {
    const picked = sharePicker.value;
    const pickedFile = picked.type === "file" ? files.value.find((f) => f.id === picked.id) : null;
    const direct = shareDirectMode.value && !!pickedFile && canDirectLink(pickedFile);
    const effectiveTtl: ShareTtl = direct ? "forever" : ttl;

    let created: ShareLink;
    if (direct && picked.type === "file") {
      const forever = await ensureForeverFileShare(picked.id);
      if (!forever) return;
      created = forever;
    } else {
      created = await createShare(auth.token, {
        target_type: picked.type,
        target_id: picked.id,
        ttl: effectiveTtl,
      });
      shares.value = [created, ...shares.value];
    }

    const url = direct ? shareMediaUrl(created.token) : sharePageUrl(created.token);
    await copyText(url, "ссылка скопирована");
    sharePicker.value = null;
  } catch (e) {
    err.value = describe(e instanceof Error ? e.message : "ошибка");
    toastError(e);
  }
}

async function copyShare(s: ShareLink) {
  await copyText(sharePageUrl(s.token), "скопировано");
}

async function copyDirectShare(s: ShareLink) {
  if (s.target_type !== "file" || !auth.token) return;
  const f = files.value.find((x) => x.id === s.target_id);
  if (!f || !canDirectLink(f)) return;
  const forever = await ensureForeverFileShare(s.target_id);
  if (!forever) return;
  await copyText(shareMediaUrl(forever.token), "ссылка скопирована");
}

function shareCanDirect(s: ShareLink) {
  if (s.target_type !== "file") return false;
  const f = files.value.find((x) => x.id === s.target_id);
  return !!f && canDirectLink(f);
}

async function revokeShare(s: ShareLink) {
  if (!auth.token) return;
  try {
    await deleteShare(auth.token, s.id);
    shares.value = shares.value.filter((x) => x.id !== s.id);
  } catch (e) {
    err.value = describe(e instanceof Error ? e.message : "ошибка");
  }
}

function ttlLabel(expires_at: string | null) {
  if (!expires_at) return "навсегда";
  const ms = Date.parse(expires_at) - Date.now();
  if (ms <= 0) return "истёк";
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d} д`;
  if (h >= 1) return `${h} ч`;
  const m = Math.floor(ms / 60000);
  return `${m} мин`;
}

onMounted(async () => {
  if (!canBlogAndStorage.value) return;
  await Promise.all([loadFiles(), loadNotes(), loadShares()]);
});

watch([readerOpen, mediaOpen], ([pdf, media]) => {
  document.documentElement.style.overflow = pdf || media ? "hidden" : "";
});

onBeforeUnmount(() => {
  document.documentElement.style.overflow = "";
  closeAllPreview();
});
</script>

<template>
  <section class="page page-shell">
    <PageHeader
      title="хранилище"
      :meta="canBlogAndStorage ? `${fmt(used)} из ${fmt(quota)} · ${usedPercent}%` : undefined"
    />

    <p v-if="!canBlogAndStorage" class="muted">нет доступа</p>

    <template v-else>
      <div class="quota-bar-wrap">
        <div class="quota-bar"><span :style="{ width: usedPercent + '%' }" /></div>
      </div>

      <div class="filter-bar filter-bar--stack">
        <div class="filter-tabs" role="tablist" aria-label="разделы">
          <button
            class="filter-tab"
            :class="{ on: section === 'files' }"
            type="button"
            role="tab"
            :aria-selected="section === 'files'"
            @click="section = 'files'"
          >
            файлы
          </button>
          <button
            class="filter-tab"
            :class="{ on: section === 'notes' }"
            type="button"
            role="tab"
            :aria-selected="section === 'notes'"
            @click="section = 'notes'"
          >
            заметки
          </button>
        </div>
      </div>

      <p v-if="err" class="error">{{ err }}</p>

      <template v-if="section === 'files'">
        <button
          type="button"
          class="dropzone"
          :class="{ over: dragOver, busy: uploading }"
          @dragover.prevent="dragOver = true"
          @dragleave.prevent="dragOver = false"
          @drop="onDrop"
          @click="fileInput?.click()"
        >
          <input ref="fileInput" type="file" multiple hidden @change="onFileInputChange" />
          <AppIcon name="plus" :size="20" />
          <span>{{ uploading ? "загрузка…" : "загрузить" }}</span>
        </button>

        <AppLoading v-if="filesLoading" class="page-empty page-empty--tight" />
        <p v-else-if="!files.length" class="page-empty page-empty--tight muted">пусто</p>
        <ul v-else class="list">
          <li v-for="f in files" :key="f.id" class="item">
            <div class="info">
              <span class="name" :title="f.original_name">{{ f.original_name }}</span>
              <span class="muted small">{{ fmt(f.size_bytes) }}</span>
            </div>
            <div class="actions">
              <button
                v-if="canPreview(f)"
                class="icon-btn-sm"
                type="button"
                title="открыть"
                @click="openPreview(f)"
              >
                <AppIcon name="play" :size="18" />
              </button>
              <button class="icon-btn-sm" type="button" title="скачать" @click="onDownload(f)">
                <AppIcon name="download" :size="18" />
              </button>
              <button
                v-if="canDirectLink(f)"
                class="icon-btn-sm"
                type="button"
                title="прямая ссылка"
                @click="copyDirectFileLink(f)"
              >
                <AppIcon name="copy" :size="18" />
              </button>
              <button
                class="icon-btn-sm"
                type="button"
                :title="shareFor('file', f.id) ? 'ещё ссылка' : 'поделиться'"
                @click="openShare('file', f.id)"
              >
                <AppIcon name="link" :size="18" />
              </button>
              <button class="icon-btn-sm" type="button" title="удалить" @click="onDeleteFile(f)">
                <AppIcon name="delete" :size="18" />
              </button>
            </div>
          </li>
        </ul>
      </template>

      <template v-else-if="section === 'notes'">
        <div class="composer">
          <div class="composer-head">
            <input v-model="noteTitle" placeholder="название" maxlength="200" />
            <div class="composer-head-actions">
              <button v-if="editingNote" class="secondary" type="button" @click="openNew">отмена</button>
              <button type="button" :disabled="!noteBody.trim() && !noteTitle.trim()" @click="saveNote">
                {{ editingNote ? "сохранить" : "создать" }}
              </button>
            </div>
          </div>
          <textarea v-model="noteBody" rows="3" placeholder="текст" />
        </div>

        <AppLoading v-if="notesLoading" class="page-empty page-empty--tight" />
        <p v-else-if="!notes.length" class="page-empty page-empty--tight muted">пусто</p>
        <ul v-else class="list">
          <li v-for="n in notes" :key="n.id" class="item">
            <div class="info">
              <span class="name">{{ n.title || "без названия" }}</span>
              <span class="muted small">{{ n.body.slice(0, 80) }}</span>
            </div>
            <div class="actions">
              <button class="icon-btn-sm" type="button" title="изменить" @click="openEdit(n)">
                <AppIcon name="edit" :size="18" />
              </button>
              <button class="icon-btn-sm" type="button" title="поделиться" @click="openShare('note', n.id)">
                <AppIcon name="link" :size="18" />
              </button>
              <button class="icon-btn-sm" type="button" title="удалить" @click="onDeleteNote(n)">
                <AppIcon name="delete" :size="18" />
              </button>
            </div>
          </li>
        </ul>
      </template>

      <section v-if="shares.length" class="shares">
        <h2>ссылки</h2>
        <ul class="list">
          <li v-for="s in shares" :key="s.id" class="item">
            <div class="info">
              <span class="name">{{ s.label || s.target_type }}</span>
              <span class="muted small">{{ ttlLabel(s.expires_at) }}</span>
            </div>
            <div class="actions">
              <button class="icon-btn-sm" type="button" title="скопировать" @click="copyShare(s)">
                <AppIcon name="copy" :size="18" />
              </button>
              <button
                v-if="shareCanDirect(s)"
                class="icon-btn-sm"
                type="button"
                title="прямая ссылка"
                @click="copyDirectShare(s)"
              >
                <AppIcon name="link" :size="18" />
              </button>
              <button class="icon-btn-sm" type="button" title="отозвать" @click="revokeShare(s)">
                <AppIcon name="delete" :size="18" />
              </button>
            </div>
          </li>
        </ul>
      </section>
    </template>

    <div v-if="sharePicker" class="modal-backdrop" @click.self="sharePicker = null">
      <div class="modal card">
        <h2>срок ссылки</h2>
        <label v-if="sharePickerFile && canDirectLink(sharePickerFile)" class="share-direct-opt">
          <input v-model="shareDirectMode" type="checkbox" />
          <span class="muted small">прямая ссылка</span>
        </label>
        <div v-if="shareDirectMode && sharePickerFile && canDirectLink(sharePickerFile)" class="ttl-grid ttl-grid--one">
          <button type="button" @click="makeShare('forever')">скопировать</button>
        </div>
        <div v-else class="ttl-grid">
          <button type="button" @click="makeShare('1h')">1 час</button>
          <button type="button" @click="makeShare('1d')">1 день</button>
          <button type="button" @click="makeShare('7d')">7 дней</button>
          <button type="button" @click="makeShare('forever')">навсегда</button>
        </div>
        <div class="actions">
          <button class="secondary" type="button" @click="sharePicker = null">отмена</button>
        </div>
      </div>
    </div>
  </section>

  <PdfReader
    v-if="readerOpen && readerUrl"
    :url="readerUrl"
    :title="readerTitle"
    :progress-key="readerProgressKey ?? undefined"
    @close="closeReader"
  />

  <div v-if="mediaOpen && mediaUrl" class="media-backdrop" role="presentation" @click.self="closeMedia">
    <div class="media-dialog" role="dialog" aria-modal="true" :aria-label="mediaTitle">
      <p class="media-title muted small">{{ mediaTitle }}</p>
      <img v-if="mediaKind === 'image'" class="media-img" :src="mediaUrl" :alt="mediaTitle" />
      <video
        v-else-if="mediaKind === 'video'"
        class="media-video"
        :src="mediaUrl"
        controls
        playsinline
      />
      <button class="secondary media-close" type="button" @click="closeMedia">закрыть</button>
      <a
        v-if="mediaFullUrl"
        :href="mediaFullUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="muted small media-tab-link"
      >
        в новой вкладке
      </a>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: grid;
  gap: var(--space-4);
}

.quota-bar-wrap {
  margin: -0.35rem 0 0;
}

.quota-bar {
  height: 3px;
  border-radius: 999px;
  background: var(--surface2);
  overflow: hidden;
}

.quota-bar > span {
  display: block;
  height: 100%;
  background: var(--text);
  transition: width var(--dur-2) var(--ease-out);
}

.dropzone {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  min-height: 3.5rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-size: 0.94rem;
  font-weight: 500;
  text-transform: lowercase;
  cursor: pointer;
  transition: border-color var(--dur-2) var(--ease-out), background var(--dur-2) var(--ease-out), color var(--dur-2) var(--ease-out);
}

.dropzone :deep(.app-icon) {
  opacity: 0.7;
}

.dropzone:hover,
.dropzone.over {
  border-color: var(--hover-border);
  background: var(--surface2);
  color: var(--text);
}

.dropzone:hover :deep(.app-icon),
.dropzone.over :deep(.app-icon) {
  opacity: 1;
}

.dropzone.busy {
  pointer-events: none;
  opacity: 0.55;
}

.composer {
  display: grid;
  gap: 0.55rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.composer:focus-within {
  border-color: var(--focus-border);
}

.composer-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.composer-head-actions {
  display: flex;
  gap: 0.35rem;
  flex-shrink: 0;
}

.composer-head-actions button {
  min-height: 36px;
  padding: 0.35rem 0.75rem;
  font-size: 0.85rem;
}

.composer input,
.composer textarea {
  border: none;
  border-radius: 0;
  background: transparent;
  min-height: 0;
  width: 100%;
}

.composer-head input {
  flex: 1;
  min-width: 0;
  padding: 0.2rem 0;
  font-size: 0.98rem;
  font-weight: 500;
}

.composer textarea {
  resize: vertical;
  min-height: 5rem;
  max-height: 12rem;
  padding: 0.55rem 0 0.15rem;
  line-height: 1.5;
  font-size: 0.94rem;
  color: var(--text);
}

.composer input:focus,
.composer textarea:focus {
  outline: none;
  background: transparent;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.45rem;
}

.item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.info {
  display: grid;
  gap: 0.15rem;
  flex: 1;
  min-width: 0;
}

.name {
  font-size: 0.95rem;
  font-weight: 500;
  letter-spacing: -0.015em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.small {
  font-size: 0.8rem;
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.1rem;
  flex-shrink: 0;
}

.actions .icon-btn-sm {
  width: 36px;
  height: 36px;
  min-height: 36px;
  color: var(--muted);
}

.actions .icon-btn-sm:hover {
  color: var(--text);
  background: var(--surface2);
}

.shares {
  margin-top: 0.35rem;
  border-top: 1px solid var(--border);
  padding-top: var(--space-4);
  display: grid;
  gap: 0.65rem;
}

.shares h2 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: -0.015em;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: grid;
  place-items: center;
  z-index: 100;
  padding: 1rem;
}

.modal {
  width: min(380px, 100%);
  display: grid;
  gap: 0.85rem;
}

.modal h2 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.ttl-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.45rem;
}

.ttl-grid--one {
  grid-template-columns: 1fr;
}

.share-direct-opt {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  cursor: pointer;
}

.modal .actions {
  justify-content: flex-end;
}

.media-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.72);
}

.media-dialog {
  display: grid;
  gap: 0.65rem;
  width: min(920px, 100%);
  max-height: min(90vh, 900px);
}

.media-title {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-img,
.media-video {
  width: 100%;
  max-height: calc(90vh - 5rem);
  object-fit: contain;
  border-radius: var(--radius);
  background: #000;
}

.media-close {
  justify-self: end;
}

.media-tab-link {
  justify-self: end;
  text-decoration: underline;
  text-underline-offset: 2px;
}

@media (max-width: 520px) {
  .item {
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.55rem;
  }

  .info {
    width: 100%;
  }

  .actions {
    width: 100%;
    justify-content: flex-end;
  }

  .composer-head {
    flex-wrap: wrap;
  }

  .composer-head-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
