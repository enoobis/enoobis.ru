<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { api } from "../api/http";

type Post = { id: string; title: string; author_nickname: string; created_at: string };

const posts = ref<Post[]>([]);
const err = ref("");

onMounted(async () => {
  try {
    posts.value = await api<Post[]>("/api/blog");
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
});
</script>

<template>
  <section>
    <p v-if="err" class="error">{{ err }}</p>
    <article v-for="p in posts" :key="p.id" class="card" style="margin-bottom: 1rem">
      <h2 style="font-size: 1.15rem">
        <RouterLink :to="`/blog/${p.id}`">{{ p.title }}</RouterLink>
      </h2>
      <div class="muted">{{ p.author_nickname }} · {{ p.created_at.slice(0, 16).replace("T", " ") }}</div>
    </article>
  </section>
</template>
