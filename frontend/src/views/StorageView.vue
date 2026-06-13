<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  deleteFile,
  downloadFile,
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
  updateNote,
  type Note,
  type ShareLink,
  type ShareTtl,
} from "../api/storage";
import AppIcon from "../components/AppIcon.vue";
import PageHeader from "../components/PageHeader.vue";
import { useAuthStore } from "../stores/auth";
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

const err = ref("");

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
  return code || "ошибка";
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

function openShare(type: "file" | "note", id: string) {
  sharePicker.value = { type, id };
}

async function makeShare(ttl: ShareTtl) {
  if (!auth.token || !sharePicker.value) return;
  try {
    const created = await createShare(auth.token, {
      target_type: sharePicker.value.type,
      target_id: sharePicker.value.id,
      ttl,
    });
    shares.value = [created, ...shares.value];
    const url = `${window.location.origin}/s/${created.token}`;
    await navigator.clipboard.writeText(url).catch(() => undefined);
    toastSuccess("ссылка скопирована");
    sharePicker.value = null;
  } catch (e) {
    err.value = describe(e instanceof Error ? e.message : "ошибка");
    toastError(e);
  }
}

async function copyShare(s: ShareLink) {
  const url = `${window.location.origin}/s/${s.token}`;
  await navigator.clipboard.writeText(url).catch(() => undefined);
  toastSuccess("скопировано");
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

      <nav class="content-tabs">
        <button class="content-tab" :class="{ on: section === 'files' }" type="button" @click="section = 'files'">
          файлы
        </button>
        <button class="content-tab" :class="{ on: section === 'notes' }" type="button" @click="section = 'notes'">
          заметки
        </button>
      </nav>

      <p v-if="err" class="error">{{ err }}</p>

      <template v-if="section === 'files'">
        <div
          class="storage-zone dropzone"
          :class="{ over: dragOver, busy: uploading }"
          @dragover.prevent="dragOver = true"
          @dragleave.prevent="dragOver = false"
          @drop="onDrop"
          @click="fileInput?.click()"
        >
          <input ref="fileInput" type="file" multiple hidden @change="onFileInputChange" />
          <p>{{ uploading ? "загрузка…" : "перетащите файл или нажмите" }}</p>
        </div>

        <p v-if="filesLoading" class="page-empty page-empty--tight muted">загрузка</p>
        <p v-else-if="!files.length" class="page-empty page-empty--tight muted">пусто</p>
        <ul v-else class="list">
          <li v-for="f in files" :key="f.id" class="list-row">
            <div class="info">
              <span class="name">{{ f.original_name }}</span>
              <span class="muted small">{{ fmt(f.size_bytes) }}</span>
            </div>
            <div class="actions">
              <button class="secondary" type="button" @click="onDownload(f)">скачать</button>
              <button class="secondary" type="button" @click="openShare('file', f.id)">
                {{ shareFor("file", f.id) ? "ещё ссылка" : "поделиться" }}
              </button>
              <button class="secondary" type="button" @click="onDeleteFile(f)">удалить</button>
            </div>
          </li>
        </ul>
      </template>

      <template v-else-if="section === 'notes'">
        <div class="storage-zone composer">
          <div class="composer-head">
            <input v-model="noteTitle" placeholder="название" maxlength="200" />
            <div class="composer-head-actions">
              <button v-if="editingNote" class="secondary" type="button" @click="openNew">отмена</button>
              <button type="button" :disabled="!noteBody.trim() && !noteTitle.trim()" @click="saveNote">
                {{ editingNote ? "сохранить" : "создать" }}
              </button>
            </div>
          </div>
          <textarea v-model="noteBody" rows="3" placeholder="текст… markdown поддерживается" />
        </div>

        <p v-if="notesLoading" class="page-empty page-empty--tight muted">загрузка</p>
        <p v-else-if="!notes.length" class="page-empty page-empty--tight muted">пусто</p>
        <ul v-else class="list">
          <li v-for="n in notes" :key="n.id" class="list-row">
            <div class="info">
              <span class="name">{{ n.title || "без названия" }}</span>
              <span class="muted small">{{ n.body.slice(0, 80) }}</span>
            </div>
            <div class="actions">
              <button class="secondary" type="button" @click="openEdit(n)">изменить</button>
              <button class="secondary" type="button" @click="openShare('note', n.id)">поделиться</button>
              <button class="secondary" type="button" @click="onDeleteNote(n)">удалить</button>
            </div>
          </li>
        </ul>
      </template>

      <section v-if="shares.length" class="shares">
        <h2>ссылки</h2>
        <ul class="list">
          <li v-for="s in shares" :key="s.id" class="list-row">
            <div class="info">
              <span class="name">{{ s.label || s.target_type }}</span>
              <span class="muted small">{{ s.target_type }} · {{ ttlLabel(s.expires_at) }}</span>
            </div>
            <code class="token" :title="`/s/${s.token}`" @click="copyShare(s)">/s/{{ s.token }}</code>
            <div class="actions">
              <button class="icon-btn-sm" type="button" title="скопировать" @click="copyShare(s)">
                <AppIcon name="copy" :size="16" />
              </button>
              <button class="icon-btn-sm" type="button" title="отозвать" @click="revokeShare(s)">
                <AppIcon name="delete" :size="16" />
              </button>
            </div>
          </li>
        </ul>
      </section>
    </template>

    <div v-if="sharePicker" class="modal-backdrop" @click.self="sharePicker = null">
      <div class="modal card">
        <h2>срок ссылки</h2>
        <div class="ttl-grid">
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
</template>

<style scoped>
.page {
  display: grid;
  gap: 0.85rem;
}

.quota-bar-wrap {
  margin: 0 0 0.5rem;
}

.quota-bar {
  height: 4px;
  border-radius: 999px;
  background: var(--surface2);
  overflow: hidden;
}

.quota-bar > span {
  display: block;
  height: 100%;
  background: var(--text);
  transition: width 0.2s ease;
}

.storage-zone {
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  padding: 1.1rem 1rem;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.dropzone {
  text-align: center;
  cursor: pointer;
}

.dropzone p {
  margin: 0;
  font-size: 0.88rem;
  color: var(--muted);
}

.dropzone.over {
  border-color: var(--text);
  background: var(--surface2);
}

.dropzone.busy {
  pointer-events: none;
  opacity: 0.7;
}

.composer {
  display: grid;
  gap: 0.5rem;
}

.composer:focus-within {
  border-color: var(--text);
  background: var(--surface2);
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
  min-height: 0;
  padding: 0.35rem 0.7rem;
  font-size: 0.82rem;
}

.composer input,
.composer textarea {
  border: none;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
  padding: 0.35rem 0;
  min-height: 0;
  width: 100%;
}

.composer-head input {
  flex: 1;
  min-width: 0;
  border-bottom: none;
  padding: 0;
}

.composer textarea {
  resize: vertical;
  min-height: 3.25rem;
  max-height: 12rem;
  line-height: 1.5;
  font-size: 0.88rem;
}

.composer input:focus,
.composer textarea:focus {
  outline: none;
  border-bottom-color: var(--focus-border);
  background: transparent;
}

.composer-head input:focus {
  border-bottom: none;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.4rem;
}

.info {
  display: grid;
  gap: 0.15rem;
  flex: 1;
  min-width: 0;
}

.name {
  font-size: 0.92rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.small {
  font-size: 0.8rem;
}

.actions {
  display: flex;
  gap: 0.35rem;
  flex-shrink: 0;
}

.actions button {
  min-height: 0;
  padding: 0.35rem 0.7rem;
  font-size: 0.82rem;
}

.shares {
  margin-top: 0.85rem;
  border-top: 1px solid var(--border);
  padding-top: 0.85rem;
}

.shares h2 {
  font-size: 1rem;
  font-weight: 600;
}

.token {
  font-family: var(--mono, ui-monospace, monospace);
  font-size: 0.85rem;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.25rem 0.5rem;
  color: var(--text);
  cursor: pointer;
  letter-spacing: 0.02em;
  user-select: all;
  flex-shrink: 0;
}

.token:hover {
  border-color: var(--hover-border);
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
  width: min(420px, 100%);
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

.modal .actions {
  justify-content: flex-end;
}
</style>
