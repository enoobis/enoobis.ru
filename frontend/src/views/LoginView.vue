<script setup lang="ts">
import { ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

const email = ref("");
const password = ref("");
const err = ref("");
const loading = ref(false);
const router = useRouter();
const auth = useAuthStore();

async function submit() {
  err.value = "";
  loading.value = true;
  try {
    await auth.login(email.value, password.value);
    await router.push("/courses");
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="auth" data-reveal>
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
      <button type="submit" class="primary" :disabled="loading">
        <span v-if="!loading">войти</span>
        <span v-else class="spinner" aria-hidden="true" />
      </button>
    </form>
    <p v-if="err" class="error">{{ err }}</p>
    <div class="alt">
      <RouterLink to="/auth/qr">вход по qr</RouterLink>
      <span class="dot" aria-hidden="true">·</span>
      <RouterLink to="/register">создать аккаунт</RouterLink>
    </div>
  </section>
</template>

<style scoped>
.auth {
  max-width: 360px;
  margin: 16vh auto 0;
  padding: 0 var(--layout-pad);
}
.auth h1 {
  font-size: 1.75rem;
  font-weight: 600;
  letter-spacing: -0.028em;
  margin-bottom: 1.75rem;
  text-transform: lowercase;
  line-height: 1.15;
}
form {
  display: grid;
  gap: 0.75rem;
}
form button {
  margin-top: 0.6rem;
  width: 100%;
}
.alt {
  margin-top: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.7rem;
  font-size: var(--text-sm);
  color: var(--muted);
}
.alt a {
  color: var(--text);
}
.dot {
  color: var(--muted);
  opacity: 0.5;
}
.error {
  margin-top: 0.8rem;
  text-align: center;
}
@media (max-width: 640px) {
  .auth {
    margin-top: 10vh;
  }
  .auth h1 {
    font-size: 1.7rem;
  }
}
</style>
