<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api/http";

type Post = {
  id: string;
  title: string;
  body: string;
  author_nickname: string;
  created_at: string;
};

const route = useRoute();
const post = ref<Post | null>(null);
const err = ref("");

async function load() {
  err.value = "";
  post.value = null;
  try {
    post.value = await api<Post>(`/api/blog/${route.params.id}`);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

onMounted(load);
watch(() => route.params.id, load);
</script>

<template>
  <article v-if="post" class="card">
    <h1>{{ post.title }}</h1>
    <p class="muted">{{ post.author_nickname }} · {{ post.created_at.slice(0, 16).replace("T", " ") }}</p>
    <pre style="white-space: pre-wrap; font-family: var(--font); margin-top: 1rem">{{ post.body }}</pre>
  </article>
  <p v-else-if="err" class="error">{{ err }}</p>
  <p v-else class="muted">Загрузка…</p>
</template>
