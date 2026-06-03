<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import AppIcon from "../components/AppIcon.vue";
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
const posts = ref<BlogListItem[]>([]);
const tags = ref<TaxonomyItem[]>([]);
const err = ref("");
const loading = ref(false);
const total = ref(0);
const page = ref(1);
const pageSize = 20;

const q = ref("");
const tag = ref("");
const sort = ref<SortKey>("new");
const mode = ref<Mode>("all");
const filtersOpen = ref(false);

const sortedPosts = computed(() => {
  const items = posts.value.slice();
  if (sort.value === "popular") items.sort((a, b) => b.up_count - a.up_count);
  else if (sort.value === "discussed") items.sort((a, b) => b.comment_count - a.comment_count);
  return items;
});

const activeChips = computed(() => {
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (sort.value !== "new") {
    chips.push({
      key: "sort",
      label: sort.value === "popular" ? "по лайкам" : "по обсуждениям",
      clear: () => (sort.value = "new"),
    });
  }
  if (tag.value) {
    chips.push({ key: "tag", label: `#${tag.value}`, clear: () => { tag.value = ""; reload(); } });
  }
  if (mode.value === "bookmarks") {
    chips.push({ key: "bm", label: "закладки", clear: () => { mode.value = "all"; reload(); } });
  }
  return chips;
});

function syncModeFromRoute() {
  mode.value = route.query.mode === "bookmarks" ? "bookmarks" : "all";
}

async function loadTaxonomy() {
  try {
    tags.value = await listTags();
  } catch {
    tags.value = [];
  }
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
  load();
}

function search() {
  reload();
}

function resetAll() {
  q.value = "";
  tag.value = "";
  sort.value = "new";
  mode.value = "all";
  reload();
}

function prev() {
  if (page.value === 1) return;
  page.value -= 1;
  load();
}

function next() {
  if (page.value * pageSize >= total.value) return;
  page.value += 1;
  load();
}

watch([tag, mode], reload);

watch(
  () => route.query.mode,
  () => {
    syncModeFromRoute();
    reload();
  },
);

onMounted(async () => {
  syncModeFromRoute();
  await Promise.all([loadTaxonomy(), load()]);
});
</script>

<template>
  <section class="blog page-shell">
    <div class="filter-search" :class="{ active: filtersOpen }">
      <AppIcon name="search" :size="16" />
      <input
        v-model="q"
        placeholder="поиск"
        @keydown.enter.prevent="search"
        @input="
          () => {
            if (!q.trim()) search();
          }
        "
      />
      <button
        class="filter-icon-btn"
        type="button"
        :class="{ on: filtersOpen || activeChips.length }"
        :title="filtersOpen ? 'свернуть' : 'фильтры'"
        @click="filtersOpen = !filtersOpen"
      >
        <AppIcon name="filter" :size="16" />
      </button>
    </div>

    <div v-if="filtersOpen" class="filters">
      <div class="row">
        <span class="muted small">сортировка</span>
        <div class="chips">
          <button class="filter-chip" :class="{ on: sort === 'new' }" type="button" @click="sort = 'new'">новые</button>
          <button class="filter-chip" :class="{ on: sort === 'popular' }" type="button" @click="sort = 'popular'">популярные</button>
          <button class="filter-chip" :class="{ on: sort === 'discussed' }" type="button" @click="sort = 'discussed'">обсуждаемые</button>
        </div>
      </div>
      <div v-if="tags.length" class="row">
        <span class="muted small">тег</span>
        <select v-model="tag">
          <option value="">все</option>
          <option v-for="t in tags" :key="t.slug" :value="t.slug">{{ t.name }} · {{ t.post_count }}</option>
        </select>
      </div>
      <div v-if="auth.token" class="row">
        <span class="muted small">показать</span>
        <div class="chips">
          <button class="filter-chip" :class="{ on: mode === 'all' }" type="button" @click="mode = 'all'">все</button>
          <button class="filter-chip" :class="{ on: mode === 'bookmarks' }" type="button" @click="mode = 'bookmarks'">закладки</button>
        </div>
      </div>
    </div>

    <div v-if="activeChips.length" class="active-chips">
      <button v-for="c in activeChips" :key="c.key" class="active-chip" type="button" @click="c.clear">
        {{ c.label }} ×
      </button>
      <button class="active-chip clear" type="button" @click="resetAll">сбросить</button>
    </div>

    <p v-if="err" class="error">{{ err }}</p>
    <p v-else-if="loading && !sortedPosts.length" class="muted">загрузка</p>
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
      <p v-else class="muted empty">пусто</p>

      <div v-if="total > pageSize" class="pager muted">
        <button class="link" type="button" :disabled="page === 1" @click="prev">←</button>
        <span>{{ page }}</span>
        <button class="link" type="button" :disabled="page * pageSize >= total" @click="next">→</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.blog > .filter-search {
  margin-bottom: 0.6rem;
}

.filters {
  display: grid;
  gap: 0.6rem;
  padding: 0.8rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 0.6rem;
}
.row {
  display: grid;
  grid-template-columns: 100px 1fr;
  align-items: center;
  gap: 0.6rem;
}
.chips {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}
.active-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 1.5rem;
}
.active-chip {
  padding: 0.35rem 0.65rem;
  min-height: 38px;
  border-radius: var(--radius);
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
.empty {
  margin-top: 4vh;
  text-align: center;
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
.small {
  font-size: 0.78rem;
}

@media (max-width: 500px) {
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
