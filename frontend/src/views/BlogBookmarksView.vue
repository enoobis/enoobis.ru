<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import AppIcon from "../components/AppIcon.vue";
import AppLoading from "../components/AppLoading.vue";
import PageHeader from "../components/PageHeader.vue";
import PostMetaStats from "../components/PostMetaStats.vue";
import { listMyBookmarks, type BlogListItem } from "../api/blog";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const router = useRouter();
const posts = ref<BlogListItem[]>([]);
const loading = ref(false);
const err = ref("");

async function load() {
  if (!auth.token) return;
  const showLoading = !posts.value.length;
  if (showLoading) loading.value = true;
  err.value = "";
  try {
    const data = await listMyBookmarks(auth.token, { page: 1, page_size: 50 });
    posts.value = data.items;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    loading.value = false;
  }
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
    <ul v-else class="list post-list">
      <li v-for="p in posts" :key="p.id">
        <RouterLink :to="`/blogs/${p.id}`" class="post-title">{{ p.title }}</RouterLink>
        <p v-if="p.excerpt" class="excerpt muted">{{ p.excerpt }}</p>
        <div class="meta muted">
          <span>{{ p.author_nickname }}</span>
          <span>·</span>
          <span>{{ (p.published_at || p.created_at).slice(0, 10) }}</span>
          <template v-if="p.up_count || p.down_count || p.comment_count">
            <span>·</span>
            <PostMetaStats
              :up-count="p.up_count"
              :down-count="p.down_count"
              :comment-count="p.comment_count"
            />
          </template>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.post-list li {
  display: grid;
  gap: 0.3rem;
}
.post-title {
  color: var(--text);
  font-size: 1.1rem;
  font-weight: 500;
}
.excerpt {
  margin: 0;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.82rem;
}
</style>
