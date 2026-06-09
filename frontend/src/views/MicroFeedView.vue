<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import PageHeader from "../components/PageHeader.vue";
import FilterSearch from "../components/FilterSearch.vue";
import MicroComposer from "../components/MicroComposer.vue";
import MicroItem from "../components/MicroItem.vue";
import { listMicro, type MicroPost } from "../api/micro";
import { useAuthStore } from "../stores/auth";

type Feed = "all" | "following";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const posts = ref<MicroPost[]>([]);
const err = ref("");
const loading = ref(false);
const q = ref(typeof route.query.q === "string" ? route.query.q : "");
const feed = ref<Feed>("all");
let loadSeq = 0;

async function load() {
  const seq = ++loadSeq;
  err.value = "";
  const showLoading = !posts.value.length;
  if (showLoading) loading.value = true;
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

function search() {
  router.replace({ query: q.value.trim() ? { q: q.value.trim() } : {} });
  void load();
}

watch(feed, load);
watch(
  () => route.query.q,
  (v) => {
    const next = typeof v === "string" ? v : "";
    if (next !== q.value) {
      q.value = next;
      void load();
    }
  },
);
onMounted(load);
</script>

<template>
  <section class="feed page-shell">
    <PageHeader title="лента" />

    <div class="filter-bar">
      <FilterSearch v-model="q" @enter="search" @input="() => { if (!q.trim()) search(); }" />
      <div v-if="auth.token" class="filter-tabs">
        <button class="filter-tab" :class="{ on: feed === 'all' }" type="button" @click="feed = 'all'">все</button>
        <button class="filter-tab" :class="{ on: feed === 'following' }" type="button" @click="feed = 'following'">
          подписки
        </button>
      </div>
    </div>

    <MicroComposer v-if="auth.token" @posted="onPosted" />
    <p v-else class="muted login-hint">
      <RouterLink to="/login">войдите</RouterLink>, чтобы публиковать
    </p>

    <p v-if="err" class="error">{{ err }}</p>
    <p v-else-if="loading && !posts.length" class="muted">загрузка</p>
    <p v-else-if="!loading && !posts.length" class="muted empty">пусто</p>

    <MicroItem
      v-for="p in posts"
      :key="p.id"
      :post="p"
      clickable
      @deleted="onDeleted"
      @updated="onUpdated"
    />
  </section>
</template>

<style scoped>
.feed {
  display: grid;
  gap: 0;
}
.login-hint {
  padding: 1rem 0;
  border-bottom: 1px solid var(--border);
}
.empty {
  text-align: center;
  margin-top: 4vh;
}
</style>
