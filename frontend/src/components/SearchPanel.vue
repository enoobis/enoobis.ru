<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import FilterSearch from "./FilterSearch.vue";
import AppLoading from "./AppLoading.vue";
import { listTags, type TaxonomyItem } from "../api/blog";
import { search, type SearchResponse } from "../api/search";
import { useAuthStore } from "../stores/auth";

type SearchScope = "global" | "blog" | "micro" | "library" | "courses" | "leaderboard";
type BlogSort = "new" | "popular" | "discussed";
type MicroFeed = "all" | "following";

const props = defineProps<{
  autofocus?: boolean;
  embedded?: boolean;
  /* controlled-режим: ввод живёт снаружи (инлайн-поиск в шапке) */
  query?: string;
}>();

const emit = defineEmits<{
  close: [];
  "update:query": [value: string];
}>();

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const scope = computed<SearchScope>(() => {
  if (route.query.scope === "blog" || route.path.startsWith("/blogs")) return "blog";
  if (route.query.scope === "micro" || route.path.startsWith("/microblogs")) return "micro";
  if (route.query.scope === "library" || route.path.startsWith("/library")) return "library";
  if (route.query.scope === "courses" || route.path.startsWith("/courses")) return "courses";
  if (route.query.scope === "leaderboard" || route.path.startsWith("/leaderboard")) return "leaderboard";
  return "global";
});

const controlled = computed(() => props.query !== undefined);
const placeholder = computed(() => {
  if (scope.value === "blog") return "поиск в блогах";
  if (scope.value === "micro") return "поиск в микроблогах";
  if (scope.value === "library") return "поиск книги";
  if (scope.value === "courses") return "поиск курса";
  if (scope.value === "leaderboard") return "поиск людей";
  return "поиск";
});
const q = ref(props.query ?? "");
const data = ref<SearchResponse>({ blog: [], micro: [], users: [] });
const loading = ref(false);
const err = ref("");

const blogSort = ref<BlogSort>("new");
const blogTag = ref("");
const blogTags = ref<TaxonomyItem[]>([]);

const microFeed = ref<MicroFeed>("all");

let timer: ReturnType<typeof setTimeout> | null = null;
let runSeq = 0;

function readQuery() {
  if (!controlled.value) {
    q.value = typeof route.query.q === "string" ? route.query.q : "";
  }
  blogSort.value =
    route.query.sort === "popular" || route.query.sort === "discussed"
      ? route.query.sort
      : "new";
  blogTag.value = typeof route.query.tag === "string" ? route.query.tag : "";
  microFeed.value = route.query.feed === "following" ? "following" : "all";
}

function blogQuery() {
  const query: Record<string, string> = {};
  if (q.value.trim()) query.q = q.value.trim();
  if (blogTag.value) query.tag = blogTag.value;
  if (blogSort.value !== "new") query.sort = blogSort.value;
  return query;
}

function microQuery() {
  const query: Record<string, string> = {};
  if (q.value.trim()) query.q = q.value.trim();
  if (microFeed.value === "following") query.feed = "following";
  return query;
}

function feedPath() {
  if (scope.value === "blog") return "/blogs";
  if (scope.value === "micro") return "/microblogs";
  if (scope.value === "library") return "/library";
  if (scope.value === "leaderboard") return "/leaderboard";
  return "/courses";
}

function feedQuery() {
  if (scope.value === "blog") return blogQuery();
  if (scope.value === "micro") return microQuery();
  const query: Record<string, string> = {};
  if (q.value.trim()) query.q = q.value.trim();
  return query;
}

function applyFeedSearch() {
  const query = feedQuery();
  if (props.embedded && route.path === feedPath()) {
    router.replace({ path: feedPath(), query });
    return;
  }
  router.push({ path: feedPath(), query });
  emit("close");
}

function onFeedInput() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(applyFeedSearch, 250);
}

function onEsc(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  if (q.value) {
    q.value = "";
    emit("update:query", "");
    if (scope.value === "global") onGlobalInput();
    else applyFeedSearch();
    return;
  }
  if (props.embedded) {
    emit("close");
    return;
  }
  router.back();
}

async function runGlobal() {
  err.value = "";
  if (!q.value.trim()) {
    runSeq++;
    loading.value = false;
    data.value = { blog: [], micro: [], users: [] };
    return;
  }
  const seq = ++runSeq;
  loading.value = true;
  try {
    const r = await search(q.value.trim());
    if (seq !== runSeq) return;
    data.value = r;
  } catch (e) {
    if (seq !== runSeq) return;
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    if (seq === runSeq) loading.value = false;
  }
}

function onGlobalInput() {
  if (!props.embedded) {
    router.replace({ query: q.value.trim() ? { q: q.value.trim() } : {} });
  }
  if (timer) clearTimeout(timer);
  timer = setTimeout(runGlobal, 250);
}

function onInput() {
  if (!q.value.trim()) {
    if (timer) clearTimeout(timer);
    timer = null;
    if (scope.value === "global") {
      if (!props.embedded) {
        router.replace({ query: {} });
      }
      void runGlobal();
      return;
    }
    applyFeedSearch();
    return;
  }
  if (scope.value === "global") onGlobalInput();
  else onFeedInput();
}

function onEnter() {
  if (scope.value === "global") void runGlobal();
  else applyFeedSearch();
}

async function loadBlogTags() {
  try {
    blogTags.value = await listTags();
  } catch {
    blogTags.value = [];
  }
}

watch(
  () => props.query,
  (v) => {
    if (v === undefined || v === q.value) return;
    q.value = v;
    onInput();
  },
);

watch(
  () => route.query,
  () => {
    readQuery();
    if (scope.value === "global" && !props.embedded) void runGlobal();
  },
  { deep: true },
);

