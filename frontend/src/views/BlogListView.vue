<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import AppIcon from "../components/AppIcon.vue";
import {
  listCategories,
  listMyBookmarks,
  listPosts,
  listTags,
  type BlogListItem,
  type TaxonomyItem,
} from "../api/blog";
import { useAuthStore } from "../stores/auth";

const posts = ref<BlogListItem[]>([]);
const tags = ref<TaxonomyItem[]>([]);
const categories = ref<TaxonomyItem[]>([]);
const err = ref("");
const loading = ref(false);
const total = ref(0);
const page = ref(1);
const pageSize = 10;
const q = ref("");
const tag = ref("");
const category = ref("");
const mode = ref<"all" | "bookmarks">("all");
const auth = useAuthStore();

async function loadTaxonomy() {
  try {
    tags.value = await listTags();
    categories.value = await listCategories();
  } catch {
    tags.value = [];
    categories.value = [];
  }
}

async function loadPosts() {
  err.value = "";
  loading.value = true;
  try {
    const query = {
      page: page.value,
      page_size: pageSize,
      q: q.value.trim() || undefined,
      tag: tag.value || undefined,
      category: category.value || undefined,
    };
    const data =
      mode.value === "bookmarks" && auth.token
        ? await listMyBookmarks(auth.token, query)
        : await listPosts(query);
    posts.value = data.items;
    total.value = data.total;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  loadPosts();
}

function prev() {
  if (page.value === 1) return;
  page.value -= 1;
  loadPosts();
}

function next() {
  if (page.value * pageSize >= total.value) return;
  page.value += 1;
  loadPosts();
}

onMounted(async () => {
  await Promise.all([loadTaxonomy(), loadPosts()]);
});
</script>

<template>
  <section>
    <div class="card" style="margin-bottom: 1rem">
      <div class="grid-2">
        <div>
          <label>Поиск</label>
          <input v-model="q" placeholder="по заголовку или тексту" @keydown.enter.prevent="search" />
        </div>
        <div>
          <label>Тег</label>
          <select v-model="tag" @change="search">
            <option value="">Все теги</option>
            <option v-for="t in tags" :key="t.slug" :value="t.slug">{{ t.name }} ({{ t.post_count }})</option>
          </select>
        </div>
      </div>
      <div style="margin-top: 0.75rem; display: grid; gap: 0.75rem; grid-template-columns: 1fr auto">
        <div>
          <label>Категория</label>
          <select v-model="category" @change="search">
            <option value="">Все категории</option>
            <option v-for="c in categories" :key="c.slug" :value="c.slug">{{ c.name }} ({{ c.post_count }})</option>
          </select>
        </div>
        <button type="button" style="align-self: end" @click="search">Применить</button>
      </div>
      <div v-if="auth.token" style="display: flex; gap: 0.5rem; margin-top: 0.75rem">
        <button
          class="secondary"
          type="button"
          :disabled="mode === 'all'"
          @click="mode = 'all'; search()"
        >
          Все посты
        </button>
        <button
          class="secondary"
          type="button"
          :disabled="mode === 'bookmarks'"
          @click="mode = 'bookmarks'; search()"
        >
          Мои закладки
        </button>
      </div>
    </div>

    <div
      v-if="auth.token && (auth.role === 'teacher' || auth.role === 'admin')"
      class="card"
      style="margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem"
    >
      <span class="muted">Материалы для авторов</span>
      <RouterLink to="/blog/write" class="nav-link" style="display: inline-flex; align-items: center; gap: 0.4rem">
        <AppIcon name="write" />
        <span>Написать</span>
      </RouterLink>
    </div>

    <p v-if="err" class="error">{{ err }}</p>
    <p v-else-if="loading" class="muted">Загрузка...</p>
    <template v-else>
      <article v-for="p in posts" :key="p.id" class="card" style="margin-bottom: 1rem">
        <img
          v-if="p.cover_image_url"
          :src="p.cover_image_url"
          alt=""
          style="width: 100%; max-height: 220px; object-fit: cover; border-radius: 10px; border: 1px solid var(--border); margin-bottom: 0.6rem"
        />
        <h2 style="font-size: 1.15rem; margin-bottom: 0.25rem">
          <RouterLink :to="`/blog/${p.id}`">{{ p.title }}</RouterLink>
        </h2>
        <div class="muted">{{ p.author_nickname }} · {{ (p.published_at || p.created_at).slice(0, 16).replace("T", " ") }}</div>
        <p style="margin-top: 0.5rem">{{ p.excerpt }}</p>
        <div class="muted post-meta">
          <span class="meta-item"><AppIcon name="like" :size="14" /> {{ p.like_count }}</span>
          <span class="meta-item"><AppIcon name="comment" :size="14" /> {{ p.comment_count }}</span>
          <span class="meta-item"><AppIcon name="tag" :size="14" /> {{ p.tags.join(", ") || "none" }}</span>
        </div>
      </article>
      <p v-if="!posts.length" class="muted">Постов пока нет.</p>
      <div style="display: flex; align-items: center; gap: 0.5rem">
        <button class="secondary" type="button" :disabled="page === 1" @click="prev">Назад</button>
        <span class="muted">Страница {{ page }} · {{ total }} записей</span>
        <button
          class="secondary"
          type="button"
          :disabled="page * pageSize >= total"
          @click="next"
        >
          Далее
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.post-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}
.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
</style>
