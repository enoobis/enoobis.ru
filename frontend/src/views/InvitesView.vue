<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../api/http";
import { useAuthStore } from "../stores/auth";

type Link = {
  id: string;
  code: string;
  target_role: string;
  max_uses: number;
  used_count: number;
  remaining: number;
  created_at: string;
};

const auth = useAuthStore();
const links = ref<Link[]>([]);
const err = ref("");

onMounted(async () => {
  try {
    links.value = await api<Link[]>("/api/me/invites", { token: auth.token });
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
});

function fullUrl(code: string) {
  const base = `${window.location.origin}/register`;
  return `${base}?invite=${encodeURIComponent(code)}`;
}
</script>

<template>
  <section>
    <h1>Мои инвайт-ссылки</h1>
    <p v-if="err" class="error">{{ err }}</p>
    <div v-for="l in links" :key="l.id" class="card" style="margin-bottom: 0.75rem">
      <div style="font-family: var(--mono); font-size: 0.9rem">{{ l.code }}</div>
      <div class="muted">роль: {{ l.target_role === "teacher" ? "ментор" : "ученик" }}</div>
      <div class="muted">осталось: {{ l.remaining }} / {{ l.max_uses }}</div>
      <div style="margin-top: 0.35rem; word-break: break-all" class="muted">{{ fullUrl(l.code) }}</div>
    </div>
  </section>
</template>
