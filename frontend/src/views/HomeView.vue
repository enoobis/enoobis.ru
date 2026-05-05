<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { listPosts, type BlogListItem } from "../api/blog";
import { useAuthStore } from "../stores/auth";
import { listRecentPosts, type RecentPostItem } from "../utils/recentPosts";

const posts = ref<BlogListItem[]>([]);
const recentPosts = ref<RecentPostItem[]>([]);
const auth = useAuthStore();

onMounted(async () => {
  recentPosts.value = listRecentPosts();
  try {
    const res = await listPosts({ page: 1, page_size: 5 });
    posts.value = res.items;
  } catch {
    posts.value = [];
  }
});
</script>

<template>
  <section>
    <h1>enoobis.ru</h1>
    <p class="muted">Курсы и блог.</p>
    <div v-if="!auth.token" class="card" style="margin-top: 1.5rem">
      <p>
        <RouterLink to="/blog">Блог</RouterLink> доступен без входа.
      </p>
      <p style="margin: 0"><RouterLink to="/login">Войти</RouterLink> / <RouterLink to="/register">Регистрация</RouterLink></p>
    </div>
    <div v-else class="card" style="margin-top: 1.5rem">
      <p>
        Вы в системе как <strong>{{ auth.user?.nickname }}</strong> ({{ auth.user?.role }}).
        Перейдите к <RouterLink to="/courses">курсам</RouterLink>.
      </p>
    </div>
    <template v-if="recentPosts.length">
      <h2 style="margin-top: 2rem">Продолжить чтение</h2>
      <ul style="list-style: none; padding: 0">
        <li v-for="item in recentPosts.slice(0, 4)" :key="item.id" class="card" style="margin-bottom: 0.75rem">
          <RouterLink :to="`/blog/${item.id}`">{{ item.title }}</RouterLink>
          <div class="muted">{{ item.author_nickname }} · прогресс {{ item.progress }}%</div>
        </li>
      </ul>
    </template>
    <h2 style="margin-top: 2rem">Свежие записи блога</h2>
    <ul v-if="posts.length" style="list-style: none; padding: 0">
      <li v-for="p in posts" :key="p.id" class="card" style="margin-bottom: 0.75rem">
        <RouterLink :to="`/blog/${p.id}`">{{ p.title }}</RouterLink>
        <div class="muted">{{ p.author_nickname }} · {{ (p.published_at || p.created_at).slice(0, 10) }}</div>
      </li>
    </ul>
    <p v-else class="muted">Записей пока нет.</p>
    <RouterLink to="/blog">Все записи →</RouterLink>
  </section>
</template>
