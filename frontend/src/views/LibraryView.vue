<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  deleteBook,
  downloadBook,
  libraryReadUrl,
  listBooks,
  listCategories,
  updateBookMetadata,
  uploadBook,
  type LibraryBook,
  type LibraryCategory,
} from "../api/library";

const LIBRARY_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;
import { useAuthStore } from "../stores/auth";
import { toastError, toastSuccess } from "../utils/toast";
import AppIcon from "../components/AppIcon.vue";

const auth = useAuthStore();

const books = ref<LibraryBook[]>([]);
const categories = ref<LibraryCategory[]>([]);
const loading = ref(false);
const err = ref("");

const isStaff = computed(() => auth.role === "teacher" || auth.role === "admin");

const search = ref("");
const activeCategory = ref("");
const sort = ref<"new" | "title">("new");
const categoryOpen = ref(false);
const categoryMenuRoot = ref<HTMLElement | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | null = null;

const showForm = ref(false);
const newTitle = ref("");
const newAuthor = ref("");
const newDescription = ref("");
const newCategory = ref("");
const newFile = ref<File | null>(null);
const uploading = ref(false);

const totalCount = computed(() => books.value.length);
const storageBytesUsed = ref(0);

const libraryQuotaLabel = computed(() => {
  const gb = LIBRARY_QUOTA_BYTES / 1024 ** 3;
  return `${gb} гб`;
});

function fmt(n: number) {
  if (n < 1024) return `${n} б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} кб`;
  return `${(n / 1024 / 1024).toFixed(1)} мб`;
}

function fmtUsed(bytes: number) {
  if (bytes >= 1024 ** 3 * 0.05) return `${(bytes / 1024 ** 3).toFixed(2)} гб`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} мб`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} кб`;
  return `${bytes} б`;
}

function describe(code: string) {
  if (code === "file_too_large") return "файл слишком большой";
  if (code === "title_required") return "нужно название";
  if (code === "no_file") return "нужен файл";
  if (code === "read_only_pdf") return "чтение в браузере только для pdf";
  return code || "ошибка";
}

function isPdfBook(b: LibraryBook) {
  const m = (b.mime_type || "").toLowerCase();
  if (m.includes("pdf")) return true;
  return b.original_name.toLowerCase().endsWith(".pdf");
}

const readerOpen = ref(false);
const readerUrl = ref<string | null>(null);
const readerTitle = ref("");

const editOpen = ref(false);
const editingId = ref<string | null>(null);
const editTitle = ref("");
const editAuthor = ref("");
const editDescription = ref("");
const editCategory = ref("");
const savingEdit = ref(false);

async function load() {
  if (!auth.token) return;
  loading.value = true;
  err.value = "";
  try {
    const r = await listBooks(auth.token, {
      q: search.value.trim() || undefined,
      category: activeCategory.value || undefined,
      sort: sort.value,
    });
    books.value = r.items;
    storageBytesUsed.value = Number(r.storage_bytes_used) || 0;
  } catch (e) {
    err.value = describe(e instanceof Error ? e.message : "ошибка");
  } finally {
    loading.value = false;
  }
}

async function loadCategories() {
  if (!auth.token) return;
  try {
    const r = await listCategories(auth.token);
    categories.value = r.items;
  } catch {
    /* ignore */
  }
}

function selectCategory(cat: string) {
  activeCategory.value = cat;
  categoryOpen.value = false;
}

const categoryButtonLabel = computed(() => activeCategory.value || "все");

function onDocumentClick(event: MouseEvent) {
  if (!categoryOpen.value) return;
  const target = event.target as HTMLElement | null;
  const root = categoryMenuRoot.value;
  if (root && target && root.contains(target)) return;
  categoryOpen.value = false;
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void load(), 250);
}

function onPickFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  newFile.value = input.files?.[0] ?? null;
}

function resetForm() {
  newTitle.value = "";
  newAuthor.value = "";
  newDescription.value = "";
  newCategory.value = "";
  newFile.value = null;
  showForm.value = false;
}

