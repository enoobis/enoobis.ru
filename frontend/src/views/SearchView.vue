<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import AppIcon from "../components/AppIcon.vue";
import { search, type SearchResponse } from "../api/search";

const route = useRoute();
const router = useRouter();
const q = ref(typeof route.query.q === "string" ? route.query.q : "");
const data = ref<SearchResponse>({ blog: [], micro: [], users: [] });
const loading = ref(false);
const err = ref("");
let timer: ReturnType<typeof setTimeout> | null = null;

function onEsc(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (q.value) {
      q.value = "";
      onInput();
    } else {
      router.back();
    }
  }
}

async function run() {
  err.value = "";
  if (!q.value.trim()) {
    data.value = { blog: [], micro: [], users: [] };
    return;
  }
  loading.value = true;
  try {
    data.value = await search(q.value.trim());
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    loading.value = false;
  }
}

function onInput() {
  router.replace({ query: q.value.trim() ? { q: q.value.trim() } : {} });
  if (timer) clearTimeout(timer);
  timer = setTimeout(run, 250);
}

watch(
  () => route.query.q,
  (v) => {
    if (typeof v === "string" && v !== q.value) {
      q.value = v;
      void run();
    }
  },
);

onMounted(() => {
  window.addEventListener("keydown", onEsc);
  void run();
});

onUnmounted(() => {
  window.removeEventListener("keydown", onEsc);
});
</script>

<template>
  <section class="search-view">
    <div class="bar">
      <AppIcon name="search" :size="16" />
      <input
        v-model="q"
        autofocus
        placeholder="поиск по блогу, микро и людям"
        @input="onInput"
        @keydown.enter.prevent="run"
      />
      <kbd class="hint">esc</kbd>
    </div>

    <p v-if="err" class="error">{{ err }}</p>
    <p v-else-if="loading" class="muted">загрузка</p>
    <p
      v-else-if="q && !data.blog.length && !data.micro.length && !data.users.length"
      class="muted empty"
    >
      ничего не найдено
    </p>

    <template v-else-if="q">
      <section v-if="data.users.length" class="block">
        <h3 class="block-title muted small">люди</h3>
        <ul class="users">
          <li v-for="u in data.users" :key="u.nickname">
            <RouterLink :to="`/u/${u.nickname}`" class="user">
              <span class="avatar">
                <img v-if="u.avatar_url" :src="u.avatar_url" alt="" />
                <span v-else>{{ u.nickname.slice(0, 2) }}</span>
              </span>
              <span class="info">
                <span class="name">{{ u.full_name || u.nickname }}</span>
                <span class="muted small">@{{ u.nickname }}</span>
              </span>
            </RouterLink>
          </li>
        </ul>
      </section>

      <section v-if="data.blog.length" class="block">
        <h3 class="block-title muted small">блог</h3>
        <ul class="list">
          <li v-for="p in data.blog" :key="p.id">
            <RouterLink :to="`/blogs/${p.id}`" class="title">{{ p.title }}</RouterLink>
            <p v-if="p.excerpt" class="excerpt muted">{{ p.excerpt }}</p>
            <span class="muted small">
              {{ p.author_nickname }} · {{ (p.published_at || p.created_at).slice(0, 10) }}
            </span>
          </li>
        </ul>
      </section>

      <section v-if="data.micro.length" class="block">
        <h3 class="block-title muted small">микро</h3>
        <ul class="list">
          <li v-for="m in data.micro" :key="m.id">
            <RouterLink :to="`/microblogs/${m.id}`" class="micro-row">
              <span class="muted small">{{ m.author_nickname }}</span>
              <p class="body">{{ m.body }}</p>
            </RouterLink>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style scoped>
.search-view {
  max-width: 640px;
  margin: 0 auto;
}
.bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  margin-bottom: 1.5rem;
  color: var(--muted);
}
.bar:focus-within {
  color: var(--text);
  border-color: #3a3a3a;
}
.bar input {
  flex: 1;
  border: none;
  background: transparent;
  padding: 0.2rem 0;
  color: var(--text);
}
.bar input:focus {
  outline: none;
}
.hint {
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.05rem 0.35rem;
  font-size: 0.7rem;
  color: var(--muted);
  background: var(--surface);
  font-family: var(--mono, inherit);
  text-transform: lowercase;
}

.block {
  margin-bottom: 2rem;
}
.block-title {
  margin: 0 0 0.6rem;
  font-weight: 500;
  text-transform: lowercase;
  font-size: 0.78rem;
}

.users {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.4rem;
}
.user {
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 0.6rem;
  align-items: center;
  padding: 0.45rem 0;
  color: var(--text);
}
.user:hover {
  text-decoration: none;
}
.user:hover .name {
  color: var(--text);
}
.avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--avatar-radius);
  border: 1px solid var(--border);
  background: var(--surface);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--muted);
  font-weight: 500;
  font-size: 0.72rem;
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.info {
  display: flex;
  flex-direction: column;
}
.name {
  color: var(--text);
  font-size: 0.92rem;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 1.2rem;
}
.list li {
  display: grid;
  gap: 0.2rem;
}
.title {
  color: var(--text);
  font-weight: 500;
  font-size: 1rem;
}
.excerpt {
  margin: 0;
  font-size: 0.88rem;
}
.micro-row {
  display: grid;
  gap: 0.2rem;
  color: var(--text);
}
.micro-row:hover {
  text-decoration: none;
}
.micro-row .body {
  margin: 0;
  font-size: 0.92rem;
  white-space: pre-wrap;
}
.empty {
  margin-top: 4vh;
  text-align: center;
}
.small {
  font-size: 0.78rem;
}
</style>
