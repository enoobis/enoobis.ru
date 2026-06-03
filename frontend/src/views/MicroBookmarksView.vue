<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import MicroItem from "../components/MicroItem.vue";
import { listMyMicroBookmarks, type MicroPost } from "../api/micro";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
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
  <section class="saved">
    <header class="head">
      <RouterLink to="/saved" class="back muted">← закладки</RouterLink>
      <h1>закладки</h1>
    </header>
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
      @unsaved="onUnsaved"
    />
  </section>
</template>

<style scoped>
.saved {
  max-width: 640px;
  margin: 0 auto;
}
.head {
  margin-bottom: 0.6rem;
}
.back {
  display: inline-block;
  font-size: 0.85rem;
  margin-bottom: 0.4rem;
}
.back:hover {
  color: var(--text);
}
h1 {
  font-size: 1.1rem;
  font-weight: 500;
  margin: 0;
}
.empty {
  text-align: center;
  margin-top: 4vh;
}
</style>
