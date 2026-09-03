<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import PageHeader from "../components/PageHeader.vue";
import AppLoading from "../components/AppLoading.vue";
import MicroComposer from "../components/MicroComposer.vue";
import MicroItem from "../components/MicroItem.vue";
import PullToRefresh from "../components/PullToRefresh.vue";
import { listMicro, type MicroPost } from "../api/micro";
import { useAuthStore } from "../stores/auth";

type Feed = "all" | "following";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const posts = ref<MicroPost[]>([]);
const err = ref("");
const loading = ref(false);
const q = ref("");
const feed = ref<Feed>("all");
let loadSeq = 0;

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

function setFeed(next: Feed) {
  if (feed.value === next) return;
  feed.value = next;
  pushQuery();
}

const listEmptyLabel = computed(() => (q.value.trim() ? "ничего не найдено" : "пусто"));

function syncFromRoute() {
  q.value = typeof route.query.q === "string" ? route.query.q : "";
  feed.value = route.query.feed === "following" ? "following" : "all";
}

function buildQuery() {
  const query: Record<string, string> = {};
  if (q.value.trim()) query.q = q.value.trim();
  if (feed.value === "following") query.feed = "following";
  return query;
}

function pushQuery() {
  router.replace({ path: "/microblogs", query: buildQuery() });
}

async function load() {
  const seq = ++loadSeq;
  err.value = "";
  loading.value = true;
  try {
    const data = await listMicro(
      {
        page: 1,
        page_size: 50,
        q: q.value.trim() || undefined,
        feed: feed.value === "following" ? "following" : undefined,
      },
      auth.token,
    );
    if (seq !== loadSeq) return;
    posts.value = data.items;
  } catch (e) {
    if (seq !== loadSeq) return;
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

function onPosted(post: MicroPost) {
  posts.value = [post, ...posts.value];
}

function onDeleted(id: string) {
  posts.value = posts.value.filter((p) => p.id !== id);
}

function onUpdated(updated: MicroPost) {
  posts.value = posts.value.map((p) => (p.id === updated.id ? updated : p));
}

function resetAll() {
  q.value = "";
  feed.value = "all";
  pushQuery();
}

watch(
  () => route.query,
  () => {
    syncFromRoute();
    posts.value = [];
    loading.value = true;
    void load();
  },
  { deep: true },
);

onMounted(() => {
  syncFromRoute();
  void load();
});
</script>

<template>
  <PullToRefresh :refresh="load">
  <section class="feed page-shell">
    <PageHeader title="лента" />

    <div v-if="auth.token" class="filter-bar filter-bar--stack">
      <div class="filter-tabs">
        <button
          type="button"
          class="filter-tab"
          :class="{ on: feed === 'all' }"
          @click="setFeed('all')"
        >
          все
        </button>
        <button
          type="button"
          class="filter-tab"
          :class="{ on: feed === 'following' }"
          @click="setFeed('following')"
        >
          подписки
        </button>
      </div>
    </div>

    <div v-if="activeChips.length" class="active-chips">
      <button v-for="c in activeChips" :key="c.key" class="active-chip" type="button" @click="c.clear">
        {{ c.label }} ×
      </button>
      <button class="active-chip clear" type="button" @click="resetAll">сбросить</button>
    </div>

    <MicroComposer v-if="auth.token" @posted="onPosted" />
    <p v-else class="muted login-hint">
      <RouterLink to="/login">войдите</RouterLink>, чтобы публиковать
    </p>

    <p v-if="err" class="error">{{ err }}</p>
    <AppLoading v-else-if="loading && !posts.length" class="page-empty" />
    <p v-else-if="!loading && !posts.length" class="page-empty muted">{{ listEmptyLabel }}</p>

    <MicroItem
      v-for="p in posts"
      :key="p.id"
      :post="p"
      clickable
      @deleted="onDeleted"
      @updated="onUpdated"
    />
  </section>
  </PullToRefresh>
</template>

<style scoped>
.feed {
  display: grid;
  gap: 0;
}
.active-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 0.75rem;
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
.login-hint {
  padding: 1rem 0;
  border-bottom: 1px solid var(--border);
}
</style>
