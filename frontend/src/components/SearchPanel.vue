<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import AppIcon from "./AppIcon.vue";
import { search, type SearchResponse } from "../api/search";

const props = defineProps<{
  autofocus?: boolean;
  embedded?: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const route = useRoute();
const router = useRouter();
const inputEl = ref<HTMLInputElement | null>(null);
const q = ref(typeof route.query.q === "string" ? route.query.q : "");
const data = ref<SearchResponse>({ blog: [], micro: [], users: [] });
const loading = ref(false);
const err = ref("");
let timer: ReturnType<typeof setTimeout> | null = null;

function onEsc(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  if (q.value) {
    q.value = "";
    onInput();
    return;
  }
  if (props.embedded) {
    emit("close");
    return;
  }
  router.back();
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
  if (!props.embedded) {
    router.replace({ query: q.value.trim() ? { q: q.value.trim() } : {} });
  }
  if (timer) clearTimeout(timer);
  timer = setTimeout(run, 250);
}

watch(
  () => route.query.q,
  (v) => {
    if (props.embedded) return;
    if (typeof v === "string" && v !== q.value) {
      q.value = v;
      void run();
    }
  },
);

onMounted(async () => {
  window.addEventListener("keydown", onEsc);
  if (props.autofocus) {
    await nextTick();
    inputEl.value?.focus();
  }
  void run();
});

onUnmounted(() => {
  window.removeEventListener("keydown", onEsc);
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <div class="search-panel" :class="{ 'search-panel--embedded': embedded }">
    <div class="filter-search">
      <AppIcon name="search" :size="16" />
      <input
        ref="inputEl"
        v-model="q"
        type="search"
        placeholder="поиск"
        @input="onInput"
        @keydown.enter.prevent="run"
      />
    </div>

    <p v-if="err" class="error">{{ err }}</p>
    <p v-else-if="loading" class="muted search-status">загрузка</p>
    <p
      v-else-if="q && !data.blog.length && !data.micro.length && !data.users.length"
      class="muted search-status"
    >
      ничего не найдено
    </p>

    <template v-else-if="q">
      <ul v-if="data.blog.length" class="results">
        <li v-for="p in data.blog" :key="`b-${p.id}`">
          <RouterLink :to="`/blogs/${p.id}`" class="result-row" @click="emit('close')">
            <span class="result-title">{{ p.title }}</span>
            <span class="muted small">
              {{ p.author_nickname }} · {{ (p.published_at || p.created_at).slice(0, 10) }}
            </span>
          </RouterLink>
        </li>
      </ul>

      <ul v-if="data.micro.length" class="results">
        <li v-for="m in data.micro" :key="`m-${m.id}`">
          <RouterLink :to="`/microblogs/${m.id}`" class="result-row" @click="emit('close')">
            <span class="result-title">{{ m.body }}</span>
            <span class="muted small">
              {{ m.author_nickname }} · {{ m.created_at.slice(0, 10) }}
            </span>
          </RouterLink>
        </li>
      </ul>

      <ul v-if="data.users.length" class="results">
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

.search-status {
  margin: 0;
  padding: 0.15rem 0.1rem;
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
  padding: 0.45rem 0.1rem;
  color: var(--text);
  border-radius: 6px;
}

.result-row--user {
  grid-template-columns: 32px 1fr;
  align-items: center;
  gap: 0.55rem;
}

.result-row:hover {
  background: var(--surface2);
  text-decoration: none;
}

.result-title {
  font-weight: 500;
  font-size: 0.95rem;
  line-height: 1.35;
  white-space: pre-wrap;
}

.result-copy {
  display: grid;
  gap: 0.08rem;
  min-width: 0;
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

.small {
  font-size: 0.78rem;
}
</style>
