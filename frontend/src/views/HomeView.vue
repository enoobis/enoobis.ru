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
    <p class="muted">
      Образовательная платформа: курсы (открытые и закрытые), блог преподавателей для гостей,
      профили с достижениями и инвайт-ссылками.
    </p>
    <div v-if="!auth.token" class="card" style="margin-top: 1.5rem">
      <p>
        Гости видят только <RouterLink to="/blog">блог</RouterLink>. Войдите или зарегистрируйтесь,
        чтобы попасть на курсы (после одобрения администратора или по инвайт-коду).
      </p>
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