async function submit() {
  if (!auth.token || !newFile.value) return;
  uploading.value = true;
  err.value = "";
  try {
    await uploadBook(auth.token, {
      title: newTitle.value.trim(),
      author: newAuthor.value.trim(),
      description: newDescription.value.trim(),
      category: newCategory.value.trim(),
      file: newFile.value,
    });
    toastSuccess("книга добавлена");
    resetForm();
    await Promise.all([load(), loadCategories()]);
  } catch (e) {
    err.value = describe(e instanceof Error ? e.message : "ошибка");
    toastError(e);
  } finally {
    uploading.value = false;
  }
}

async function onDownload(b: LibraryBook) {
  if (!auth.token) return;
  try {
    await downloadBook(auth.token, b.id, b.original_name);
  } catch (e) {
    err.value = describe(e instanceof Error ? e.message : "ошибка");
  }
}

function openReader(b: LibraryBook) {
  if (!auth.token || !isPdfBook(b)) return;
  err.value = "";
  readerTitle.value = b.title;
  readerUrl.value = libraryReadUrl(b.id, auth.token);
  readerOpen.value = true;
}

function closeReader() {
  readerOpen.value = false;
  readerUrl.value = null;
  readerTitle.value = "";
}

function openEdit(b: LibraryBook) {
  editingId.value = b.id;
  editTitle.value = b.title;
  editAuthor.value = b.author;
  editDescription.value = b.description;
  editCategory.value = b.category;
  editOpen.value = true;
}

function closeEdit() {
  editOpen.value = false;
  editingId.value = null;
  editTitle.value = "";
  editAuthor.value = "";
  editDescription.value = "";
  editCategory.value = "";
}

async function saveEdit() {
  if (!auth.token || !editingId.value || savingEdit.value) return;
  if (!editTitle.value.trim()) {
    err.value = describe("title_required");
    return;
  }
  savingEdit.value = true;
  err.value = "";
  try {
    await updateBookMetadata(auth.token, editingId.value, {
      title: editTitle.value.trim(),
      author: editAuthor.value.trim(),
      description: editDescription.value.trim(),
      category: editCategory.value.trim(),
    });
    toastSuccess("сохранено");
    closeEdit();
    await Promise.all([load(), loadCategories()]);
  } catch (e) {
    err.value = describe(e instanceof Error ? e.message : "ошибка");
    toastError(e);
  } finally {
    savingEdit.value = false;
  }
}

async function removeFromEdit() {
  if (!auth.token || !editingId.value) return;
  const b = books.value.find((x) => x.id === editingId.value);
  if (!b || !confirm(`удалить «${b.title}»?`)) return;
  try {
    await deleteBook(auth.token, editingId.value);
    closeEdit();
    await Promise.all([load(), loadCategories()]);
  } catch (e) {
    err.value = describe(e instanceof Error ? e.message : "ошибка");
    toastError(e);
  }
}

function canManageBook(b: LibraryBook) {
  if (auth.role === "admin") return true;
  if (!(auth.role === "teacher")) return false;
  return b.uploaded_by === auth.user?.id;
}

onMounted(() => {
  document.addEventListener("click", onDocumentClick);
  if (auth.token) {
    void load();
    void loadCategories();
  }
});

watch([activeCategory, sort], () => {
  void load();
});

watch(readerOpen, (open) => {
  document.documentElement.style.overflow = open ? "hidden" : "";
});

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocumentClick);
  document.documentElement.style.overflow = "";
  closeReader();
  closeEdit();
});
</script>

