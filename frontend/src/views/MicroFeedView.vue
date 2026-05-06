<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import AppIcon from "../components/AppIcon.vue";
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

async function load() {
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
    posts.value = data.items;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    loading.value = false;
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
  <section class="feed">
    <MicroComposer v-if="auth.token" @posted="onPosted" />
    <p v-else class="muted login-hint">
      <RouterLink to="/login">войдите</RouterLink>, чтобы публиковать
    </p>

    <div class="bar">
      <div class="search">
        <AppIcon name="search" :size="14" />
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
      </div>
      <div v-if="auth.token" class="tabs">
        <button class="tab" :class="{ on: feed === 'all' }" type="button" @click="feed = 'all'">все</button>
        <button class="tab" :class="{ on: feed === 'following' }" type="button" @click="feed = 'following'">
          подписки
        </button>
      </div>
    </div>

    <p v-if="err" class="error">{{ err }}</p>
    <p v-else-if="loading" class="muted">загрузка</p>
    <p v-else-if="!posts.length" class="muted empty">пусто</p>

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
  max-width: 640px;
  margin: 0 auto;
}
.login-hint {
  padding: 1rem 0;
  border-bottom: 1px solid var(--border);
}
.bar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin: 0.6rem 0 0.4rem;
}
.search {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--muted);
}
.search:focus-within {
  color: var(--text);
  border-color: #3a3a3a;
}
.search input {
  flex: 1;
  border: none;
  background: transparent;
  padding: 0.15rem 0;
  color: var(--text);
  font-size: 0.92rem;
}
.search input:focus {
  outline: none;
}
.tabs {
  display: inline-flex;
  gap: 0.2rem;
}
.tab {
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 0.3rem 0.6rem;
  min-height: 0;
  font-size: 0.82rem;
  border-radius: 999px;
}
.tab:hover {
  color: var(--text);
  background: transparent;
}
.tab.on {
  color: var(--text);
  background: var(--surface);
}
.empty {
  text-align: center;
  margin-top: 4vh;
}
</style>
