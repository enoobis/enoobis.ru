<script setup lang="ts">
import { ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
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
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}
</script>

<template>
  <section class="auth">
    <h1>вход</h1>
    <form @submit.prevent="submit">
      <input v-model="email" type="email" placeholder="email" required autocomplete="username" />
      <input
        v-model="password"
        type="password"
        placeholder="пароль"
        required
        autocomplete="current-password"
      />
      <button type="submit">войти</button>
    </form>
    <p v-if="err" class="error">{{ err }}</p>
    <p class="muted alt">
      нет аккаунта? <RouterLink to="/register">создать</RouterLink>
    </p>
  </section>
</template>

<style scoped>
.auth {
  max-width: 320px;
  margin: 12vh auto 0;
}
.auth h1 {
  font-size: 1.4rem;
  margin-bottom: 1.2rem;
  text-transform: lowercase;
}
form {
  display: grid;
  gap: 0.6rem;
}
button {
  margin-top: 0.4rem;
}
.alt {
  margin-top: 1.2rem;
}
</style>
