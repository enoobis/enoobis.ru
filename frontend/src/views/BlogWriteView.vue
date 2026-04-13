<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api/http";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const title = ref("");
const body = ref("");
const err = ref("");
const router = useRouter();

async function submit() {
  err.value = "";
  try {
    const r = await api<{ id: string }>("/api/blog", {
      method: "POST",
      token: auth.token,
      body: JSON.stringify({ title: title.value, body: body.value }),
    });
    await router.push(`/blog/${r.id}`);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}
</script>

<template>
  <div class="card" style="max-width: 720px">
    <h1>Новая запись</h1>
    <p v-if="err" class="error">{{ err }}</p>
    <form @submit.prevent="submit">
      <label>Заголовок</label>
      <input v-model="title" required />
      <label style="display: block; margin-top: 0.75rem">Текст</label>
      <textarea v-model="body" rows="12" required />
      <button type="submit" style="margin-top: 1rem">Опубликовать</button>
    </form>
  </div>
</template>
