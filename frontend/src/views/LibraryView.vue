<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  deleteBook,
  deleteBookCover,
  downloadBook,
  libraryReadUrl,
  listBooks,
  listCategories,
  updateBookMetadata,
  uploadBook,
  uploadBookCover,
  type LibraryBook,
  type LibraryCategory,
} from "../api/library";

const LIBRARY_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;
import { useAuthStore } from "../stores/auth";
import { toastError, toastSuccess } from "../utils/toast";
import AppIcon from "../components/AppIcon.vue";
import AppLoading from "../components/AppLoading.vue";
import PageHeader from "../components/PageHeader.vue";
import PdfReader from "../components/PdfReader.vue";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const books = ref<LibraryBook[]>([]);
const categories = ref<LibraryCategory[]>([]);
const loading = ref(false);
const err = ref("");

const isStaff = computed(() => auth.isStaff);

const search = ref(typeof route.query.q === "string" ? route.query.q : "");
const activeCategory = ref("");
const sort = ref<"new" | "title">("new");
const categoryOpen = ref(false);
const categoryMenuRoot = ref<HTMLElement | null>(null);

const showForm = ref(false);
const newTitle = ref("");
const newAuthor = ref("");
const newDescription = ref("");
const newCategory = ref("");
const newFile = ref<File | null>(null);
const newCoverFile = ref<File | null>(null);
const uploading = ref(false);
const coverUploading = ref(false);

const totalCount = computed(() => books.value.length);
const storageBytesUsed = ref(0);

const libraryHeadMeta = computed(() => {
  if (!isStaff.value) return undefined;
  const n = totalCount.value;
  return `${n} ${n === 1 ? "книга" : "книг"} · ${fmtUsed(storageBytesUsed.value)} / ${libraryQuotaLabel.value}`;
});

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
  if (code === "invalid_file") return "файл не похож на pdf или epub";
  if (code === "invalid image") return "файл не похож на изображение";
  if (code === "only jpeg, png, gif, webp") return "только jpeg, png, gif, webp";
  if (code === "only pdf or epub") return "только pdf или epub";
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
const readerProgressKey = ref<string | null>(null);

const editOpen = ref(false);
const editingId = ref<string | null>(null);
const editTitle = ref("");
const editAuthor = ref("");
const editDescription = ref("");
const editCategory = ref("");
const editCoverUrl = ref("");
const savingEdit = ref(false);

