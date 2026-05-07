<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  deleteBook,
  downloadBook,
  fetchBookReadBlob,
  listBooks,
  listCategories,
  uploadBook,
  type LibraryBook,
  type LibraryCategory,
} from "../api/library";
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
let searchTimer: ReturnType<typeof setTimeout> | null = null;

const showForm = ref(false);
const newTitle = ref("");
const newAuthor = ref("");
const newDescription = ref("");
const newCategory = ref("");
const newFile = ref<File | null>(null);
const uploading = ref(false);

const totalCount = computed(() => books.value.length);

function fmt(n: number) {
  if (n < 1024) return `${n} б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} кб`;
  return `${(n / 1024 / 1024).toFixed(1)} мб`;
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
  activeCategory.value = activeCategory.value === cat ? "" : cat;
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

async function openReader(b: LibraryBook) {
  if (!auth.token || !isPdfBook(b)) return;
  err.value = "";
  try {
    const blob = await fetchBookReadBlob(auth.token, b.id);
    readerTitle.value = b.title;
    readerUrl.value = URL.createObjectURL(blob);
    readerOpen.value = true;
  } catch (e) {
    toastError(e);
    err.value = describe(e instanceof Error ? e.message : "ошибка");
  }
}

function closeReader() {
  readerOpen.value = false;
  if (readerUrl.value) {
    URL.revokeObjectURL(readerUrl.value);
    readerUrl.value = null;
  }
  readerTitle.value = "";
}

async function onRemove(b: LibraryBook) {
  if (!auth.token) return;
  if (!confirm(`удалить "${b.title}"?`)) return;
  try {
    await deleteBook(auth.token, b.id);
    await Promise.all([load(), loadCategories()]);
  } catch (e) {
    err.value = describe(e instanceof Error ? e.message : "ошибка");
  }
}

function canDelete(b: LibraryBook) {
  return auth.role === "admin" || b.uploaded_by === auth.user?.id;
}

onMounted(() => {
  if (auth.token) {
    void load();
    void loadCategories();
  }
});

watch([activeCategory, sort], () => {
  void load();
});

onBeforeUnmount(() => {
  closeReader();
});
</script>

<template>
  <section class="library">
    <div v-if="!auth.token" class="muted">войдите, чтобы видеть библиотеку</div>

    <template v-else>
      <header class="head">
        <h1>библиотека</h1>
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

      <div class="grid">
        <aside class="sidebar">
          <h2>категории</h2>
          <ul class="cat-list">
            <li>
              <button :class="{ active: activeCategory === '' }" type="button" @click="activeCategory = ''">
                <span>все</span>
              </button>
            </li>
            <li v-for="c in categories" :key="c.category">
              <button
                :class="{ active: activeCategory === c.category }"
                type="button"
                @click="selectCategory(c.category)"
              >
                <span>{{ c.category }}</span>
                <span class="muted small">{{ c.count }}</span>
              </button>
            </li>
          </ul>
        </aside>

        <div class="content">
          <div class="bar">
            <input
              v-model="search"
              class="search"
              type="text"
              placeholder="поиск по названию, автору, описанию"
              @input="onSearchInput"
            />
            <select v-model="sort" class="sort">
              <option value="new">новые</option>
              <option value="title">по названию</option>
            </select>
          </div>

          <p v-if="loading" class="muted">загрузка</p>
          <p v-else-if="!books.length" class="muted">пусто</p>
          <ul v-else class="list">
            <li v-for="b in books" :key="b.id" class="row">
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
                <button v-if="canDelete(b)" class="secondary" type="button" @click="onRemove(b)">
                  удалить
                </button>
              </div>
            </li>
          </ul>

          <p class="muted small total">{{ totalCount }} книг</p>
        </div>
      </div>

      <div v-if="readerOpen" class="reader-overlay" role="dialog" aria-modal="true">
        <div class="reader-shell">
          <header class="reader-top">
            <span class="reader-label muted">{{ readerTitle }}</span>
            <button class="reader-close" type="button" aria-label="закрыть" @click="closeReader">
              <AppIcon name="close" :size="18" />
            </button>
          </header>
          <iframe v-if="readerUrl" class="reader-frame" title="документ" :src="readerUrl" />
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.library {
  display: grid;
  gap: 0.85rem;
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.6rem;
}

.head h1 {
  margin: 0;
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

.grid {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

@media (max-width: 760px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .form-row {
    grid-template-columns: 1fr;
  }
}

.sidebar h2 {
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--muted);
  margin: 0 0 0.4rem;
  text-transform: lowercase;
}

.cat-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.15rem;
}

.cat-list button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  background: transparent;
  border: 1px solid transparent;
  color: var(--muted);
  padding: 0.4rem 0.6rem;
  border-radius: 8px;
  min-height: 0;
  font-size: 0.88rem;
  text-align: left;
}

.cat-list button:hover {
  color: var(--text);
  background: var(--surface2);
}

.cat-list button.active {
  color: var(--text);
  background: var(--surface2);
  border-color: var(--border);
}

.bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.5rem;
  margin-bottom: 0.7rem;
}

.search {
  width: 100%;
}

.sort {
  width: auto;
  min-width: 130px;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.45rem;
}

.row {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.65rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: 10px;
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
  border-radius: 999px;
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

.total {
  margin-top: 0.5rem;
  text-align: right;
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
}
</style>
