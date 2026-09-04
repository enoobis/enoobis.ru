<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { deleteNews, getNews, type NewsItem } from "../api/news";
import AppIcon from "../components/AppIcon.vue";
import AppLoading from "../components/AppLoading.vue";
import BackLink from "../components/BackLink.vue";
import { usePageRefresh } from "../composables/usePageRefresh";
import { useAuthStore } from "../stores/auth";
import { toastError, toastSuccess } from "../utils/toast";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const item = ref<NewsItem | null>(null);
const err = ref("");
const working = ref(false);

const id = computed(() => String(route.params.id || ""));
const paragraphs = computed(() =>
  (item.value?.body ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean),
);

async function load() {
  err.value = "";
  if (item.value?.id !== id.value) item.value = null;
  try {
    item.value = await getNews(id.value);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

async function remove() {
  if (!auth.token || !item.value) return;
  working.value = true;
  try {
    await deleteNews(item.value.id, auth.token);
    toastSuccess("удалено");
    await router.push("/news");
  } catch (e) {
    toastError(e instanceof Error ? e.message : "ошибка");
  } finally {
    working.value = false;
  }
}

usePageRefresh(load);
onMounted(() => {
  void load();
});
watch(id, () => {
  void load();
});
</script>

<template>
  <section class="page-shell news-post">
    <div class="news-top">
      <BackLink to="/news">новости</BackLink>
      <button
        v-if="auth.isPanelStaff && item"
        class="icon-btn"
        type="button"
        title="удалить"
        :disabled="working"
        @click="remove"
      >
        <AppIcon name="delete" :size="18" />
      </button>
    </div>
    <p v-if="err" class="error">{{ err }}</p>
    <AppLoading v-else-if="!item" />
    <template v-else>
      <img v-if="item.image_url" :src="item.image_url" alt="" class="cover" />
      <h1>{{ item.title }}</h1>
      <p class="meta muted">
        {{ item.created_at.slice(0, 10) }}
        <template v-if="item.source_name"> · {{ item.source_name }}</template>
      </p>
      <div class="body">
        <p v-for="(p, i) in paragraphs" :key="i">{{ p }}</p>
      </div>
      <a :href="item.source_url" class="src muted" target="_blank" rel="noopener noreferrer">
        источник
      </a>
    </template>
  </section>
</template>

<style scoped>
.news-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.cover {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: var(--radius);
  margin-bottom: 1.25rem;
  background: var(--surface);
}
h1 {
  margin: 0 0 0.4rem;
  font-size: 1.35rem;
  font-weight: 600;
  line-height: 1.3;
  text-transform: lowercase;
}
.meta {
  margin: 0 0 1.2rem;
  font-size: var(--text-xs);
}
.body {
  display: grid;
  gap: 0.85rem;
  line-height: 1.7;
  font-size: 1rem;
}
.body p {
  margin: 0;
}
.src {
  display: inline-block;
  margin-top: 1.6rem;
  font-size: var(--text-sm);
}
</style>
