<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import PageHeader from "../components/PageHeader.vue";
import AppIcon from "../components/AppIcon.vue";
import AppSkeleton from "../components/AppSkeleton.vue";
import PostMetaStats from "../components/PostMetaStats.vue";
import PullToRefresh from "../components/PullToRefresh.vue";
import {
  listPosts,
  listTags,
  type BlogListItem,
  type TaxonomyItem,
} from "../api/blog";

type SortKey = "new" | "popular" | "discussed";

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
const blogTags = ref<TaxonomyItem[]>([]);
const tagOpen = ref(false);
const tagMenuRoot = ref<HTMLElement | null>(null);

const tagButtonLabel = computed(() => {
  if (!tag.value) return "все теги";
  const t = blogTags.value.find((x) => x.slug === tag.value);
  return t ? t.name : "все теги";
});

function selectTag(slug: string) {
  tag.value = slug;
  tagOpen.value = false;
  onTagChange();
}

function onDocumentClick(event: MouseEvent) {
  if (!tagOpen.value) return;
  const target = event.target as HTMLElement | null;
  const root = tagMenuRoot.value;
  if (root && target && root.contains(target)) return;
  tagOpen.value = false;
}

const sortedPosts = computed(() => {
  const items = posts.value.slice();
  const pinFirst = (a: BlogListItem, b: BlogListItem) =>
    Number(!!b.is_pinned) - Number(!!a.is_pinned);
  if (sort.value === "popular") {
    items.sort((a, b) => pinFirst(a, b) || b.up_count - a.up_count);
  } else if (sort.value === "discussed") {
    items.sort((a, b) => pinFirst(a, b) || b.comment_count - a.comment_count);
  } else {
    items.sort(pinFirst);
  }
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
}

function buildQuery() {
  const query: Record<string, string> = {};
  if (q.value.trim()) query.q = q.value.trim();
  if (tag.value) query.tag = tag.value;
  if (sort.value !== "new") query.sort = sort.value;
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
    const data = await listPosts({
      page: page.value,
      page_size: pageSize,
      q: q.value.trim() || undefined,
      tag: tag.value || undefined,
    });
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
    if (route.query.mode === "bookmarks") {
      void router.replace("/blogs/saved");
      return;
    }
    syncFromRoute();
    reload();
  },
  { deep: true },
);

onMounted(() => {
  document.addEventListener("click", onDocumentClick);
  if (route.query.mode === "bookmarks") {
    void router.replace("/blogs/saved");
    return;
  }
  syncFromRoute();
  void loadBlogTags();
  void load();
});

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocumentClick);
});
</script>

<template>
  <PullToRefresh :refresh="load">
  <section class="blog page-shell">
    <PageHeader title="блоги" />

    <div class="filter-bar filter-bar--stack">
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
      <div v-if="blogTags.length" ref="tagMenuRoot" class="filter-menu-wrap">
        <button
          type="button"
          class="filter-trigger"
          :class="{ on: tagOpen || !!tag }"
          aria-label="тег"
          aria-haspopup="listbox"
          :aria-expanded="tagOpen"
          @click.stop="tagOpen = !tagOpen"
        >
          <span>{{ tagButtonLabel }}</span>
        </button>
        <div v-if="tagOpen" class="filter-menu" role="listbox">
          <button
            type="button"
            class="filter-menu-opt"
            :class="{ on: !tag }"
            role="option"
            @click="selectTag('')"
          >
            все теги
          </button>
          <button
            v-for="t in blogTags"
            :key="t.slug"
            type="button"
            class="filter-menu-opt"
            :class="{ on: tag === t.slug }"
            role="option"
            @click="selectTag(t.slug)"
          >
            <span>{{ t.name }}</span>
            <span class="muted small">{{ t.post_count }}</span>
          </button>
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
    <AppSkeleton v-else-if="loading && !sortedPosts.length" :rows="6" />
    <template v-else>
      <ul v-if="sortedPosts.length" class="list post-list stagger-list">
        <li v-for="p in sortedPosts" :key="p.id">
          <RouterLink :to="`/blogs/${p.id}`" class="post-title">
            <AppIcon v-if="p.is_pinned" name="pinned" :size="14" class="pin-mark" />
            <span>{{ p.title }}</span>
          </RouterLink>
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
  </PullToRefresh>
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
  font-size: var(--text-xs);
}
.active-chip:hover {
  color: var(--text);
}
.active-chip.clear {
  border-style: dashed;
}

.post-list li {
  display: grid;
  gap: 0.3rem;
}
.post-title {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--text);
  font-size: 1.1rem;
  font-weight: 500;
}
.pin-mark {
  flex-shrink: 0;
  color: var(--muted);
}
.excerpt {
  margin: 0;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  font-size: var(--text-sm);
}
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 2rem;
  font-size: var(--text-sm);
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
