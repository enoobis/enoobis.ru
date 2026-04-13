<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

const email = ref("");
const password = ref("");
const err = ref("");
const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

async function submit() {
  err.value = "";
  try {
    await auth.login(email.value, password.value);
    const next = (route.query.next as string) || "/courses";
    await router.push(next);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}
</script>

<template>
  <div class="card" style="max-width: 420px">
    <h1>Вход</h1>
    <p v-if="err" class="error">{{ err }}</p>
    <form @submit.prevent="submit">
      <label>Email</label>
      <input v-model="email" type="email" required autocomplete="username" />
      <label style="display: block; margin-top: 0.75rem">Пароль</label>
      <input v-model="password" type="password" required autocomplete="current-password" />
      <button type="submit" style="margin-top: 1rem; width: 100%">Войти</button>
    </form>
  </div>
</template>
