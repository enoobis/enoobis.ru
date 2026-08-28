<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

const email = ref("");
const password = ref("");
const nickname = ref("");
const invite = ref("");
const err = ref("");
const ok = ref("");
const loading = ref(false);
const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

onMounted(() => {
  const q = route.query.invite;
  if (typeof q === "string" && q) invite.value = q;
});

async function submit() {
  err.value = "";
  ok.value = "";
  loading.value = true;
  try {
    const r = await auth.register({
      email: email.value,
      password: password.value,
      nickname: nickname.value,
      invite_code: invite.value.trim() || undefined,
    });
    if (r.pending) {
      ok.value = r.message ?? "заявка отправлена";
      return;
    }
    if (r.token && r.user) {
      auth.applySession(r.token, r.user);
      await router.push("/courses");
    }
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="auth" data-reveal>
    <h1>регистрация</h1>
    <form @submit.prevent="submit">
      <input v-model="nickname" placeholder="ник" required pattern="[A-Za-z0-9_.]{3,24}" maxlength="24" autocomplete="username" />
      <input v-model="email" type="email" placeholder="email" required />
      <input v-model="password" type="password" placeholder="пароль" minlength="10" required />
      <button type="submit" class="primary" :disabled="loading">
        <span v-if="!loading">создать</span>
        <span v-else class="spinner" aria-hidden="true" />
      </button>
    </form>
    <p v-if="err" class="error">{{ err }}</p>
    <p v-if="ok" class="muted ok">{{ ok }}</p>
    <p class="alt">
      уже есть аккаунт? <RouterLink to="/login">войти</RouterLink>
    </p>
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
  text-align: center;
  font-size: 0.9rem;
  color: var(--muted);
}
.alt a {
  color: var(--text);
}
.ok,
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
