<script setup lang="ts">
import { ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { useQrScanDevice } from "../composables/useQrScanDevice";
import { useAuthStore } from "../stores/auth";

const email = ref("");
const password = ref("");
const err = ref("");
const loading = ref(false);
const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const { canScanQr } = useQrScanDevice();

async function submit() {
  err.value = "";
  loading.value = true;
  try {
    await auth.login(email.value, password.value);
    const next = (route.query.next as string) || "/courses";
    await router.push(next);
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
      <template v-if="canScanQr">
        <RouterLink to="/auth/qr">вход по qr</RouterLink>
        <span class="dot" aria-hidden="true">·</span>
      </template>
      <RouterLink to="/register">создать аккаунт</RouterLink>
    </div>
  </section>
</template>

<style scoped>
.auth {
  max-width: 360px;
  margin: 14vh auto 0;
  padding: 0 1rem;
}
.auth h1 {
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  margin-bottom: 1.5rem;
  text-transform: lowercase;
}
form {
  display: grid;
  gap: 0.6rem;
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
  font-size: 0.9rem;
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
