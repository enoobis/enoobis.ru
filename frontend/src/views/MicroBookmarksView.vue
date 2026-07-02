<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppIcon from "../components/AppIcon.vue";
import AppLoading from "../components/AppLoading.vue";
import MicroItem from "../components/MicroItem.vue";
import PageHeader from "../components/PageHeader.vue";
import { listMyMicroBookmarks, type MicroPost } from "../api/micro";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const router = useRouter();
const posts = ref<MicroPost[]>([]);
const loading = ref(false);
const err = ref("");

async function load() {
  if (!auth.token) return;
  const showLoading = !posts.value.length;
  if (showLoading) loading.value = true;
  err.value = "";
  try {
    const data = await listMyMicroBookmarks(auth.token, { page: 1, page_size: 50 });
    posts.value = data.items;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    loading.value = false;
  }
}

function onUnsaved(id: string) {
  posts.value = posts.value.filter((p) => p.id !== id);
}

function onUpdated(updated: MicroPost) {
  posts.value = posts.value.map((p) => (p.id === updated.id ? updated : p));
}

function onDeleted(id: string) {
  posts.value = posts.value.filter((p) => p.id !== id);
}

onMounted(load);
</script>

<template>
  <section class="saved page-shell">
    <PageHeader title="закладки">
      <template #back>
        <button type="button" class="filter-icon-btn" aria-label="назад" @click="router.push('/saved')">
          <AppIcon name="back" :size="18" />
        </button>
      </template>
    </PageHeader>
    <p v-if="err" class="error">{{ err }}</p>
    <AppLoading v-else-if="loading && !posts.length" class="page-empty" />
    <p v-else-if="!loading && !posts.length" class="page-empty muted">пусто</p>
    <MicroItem
      v-for="p in posts"
      :key="p.id"
      :post="p"
      clickable
      @deleted="onDeleted"
      @updated="onUpdated"
      @unsaved="onUnsaved"
    />
  </section>
</template>

<style scoped>
.saved {
  max-width: 640px;
  margin: 0 auto;
  display: grid;
  gap: 0;
}
.saved :deep(.page-head) {
  margin-bottom: 0.6rem;
}
</style>