async function load() {
  if (!auth.token) return;
  const showLoading = !books.value.length;
  if (showLoading) loading.value = true;
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

function scrollToBook(id: string) {
  const el = document.querySelector(`[data-book-id="${id}"]`);
  el?.scrollIntoView({ block: "nearest" });
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

const activeChips = computed(() => {
  if (!search.value.trim()) return [];
  return [
    {
      label: search.value.trim(),
      clear: () => {
        router.replace({ path: "/library" });
      },
    },
  ];
});

const listEmptyLabel = computed(() => (search.value.trim() ? "ничего не найдено" : "пусто"));

function onDocumentClick(event: MouseEvent) {
  if (!categoryOpen.value) return;
  const target = event.target as HTMLElement | null;
  const root = categoryMenuRoot.value;
  if (root && target && root.contains(target)) return;
  categoryOpen.value = false;
}

function onPickFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  newFile.value = input.files?.[0] ?? null;
}

function onPickNewCover(ev: Event) {
  const input = ev.target as HTMLInputElement;
  newCoverFile.value = input.files?.[0] ?? null;
}

function patchBookCover(bookId: string, coverUrl: string) {
  books.value = books.value.map((b) => (b.id === bookId ? { ...b, cover_url: coverUrl } : b));
  if (editingId.value === bookId) editCoverUrl.value = coverUrl;
}

async function applyCover(bookId: string, file: File) {
  if (!auth.token || coverUploading.value) return;
  coverUploading.value = true;
  try {
    const r = await uploadBookCover(auth.token, bookId, file);
    patchBookCover(bookId, r.cover_url);
    toastSuccess("обложка сохранена");
  } catch (e) {
    toastError(e);
  } finally {
    coverUploading.value = false;
  }
}

async function onEditCoverPick(ev: Event) {
  if (!editingId.value) return;
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  await applyCover(editingId.value, file);
  input.value = "";
}

async function removeCover(bookId: string) {
  if (!auth.token || coverUploading.value) return;
  coverUploading.value = true;
  try {
    await deleteBookCover(auth.token, bookId);
    patchBookCover(bookId, "");
    toastSuccess("обложка убрана");
  } catch (e) {
    toastError(e);
  } finally {
    coverUploading.value = false;
  }
}

function resetForm() {
  newTitle.value = "";
  newAuthor.value = "";
  newDescription.value = "";
  newCategory.value = "";
  newFile.value = null;
  newCoverFile.value = null;
  showForm.value = false;
}

async function submit() {
  if (!auth.token || !newFile.value) return;
  uploading.value = true;
  err.value = "";
  try {
    const created = await uploadBook(auth.token, {
      title: newTitle.value.trim(),
      author: newAuthor.value.trim(),
      description: newDescription.value.trim(),
      category: newCategory.value.trim(),
      file: newFile.value,
    });
    if (newCoverFile.value) {
      await uploadBookCover(auth.token, created.id, newCoverFile.value);
    }
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
    readerTitle.value = b.title;
    readerProgressKey.value = b.id;
    readerUrl.value = await libraryReadUrl(b.id, auth.token);
    readerOpen.value = true;
  } catch (e) {
    toastError(e);
    err.value = describe(e instanceof Error ? e.message : "ошибка");
  }
}

function closeReader() {
  readerOpen.value = false;
  readerUrl.value = null;
  readerTitle.value = "";
  readerProgressKey.value = null;
}

function openEdit(b: LibraryBook) {
  editingId.value = b.id;
  editTitle.value = b.title;
  editAuthor.value = b.author;
  editDescription.value = b.description;
  editCategory.value = b.category;
  editCoverUrl.value = b.cover_url ?? "";
  editOpen.value = true;
}

function closeEdit() {
  editOpen.value = false;
  editingId.value = null;
  editTitle.value = "";
  editAuthor.value = "";
  editDescription.value = "";
  editCategory.value = "";
  editCoverUrl.value = "";
}

async function saveEdit() {
  if (!auth.token || !editingId.value || savingEdit.value) return;
  if (!editTitle.value.trim()) {
    err.value = describe("title_required");
    return;
  }
  savingEdit.value = true;
  err.value = "";
  const savedId = editingId.value;
  try {
    await updateBookMetadata(auth.token, savedId, {
      title: editTitle.value.trim(),
      author: editAuthor.value.trim(),
      description: editDescription.value.trim(),
      category: editCategory.value.trim(),
    });
    toastSuccess("сохранено");
    const scrollY = window.scrollY;
    closeEdit();
    await Promise.all([load(), loadCategories()]);
    await nextTick();
    window.scrollTo(0, scrollY);
    scrollToBook(savedId);
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

watch(
  () => route.query.q,
  (v) => {
    search.value = typeof v === "string" ? v : "";
    void load();
  },
);

function syncPageScrollLock() {
  document.documentElement.style.overflow =
    readerOpen.value || editOpen.value ? "hidden" : "";
}

watch(readerOpen, syncPageScrollLock);
watch(editOpen, syncPageScrollLock);

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
      <PageHeader
        title="библиотека"
        :meta="libraryHeadMeta"
      >
        <template v-if="isStaff && !showForm" #actions>
          <button type="button" @click="showForm = true">добавить</button>
        </template>
      </PageHeader>

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
        <label class="cover-add secondary">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            @change="onPickNewCover"
          />
          <AppIcon name="image" :size="16" />
          обложка
        </label>
        <input
          type="file"
          accept=".pdf,.epub,application/pdf,application/epub+zip"
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

      <div v-if="activeChips.length" class="active-chips">
        <button
          v-for="(c, i) in activeChips"
          :key="i"
          class="active-chip"
          type="button"
          @click="c.clear"
        >
          {{ c.label }} ×
        </button>
      </div>

      <div class="list-panel">
        <AppLoading v-if="loading" class="list-panel-state" />
        <p v-else-if="!books.length" class="list-panel-state muted">{{ listEmptyLabel }}</p>
        <ul v-else class="list">
          <li
            v-for="b in books"
            :key="b.id"
            class="list-row"
            :class="{ 'has-cover': !!b.cover_url }"
            :data-book-id="b.id"
          >
            <span class="title">{{ b.title }}</span>
            <span v-if="b.author" class="muted small author">{{ b.author }}</span>
            <span v-if="b.description" class="muted small desc">{{ b.description }}</span>
            <span class="muted small meta">
              <span v-if="b.category" class="cat-pill">{{ b.category }}</span>
              @{{ b.uploader_nickname }}<template v-if="isStaff"> · {{ fmt(b.size_bytes) }}</template>
            </span>
            <div class="row-actions">
              <button
                v-if="isPdfBook(b)"
                class="secondary read-btn"
                type="button"
                @click="openReader(b)"
              >
                читать
              </button>
              <button class="icon-btn-sm" type="button" aria-label="скачать" @click="onDownload(b)">
                <AppIcon name="download" :size="16" />
              </button>
              <button
                v-if="canManageBook(b)"
                class="icon-btn-sm"
                type="button"
                aria-label="изменить"
                @click="openEdit(b)"
              >
                <AppIcon name="edit" :size="16" />
              </button>
            </div>
            <img
              v-if="b.cover_url"
              :src="b.cover_url"
              alt=""
              class="book-cover"
              loading="lazy"
              decoding="async"
            />
          </li>
        </ul>
      </div>

      <PdfReader
        v-if="readerOpen && readerUrl"
        :url="readerUrl"
        :title="readerTitle"
        :progress-key="readerProgressKey ?? undefined"
        @close="closeReader"
      />

      <Teleport to="body">
        <div v-if="editOpen" class="edit-overlay" role="dialog" aria-modal="true" @click.self="closeEdit">
          <div class="edit-panel card" @click.stop>
            <header class="edit-head">
              <span class="muted">изменить</span>
              <button class="icon-btn" type="button" aria-label="закрыть" @click="closeEdit">
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
              <div class="cover-edit">
                <div class="cover-edit-row">
                  <label v-if="!editCoverUrl" class="cover-add secondary">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      hidden
                      :disabled="coverUploading"
                      @change="onEditCoverPick"
                    />
                    <AppIcon name="image" :size="16" />
                    обложка
                  </label>
                  <label v-else class="book-cover-pick">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      hidden
                      :disabled="coverUploading"
                      @change="onEditCoverPick"
                    />
                    <img :src="editCoverUrl" alt="" decoding="async" />
                  </label>
                  <button
                    v-if="editCoverUrl"
                    type="button"
                    class="secondary"
                    :disabled="coverUploading"
                    @click="editingId && removeCover(editingId)"
                  >
                    убрать
                  </button>
                </div>
              </div>
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
      </Teleport>
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

.active-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 0.35rem;
}

.active-chip {
  padding: 0.3rem 0.75rem;
  border-radius: var(--radius-pill);
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.82rem;
}

.active-chip:hover {
  color: var(--text);
}

.info {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}

.list-row {
  display: grid;
  column-gap: 0.75rem;
  row-gap: 0.2rem;
  align-items: start;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "title actions"
    "author actions"
    "desc desc"
    "meta meta";
}

.list-row.has-cover {
  grid-template-columns: minmax(0, 1fr) 60px;
  grid-template-areas:
    "title actions"
    "author actions"
    "desc cover"
    "meta cover";
}

.title {
  grid-area: title;
  font-size: 0.95rem;
  text-transform: none;
}

.author {
  grid-area: author;
}

.desc {
  grid-area: desc;
  white-space: pre-wrap;
}

.meta {
  grid-area: meta;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.15rem;
}

.row-actions {
  grid-area: actions;
}

.book-cover {
  grid-area: cover;
  justify-self: end;
  align-self: start;
  display: block;
  width: 60px;
  height: 90px;
  object-fit: cover;
  border-radius: 3px;
}

.list-row:not(:has(.author)) {
  grid-template-areas:
    "title actions"
    "desc desc"
    "meta meta";
}

.list-row.has-cover:not(:has(.author)) {
  grid-template-areas:
    "title actions"
    "desc cover"
    "meta cover";
}

.small {
  font-size: 0.8rem;
}

.cat-pill {
  display: inline-block;
  padding: 0.05rem 0.45rem;
  border-radius: var(--radius);
  background: var(--surface2);
  color: var(--text);
  font-size: 0.74rem;
}

.cover-add {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
  width: fit-content;
}

.cover-add input {
  display: none;
}

.book-cover-pick {
  display: block;
  width: 52px;
  height: 74px;
  cursor: pointer;
}

.book-cover-pick img {
  display: block;
  width: 52px;
  height: 74px;
  object-fit: cover;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface);
}

.cover-edit {
  display: grid;
  gap: 0.35rem;
}

.cover-edit-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  justify-self: end;
  gap: 0.15rem;
  flex-wrap: nowrap;
  flex-shrink: 0;
}

.read-btn {
  min-height: 0;
  padding: 0.3rem 0.55rem;
  font-size: 0.78rem;
}

.row-actions button {
  min-height: 0;
}

@media (max-width: 640px) {
  .list-row.has-cover {
    grid-template-columns: minmax(0, 1fr) 52px;
  }

  .book-cover {
    width: 52px;
    height: 78px;
  }

  .desc {
    line-height: 1.45;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
    overflow: hidden;
  }
}

.edit-overlay {
  position: fixed;
  inset: 0;
  z-index: 130;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.edit-panel {
  width: min(420px, 100%);
  padding: 1rem;
  display: grid;
  gap: 0.75rem;
  max-height: 90vh;
  max-height: 90dvh;
  overflow-y: auto;
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
</style>
