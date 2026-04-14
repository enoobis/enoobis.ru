<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { api } from "../api/http";
import { useAuthStore } from "../stores/auth";

type Post = { id: string; title: string; author_nickname: string; created_at: string };

const posts = ref<Post[]>([]);
const auth = useAuthStore();

onMounted(async () => {
  try {
    posts.value = await api<Post[]>("/api/blog");
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
    <h2 style="margin-top: 2rem">Свежие записи блога</h2>
    <ul style="list-style: none; padding: 0">
      <li v-for="p in posts.slice(0, 5)" :key="p.id" class="card" style="margin-bottom: 0.75rem">
        <RouterLink :to="`/blog/${p.id}`">{{ p.title }}</RouterLink>
        <div class="muted">{{ p.author_nickname }} · {{ p.created_at.slice(0, 10) }}</div>
      </li>
    </ul>
    <RouterLink to="/blog">Все записи →</RouterLink>
  </section>
</template>
