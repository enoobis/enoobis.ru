<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { listNews, type NewsItem } from "../api/news";
import AppSkeleton from "../components/AppSkeleton.vue";
import PageHeader from "../components/PageHeader.vue";
import { usePageRefresh } from "../composables/usePageRefresh";

const items = ref<NewsItem[]>([]);
const loading = ref(false);
const err = ref("");

async function load() {
  loading.value = true;
  err.value = "";
  try {
    const data = await listNews({ limit: 40 });
    items.value = data.items;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    loading.value = false;
  }
}

usePageRefresh(load);
onMounted(() => {
  void load();
});
</script>

<template>
  <section class="page-shell">
    <PageHeader title="новости" />
    <p v-if="err" class="error">{{ err }}</p>
    <AppSkeleton v-else-if="loading && !items.length" :rows="4" />
    <ul v-else-if="items.length" class="list news-list">
      <li v-for="n in items" :key="n.id">
        <RouterLink :to="`/news/${n.id}`" class="news-row">
          <img v-if="n.image_url" :src="n.image_url" alt="" class="news-thumb" />
          <span class="news-title">{{ n.title }}</span>
          <span class="meta muted">
            {{ n.created_at.slice(0, 10) }}
            <template v-if="n.source_name"> · {{ n.source_name }}</template>
          </span>
        </RouterLink>
      </li>
    </ul>
    <p v-else class="page-empty muted">пока пусто</p>
  </section>
</template>

<style scoped>
.news-row {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  border-bottom: none;
  padding: 0.2rem 0;
}
.news-thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: var(--radius);
  background: var(--surface);
}
.news-title {
  color: var(--text);
  font-weight: 600;
  font-size: 1.05rem;
  line-height: 1.35;
}
.meta {
  font-size: var(--text-xs);
}
</style>
