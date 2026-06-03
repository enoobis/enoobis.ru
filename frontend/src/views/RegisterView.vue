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
  }
}
</script>

<template>
  <section class="auth">
    <h1>регистрация</h1>
    <form @submit.prevent="submit">
      <input v-model="nickname" placeholder="ник" required pattern="[A-Za-z0-9_]{3,32}" />
      <input v-model="email" type="email" placeholder="email" required />
      <input v-model="password" type="password" placeholder="пароль" minlength="10" required />
      <button type="submit">создать</button>
    </form>
    <p v-if="err" class="error">{{ err }}</p>
    <p v-if="ok" class="muted">{{ ok }}</p>
    <p class="muted alt">
      уже есть аккаунт? <RouterLink to="/login">войти</RouterLink>
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
