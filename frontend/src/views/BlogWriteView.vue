<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { createPost, deletePost, getPostForEdit, publishPost, updatePost, uploadBlogImage } from "../api/blog";
import { useAuthStore } from "../stores/auth";
const auth = useAuthStore();
const route = useRoute();
const title = ref("");
const body = ref("");
const excerpt = ref("");
const slug = ref("");
const cover_image_url = ref("");
const tagsText = ref("");
const categoriesText = ref("");
const err = ref("");
const loading = ref(false);
const bodyInput = ref<HTMLTextAreaElement | null>(null);
const router = useRouter();

const editId = computed(() => (typeof route.params.id === "string" ? route.params.id : ""));
const isEdit = computed(() => !!editId.value);
const wordCount = computed(() =>
  body.value
    .replace(/[#_*`\-\[\]()!>]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length,
);
const readMinutes = computed(() => Math.max(1, Math.ceil(wordCount.value / 220)));

function parseCsv(input: string) {
  return input
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

async function loadForEdit() {
  if (!isEdit.value || !auth.token) return;
  loading.value = true;
  try {
    const post = await getPostForEdit(editId.value, auth.token);
    title.value = post.title;
    body.value = post.body;
    excerpt.value = post.excerpt;
    slug.value = post.slug;
    cover_image_url.value = post.cover_image_url;
    tagsText.value = post.tags.join(", ");
    categoriesText.value = post.categories.join(", ");
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  } finally {
    loading.value = false;
  }
}

async function save(targetStatus: "draft" | "published") {
  if (!auth.token) return;
  err.value = "";
  try {
    const payload = {
      title: title.value,
      body: body.value,
      excerpt: excerpt.value || undefined,
      slug: slug.value || undefined,
      cover_image_url: cover_image_url.value || undefined,
      status: targetStatus,
      tags: parseCsv(tagsText.value),
      categories: parseCsv(categoriesText.value),
    } as const;

    if (isEdit.value) {
      const updated = await updatePost(editId.value, auth.token, payload);
      if (targetStatus === "published" && updated.status !== "published") {
        await publishPost(updated.id, auth.token);
      }
      await router.push(`/blog/${editId.value}`);
    } else {
      const created = await createPost(auth.token, payload);
      if (targetStatus === "published" && created.status !== "published") {
        await publishPost(created.id, auth.token);
      }
      await router.push(`/blog/${created.id}`);
    }
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

async function remove() {
  if (!isEdit.value || !auth.token) return;
  if (!confirm("Удалить пост?")) return;
  try {
    await deletePost(editId.value, auth.token);
    await router.push("/blog");
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

async function uploadImageFile(ev: Event) {
  if (!auth.token) return;
  const input = ev.target as HTMLInputElement;
  if (!input.files?.length) return;
  try {
    const r = await uploadBlogImage(input.files[0], auth.token, editId.value || undefined);
    insertRaw(`\n![image](${r.url})\n`);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  } finally {
    input.value = "";
  }
}

async function uploadCoverFile(ev: Event) {
  if (!auth.token) return;
  const input = ev.target as HTMLInputElement;
  if (!input.files?.length) return;
  try {
    const r = await uploadBlogImage(input.files[0], auth.token, editId.value || undefined);
    cover_image_url.value = r.url;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  } finally {
    input.value = "";
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

function insertWrap(prefix: string, suffix = prefix) {
  const el = bodyInput.value;
  if (!el) {
    body.value += `${prefix}text${suffix}`;
    return;
  }
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? start;
  const left = body.value.slice(0, start);
  const selected = body.value.slice(start, end) || "text";
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
  const left = body.value.slice(0, start);
  const right = body.value.slice(start);
  body.value = `${left}\n${prefix}${right}`;
  nextTick(() => {
    const pos = left.length + prefix.length + 1;
    el.focus();
    el.setSelectionRange(pos, pos);
  });
}

function addLink() {
  const url = prompt("Вставьте URL", "https://");
  if (!url) return;
  const el = bodyInput.value;
  if (!el) {
    body.value += `[link](${url})`;
    return;
  }
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? start;
  const left = body.value.slice(0, start);
  const selected = body.value.slice(start, end) || "link";
  const right = body.value.slice(end);
  body.value = `${left}[${selected}](${url})${right}`;
}

onMounted(loadForEdit);
</script>

<template>
  <div class="card" style="max-width: 980px">
    <h1>{{ isEdit ? "Редактирование записи" : "Новая запись" }}</h1>
    <p v-if="err" class="error">{{ err }}</p>
    <p v-if="loading" class="muted">Загрузка...</p>
    <form v-else @submit.prevent="save('draft')">
      <label>Заголовок</label>
      <input v-model="title" required />
      <label style="display: block; margin-top: 0.75rem">Slug</label>
      <input v-model="slug" placeholder="если пусто, создастся автоматически" />
      <label style="display: block; margin-top: 0.75rem">Кратко</label>
      <input v-model="excerpt" placeholder="короткое описание" />
      <label style="display: block; margin-top: 0.75rem">Обложка (файл)</label>
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="uploadCoverFile" />
      <img
        v-if="cover_image_url"
        :src="cover_image_url"
        alt="cover preview"
        style="margin-top: 0.5rem; max-width: 100%; border-radius: 10px; border: 1px solid var(--border)"
      />
      <label style="display: block; margin-top: 0.75rem">Теги</label>
      <input v-model="tagsText" placeholder="Введите теги через запятую (опционально)" />
      <label style="display: block; margin-top: 0.75rem">Категории</label>
      <input v-model="categoriesText" placeholder="news, guides" />
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.75rem">
        <label>Текст</label>
        <span class="muted">{{ wordCount }} слов · ~{{ readMinutes }} мин чтения</span>
      </div>

      <div class="editor-toolbar">
        <button class="secondary" type="button" @click="insertWrap('**')"><b>B</b></button>
        <button class="secondary" type="button" @click="insertWrap('*')"><i>I</i></button>
        <button class="secondary" type="button" @click="insertLine('# ')">H1</button>
        <button class="secondary" type="button" @click="insertLine('## ')">H2</button>
        <button class="secondary" type="button" @click="insertLine('### ')">H3</button>
        <button class="secondary" type="button" @click="addLink">Link</button>
        <button class="secondary" type="button" @click="insertLine('- ')">List</button>
        <button class="secondary" type="button" @click="insertLine('> ')">Quote</button>
        <button class="secondary" type="button" @click="insertWrap('`')">Code</button>
      </div>

      <div class="editor-grid">
        <textarea
          ref="bodyInput"
          v-model="body"
          rows="18"
          required
          placeholder="Write in Markdown..."
        />
      </div>

      <label style="display: block; margin-top: 0.75rem">Картинка в пост</label>
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="uploadImageFile" />
      <div style="display: flex; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap">
        <button type="submit">Сохранить в черновики</button>
        <button class="secondary" type="button" @click="save('published')">Опубликовать</button>
        <button v-if="isEdit" class="secondary" type="button" @click="remove">Удалить</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.editor-toolbar {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-top: 0.4rem;
}
.editor-grid {
  margin-top: 0.5rem;
}
</style>