watch(scope, (next) => {
  readQuery();
  if (next === "blog") void loadBlogTags();
  if (next === "global") void runGlobal();
});

onMounted(() => {
  window.addEventListener("keydown", onEsc);
  readQuery();
  if (scope.value === "blog") void loadBlogTags();
  if (scope.value === "global") void runGlobal();
});

onUnmounted(() => {
  window.removeEventListener("keydown", onEsc);
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <div class="search-panel" :class="{ 'search-panel--embedded': embedded }">
    <FilterSearch
      v-if="!controlled"
      v-model="q"
      :autofocus="autofocus"
      :placeholder="placeholder"
      @input="onInput"
      @enter="onEnter"
    />

    <div v-if="scope === 'blog'" class="context-filters">
      <div class="row">
        <span class="muted small">сортировка</span>
        <div class="chips">
          <button class="filter-chip" :class="{ on: blogSort === 'new' }" type="button" @click="blogSort = 'new'; applyFeedSearch()">
            новые
          </button>
          <button class="filter-chip" :class="{ on: blogSort === 'popular' }" type="button" @click="blogSort = 'popular'; applyFeedSearch()">
            популярные
          </button>
          <button class="filter-chip" :class="{ on: blogSort === 'discussed' }" type="button" @click="blogSort = 'discussed'; applyFeedSearch()">
            обсуждаемые
          </button>
        </div>
      </div>
      <div v-if="blogTags.length" class="row">
        <span class="muted small">тег</span>
        <select v-model="blogTag" @change="applyFeedSearch">
          <option value="">все</option>
          <option v-for="t in blogTags" :key="t.slug" :value="t.slug">{{ t.name }} · {{ t.post_count }}</option>
        </select>
      </div>
    </div>

    <div v-else-if="scope === 'micro' && auth.token" class="context-filters">
      <div class="row">
        <span class="muted small">лента</span>
        <div class="chips">
          <button class="filter-chip" :class="{ on: microFeed === 'all' }" type="button" @click="microFeed = 'all'; applyFeedSearch()">
            все
          </button>
          <button class="filter-chip" :class="{ on: microFeed === 'following' }" type="button" @click="microFeed = 'following'; applyFeedSearch()">
            подписки
          </button>
        </div>
      </div>
    </div>

    <template v-if="scope === 'global'">
      <p v-if="err" class="error">{{ err }}</p>
      <AppLoading v-else-if="loading" inline class="search-status" />
      <p
        v-else-if="q && !data.blog.length && !data.micro.length && !data.users.length"
        class="muted search-status"
      >
        ничего не найдено
      </p>

      <template v-else-if="q">
        <ul v-if="data.blog.length" class="results stagger-list">
          <li v-for="p in data.blog" :key="`b-${p.id}`">
            <RouterLink :to="`/blogs/${p.id}`" class="result-row" @click="emit('close')">
              <span class="result-title">{{ p.title }}</span>
              <span class="muted small">
                {{ p.author_nickname }} · {{ (p.published_at || p.created_at).slice(0, 10) }}
              </span>
            </RouterLink>
          </li>
        </ul>

        <ul v-if="data.micro.length" class="results stagger-list">
          <li v-for="m in data.micro" :key="`m-${m.id}`">
            <RouterLink :to="`/microblogs/${m.id}`" class="result-row" @click="emit('close')">
              <span class="result-title">{{ m.body }}</span>
              <span class="muted small">
                {{ m.author_nickname }} · {{ m.created_at.slice(0, 10) }}
              </span>
            </RouterLink>
          </li>
        </ul>

        <ul v-if="data.users.length" class="results stagger-list">
          <li v-for="u in data.users" :key="`u-${u.nickname}`">
            <RouterLink :to="`/u/${u.nickname}`" class="result-row result-row--user" @click="emit('close')">
              <span class="avatar">
                <img v-if="u.avatar_url" :src="u.avatar_url" alt="" />
                <span v-else>{{ u.nickname.slice(0, 2) }}</span>
              </span>
              <span class="result-copy">
                <span class="result-title">{{ u.full_name || u.nickname }}</span>
                <span class="muted small">@{{ u.nickname }}</span>
              </span>
            </RouterLink>
          </li>
        </ul>
      </template>
    </template>
  </div>
</template>

<style scoped>
.search-panel {
  display: grid;
  gap: 0.75rem;
}

.search-panel--embedded {
  gap: 0.65rem;
}

.search-panel .filter-search {
  margin: 0;
}

.context-filters {
  display: grid;
  gap: 0.55rem;
  padding-top: 0.15rem;
}

.row {
  display: grid;
  grid-template-columns: 72px 1fr;
  align-items: center;
  gap: 0.55rem;
}

.chips {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}

.search-status {
  margin: 0;
  padding: 0.15rem 0.1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.results {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.15rem;
}

.result-row {
  display: grid;
  gap: 0.12rem;
  padding: 0.6rem 0.7rem;
  color: var(--text);
  border-radius: var(--radius);
}

.result-row--user {
  grid-template-columns: var(--avatar-md) 1fr;
  align-items: center;
  gap: 0.6rem;
}

.result-row:hover {
  background: var(--surface2);
  text-decoration: none;
}

.result-title {
  font-weight: 600;
  font-size: 1.05rem;
  line-height: 1.35;
  white-space: pre-wrap;
}

.result-copy {
  display: grid;
  gap: 0.08rem;
  min-width: 0;
}

.avatar {
  width: var(--avatar-md);
  height: var(--avatar-md);
  border-radius: var(--avatar-radius);
  border: 1px solid var(--border);
  background: var(--surface);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--muted);
  font-weight: 600;
  font-size: var(--text-xs);
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.small {
  font-size: var(--text-xs);
}

@media (max-width: 500px) {
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