<template>
  <section class="library page-shell">
    <div v-if="!auth.token" class="muted">войдите, чтобы видеть библиотеку</div>

    <template v-else>
      <header class="page-head">
        <div class="page-head-main">
          <h1>библиотека</h1>
          <p class="page-head-meta">
            {{ totalCount }} {{ totalCount === 1 ? "книга" : "книг" }} · {{ fmtUsed(storageBytesUsed) }} / {{ libraryQuotaLabel }}
          </p>
        </div>
        <button v-if="isStaff && !showForm" type="button" @click="showForm = true">
          добавить
        </button>
      </header>

      <p v-if="err" class="error">{{ err }}</p>

      <form v-if="showForm && isStaff" class="form card" @submit.prevent="submit">
        <input v-model="newTitle" placeholder="название" maxlength="200" required />
        <div class="form-row">
          <input v-model="newAuthor" placeholder="автор" maxlength="200" />
          <input v-model="newCategory" placeholder="категория" maxlength="80" list="cat-suggest" />
          <datalist id="cat-suggest">
            <option v-for="c in categories" :key="c.category" :value="c.category" />
          </datalist>
        </div>
        <textarea v-model="newDescription" rows="3" placeholder="описание" maxlength="4000" />
        <input
          type="file"
          accept=".pdf,.epub,.txt,.djvu,.fb2,.doc,.docx,application/pdf,application/epub+zip,text/plain"
          @change="onPickFile"
        />
        <div class="actions">
          <button class="secondary" type="button" @click="resetForm">отмена</button>
          <button type="submit" :disabled="uploading || !newFile || !newTitle.trim()">
            {{ uploading ? "загрузка…" : "загрузить" }}
          </button>
        </div>
      </form>

      <div class="filter-bar">
        <div class="filter-search">
          <input
            v-model="search"
            type="search"
            placeholder="поиск"
            @input="onSearchInput"
          />
        </div>
        <div ref="categoryMenuRoot" class="filter-menu-wrap">
          <button
            type="button"
            class="filter-tab"
            :class="{ on: categoryOpen || activeCategory }"
            aria-haspopup="listbox"
            :aria-expanded="categoryOpen"
            @click.stop="categoryOpen = !categoryOpen"
          >
            {{ categoryButtonLabel }}
          </button>
          <div v-if="categoryOpen" class="filter-menu card" role="listbox">
            <button
              type="button"
              class="filter-menu-opt"
              :class="{ on: activeCategory === '' }"
              role="option"
              @click="selectCategory('')"
            >
              все
            </button>
            <button
              v-for="c in categories"
              :key="c.category"
              type="button"
              class="filter-menu-opt"
              :class="{ on: activeCategory === c.category }"
              role="option"
              @click="selectCategory(c.category)"
            >
              <span>{{ c.category }}</span>
              <span class="muted small">{{ c.count }}</span>
            </button>
          </div>
        </div>
        <select v-model="sort" class="filter-select" aria-label="сортировка">
          <option value="new">новые</option>
          <option value="title">по названию</option>
        </select>
      </div>

      <div class="list-panel">
        <p v-if="loading" class="list-panel-state muted">загрузка</p>
        <p v-else-if="!books.length" class="list-panel-state muted">пусто</p>
        <ul v-else class="list">
          <li v-for="b in books" :key="b.id" class="list-row">
            <div class="info">
              <span class="title">{{ b.title }}</span>
              <span v-if="b.author" class="muted small">{{ b.author }}</span>
              <span v-if="b.description" class="muted small desc">{{ b.description }}</span>
              <span class="muted small meta">
                <span v-if="b.category" class="cat-pill">{{ b.category }}</span>
                @{{ b.uploader_nickname }} · {{ fmt(b.size_bytes) }}
              </span>
            </div>
            <div class="row-actions">
              <button
                v-if="isPdfBook(b)"
                class="secondary"
                type="button"
                @click="openReader(b)"
              >
                читать
              </button>
              <button class="secondary" type="button" @click="onDownload(b)">скачать</button>
              <button v-if="canManageBook(b)" class="secondary" type="button" @click="openEdit(b)">
                изменить
              </button>
            </div>
          </li>
        </ul>
      </div>

      <div v-if="readerOpen" class="reader-overlay" role="dialog" aria-modal="true">
        <div class="reader-shell">
          <header class="reader-top">
            <span class="reader-label muted">{{ readerTitle }}</span>
            <button class="reader-close" type="button" aria-label="закрыть" @click="closeReader">
              <AppIcon name="close" :size="18" />
            </button>
          </header>
          <object
            v-if="readerUrl"
            class="reader-frame"
            :data="readerUrl"
            type="application/pdf"
          >
            <iframe class="reader-frame" :src="readerUrl" title="документ" />
          </object>
        </div>
      </div>

      <div v-if="editOpen" class="edit-overlay" role="dialog" aria-modal="true" @click.self="closeEdit">
        <div class="edit-panel card" @click.stop>
          <header class="edit-head">
            <span class="muted">изменить</span>
            <button class="reader-close" type="button" aria-label="закрыть" @click="closeEdit">
              <AppIcon name="close" :size="18" />
            </button>
          </header>
          <form class="edit-form" @submit.prevent="saveEdit">
            <input v-model="editTitle" placeholder="название" maxlength="200" required />
            <div class="form-row">
              <input v-model="editAuthor" placeholder="автор" maxlength="200" />
              <input v-model="editCategory" placeholder="категория" maxlength="80" list="cat-suggest-edit" />
              <datalist id="cat-suggest-edit">
                <option v-for="c in categories" :key="c.category" :value="c.category" />
              </datalist>
            </div>
            <textarea v-model="editDescription" rows="3" placeholder="описание" maxlength="4000" />
            <div class="edit-actions">
              <button class="secondary" type="button" @click="closeEdit">отмена</button>
              <button type="submit" :disabled="savingEdit">
                {{ savingEdit ? "…" : "сохранить" }}
              </button>
            </div>
          </form>
          <div class="edit-foot">
            <button class="edit-delete" type="button" @click="removeFromEdit">удалить</button>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.library {
  display: grid;
  gap: 0.75rem;
}

