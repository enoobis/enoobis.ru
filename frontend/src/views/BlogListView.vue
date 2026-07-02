<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import PageHeader from "../components/PageHeader.vue";
import AppLoading from "../components/AppLoading.vue";
import PostMetaStats from "../components/PostMetaStats.vue";
import {
  listMyBookmarks,
  listPosts,
  listTags,
  type BlogListItem,
  type TaxonomyItem,
} from "../api/blog";
import { useAuthStore } from "../stores/auth";

type SortKey = "new" | "popular" | "discussed";
type Mode = "all" | "bookmarks";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const posts = ref<BlogListItem[]>([]);
const err = ref("");
const loading = ref(false);
const total = ref(0);
const page = ref(1);
const pageSize = 20;

const q = ref("");
const tag = ref("");
const sort = ref<SortKey>("new");
const mode = ref<Mode>("all");
const blogTags = ref<TaxonomyItem[]>([]);

const sortedPosts = computed(() => {
  const items = posts.value.slice();
  if (sort.value === "popular") items.sort((a, b) => b.up_count - a.up_count);
  else if (sort.value === "discussed") items.sort((a, b) => b.comment_count - a.comment_count);
  return items;
});

const activeChips = computed(() => {
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (q.value.trim()) {
    chips.push({
      key: "q",
      label: q.value.trim(),
      clear: () => {
        q.value = "";
        pushQuery();
      },
    });
  }
  return chips;
});

function setSort(next: SortKey) {
  if (sort.value === next) return;
  sort.value = next;
  pushQuery();
}

function setMode(next: Mode) {
  if (mode.value === next) return;
  mode.value = next;
  pushQuery();
}

function onTagChange() {
  pushQuery();
}

async function loadBlogTags() {
  try {
    blogTags.value = await listTags();
  } catch {
    blogTags.value = [];
  }
}

function syncFromRoute() {
  q.value = typeof route.query.q === "string" ? route.query.q : "";
  tag.value = typeof route.query.tag === "string" ? route.query.tag : "";
  sort.value =
    route.query.sort === "popular" || route.query.sort === "discussed"
      ? route.query.sort
      : "new";
  mode.value = route.query.mode === "bookmarks" ? "bookmarks" : "all";
}

function buildQuery() {
  const query: Record<string, string> = {};
  if (q.value.trim()) query.q = q.value.trim();
  if (tag.value) query.tag = tag.value;
  if (sort.value !== "new") query.sort = sort.value;
  if (mode.value === "bookmarks") query.mode = "bookmarks";
  return query;
}

function pushQuery() {
  router.replace({ path: "/blogs", query: buildQuery() });
}

async function load() {
  err.value = "";
  const showLoading = !posts.value.length;
  if (showLoading) loading.value = true;
  try {
    const query = {
      page: page.value,
      page_size: pageSize,
      q: q.value.trim() || undefined,
      tag: tag.value || undefined,
    };
    const data =
      mode.value === "bookmarks" && auth.token
        ? await listMyBookmarks(auth.token, query)
        : await listPosts(query);
    posts.value = data.items;
    total.value = data.total;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    loading.value = false;
  }
}

function reload() {
  page.value = 1;
  void load();
}

function resetAll() {
  q.value = "";
  tag.value = "";
  sort.value = "new";
  mode.value = "all";
  pushQuery();
}

const listEmptyLabel = computed(() => (q.value.trim() ? "ничего не найдено" : "пусто"));

function prev() {
  if (page.value === 1) return;
  page.value -= 1;
  void load();
}

function next() {
  if (page.value * pageSize >= total.value) return;
  page.value += 1;
  void load();
}

watch(
  () => route.query,
  () => {
    syncFromRoute();
    reload();
  },
  { deep: true },
);

onMounted(() => {
  syncFromRoute();
  void loadBlogTags();
  void load();
});
</script>

<template>
  <section class="blog page-shell">
    <PageHeader title="блоги" />

    <div class="filter-bar">
      <div class="filter-tabs">
        <button
          type="button"
          class="filter-tab"
          :class="{ on: sort === 'new' }"
          @click="setSort('new')"
        >
          новые
        </button>
        <button
          type="button"
          class="filter-tab"
          :class="{ on: sort === 'popular' }"
          @click="setSort('popular')"
        >
          популярные
        </button>
        <button
          type="button"
          class="filter-tab"
          :class="{ on: sort === 'discussed' }"
          @click="setSort('discussed')"
        >
          обсуждаемые
        </button>
      </div>
      <select
        v-if="blogTags.length"
        v-model="tag"
        class="filter-select"
        aria-label="тег"
        @change="onTagChange"
      >
        <option value="">все теги</option>
        <option v-for="t in blogTags" :key="t.slug" :value="t.slug">
          {{ t.name }} · {{ t.post_count }}
        </option>
      </select>
      <div v-if="auth.token" class="filter-tabs">
        <button
          type="button"
          class="filter-tab"
          :class="{ on: mode === 'all' }"
          @click="setMode('all')"
        >
          все
        </button>
        <button
          type="button"
          class="filter-tab"
          :class="{ on: mode === 'bookmarks' }"
          @click="setMode('bookmarks')"
        >
          закладки
        </button>
      </div>
    </div>

    <div v-if="activeChips.length" class="active-chips">
      <button v-for="c in activeChips" :key="c.key" class="active-chip" type="button" @click="c.clear">
        {{ c.label }} ×
      </button>
      <button class="active-chip clear" type="button" @click="resetAll">сбросить</button>
    </div>

    <p v-if="err" class="error">{{ err }}</p>
    <AppLoading v-else-if="loading && !sortedPosts.length" />
    <template v-else>
      <ul v-if="sortedPosts.length" class="post-list">
        <li v-for="p in sortedPosts" :key="p.id">
          <RouterLink :to="`/blogs/${p.id}`" class="post-title">{{ p.title }}</RouterLink>
          <p v-if="p.excerpt" class="excerpt muted">{{ p.excerpt }}</p>
          <div class="meta muted">
            <span>{{ p.author_nickname }}</span>
            <span>·</span>
            <span>{{ (p.published_at || p.created_at).slice(0, 10) }}</span>
            <template v-if="p.up_count || p.down_count || p.comment_count">
              <span>·</span>
              <PostMetaStats
                :up-count="p.up_count"
                :down-count="p.down_count"
                :comment-count="p.comment_count"
              />
            </template>
          </div>
        </li>
      </ul>
      <p v-else class="page-empty muted">{{ listEmptyLabel }}</p>

      <div v-if="total > pageSize" class="pager muted">
        <button class="link" type="button" :disabled="page === 1" @click="prev">←</button>
        <span>{{ page }}</span>
        <button class="link" type="button" :disabled="page * pageSize >= total" @click="next">→</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.active-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 1rem;
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
.active-chip.clear {
  border-style: dashed;
}

.post-list {
  list-style: none;
  padding: 0;
  margin: 1rem 0 0;
  display: grid;
  gap: 1.6rem;
}
.post-list li {
  display: grid;
  gap: 0.3rem;
}
.post-title {
  color: var(--text);
  font-size: 1.1rem;
  font-weight: 500;
}
.excerpt {
  margin: 0;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.82rem;
}
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 2rem;
  font-size: 0.88rem;
}
.link {
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 0.2rem 0.4rem;
  min-height: 0;
  cursor: pointer;
}
.link:hover:not(:disabled) {
  color: var(--text);
  background: transparent;
}
</style>