.form {
  display: grid;
  gap: 0.5rem;
}

.form-row {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 0.5rem;
}

.actions {
  display: flex;
  gap: 0.4rem;
  justify-content: flex-end;
}

@media (max-width: 760px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}

.filter-menu-wrap .filter-tab {
  min-width: 7rem;
  white-space: nowrap;
}

.info {
  display: grid;
  gap: 0.2rem;
  flex: 1;
  min-width: 0;
}

.title {
  font-size: 0.95rem;
  text-transform: none;
}

.small {
  font-size: 0.8rem;
}

.desc {
  white-space: pre-wrap;
}

.meta {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.15rem;
}

.cat-pill {
  display: inline-block;
  padding: 0.05rem 0.45rem;
  border-radius: var(--radius);
  background: var(--surface2);
  color: var(--text);
  font-size: 0.74rem;
}

.row-actions {
  display: flex;
  gap: 0.4rem;
  flex-shrink: 0;
}

.row-actions button {
  min-height: 0;
  padding: 0.35rem 0.7rem;
  font-size: 0.82rem;
}

.edit-overlay {
  position: fixed;
  inset: 0;
  z-index: 85;
  background: rgba(0, 0, 0, 0.72);
  display: grid;
  place-items: center;
  padding: 1rem;
}

.edit-panel {
  width: min(420px, 100%);
  padding: 1rem;
  display: grid;
  gap: 0.75rem;
}

.edit-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.edit-head .muted {
  font-size: 0.88rem;
}

.edit-form {
  display: grid;
  gap: 0.5rem;
}

.edit-actions {
  display: flex;
  gap: 0.4rem;
  justify-content: flex-end;
  margin-top: 0.25rem;
}

.edit-foot {
  border-top: 1px solid var(--border);
  padding-top: 0.75rem;
}

.edit-delete {
  width: 100%;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--danger);
  padding: 0.45rem 0.75rem;
  font: inherit;
  font-size: 0.88rem;
  cursor: pointer;
  text-transform: lowercase;
}

.edit-delete:hover {
  background: var(--surface2);
}

.reader-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  padding: 0.5rem;
}

.reader-shell {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-width: 960px;
  width: 100%;
  margin: 0 auto;
}

.reader-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.35rem 0 0.5rem;
  border-bottom: 1px solid var(--border);
}

.reader-label {
  font-size: 0.88rem;
  text-transform: lowercase;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reader-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius);
  color: var(--muted);
  cursor: pointer;
}

.reader-close:hover {
  background: var(--surface);
  color: var(--text);
}

.reader-frame {
  flex: 1;
  width: 100%;
  min-height: 0;
  border: none;
  margin-top: 0.5rem;
  background: var(--surface);
  -webkit-overflow-scrolling: touch;
}
</style>
