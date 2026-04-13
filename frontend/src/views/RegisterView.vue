<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

const email = ref("");
const password = ref("");
const nickname = ref("");
const role = ref<"student" | "teacher">("student");
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
      role: role.value,
      invite_code: invite.value.trim() || undefined,
    });
    if (r.pending) {
      ok.value = r.message ?? "Заявка отправлена.";
      return;
    }
    if (r.token && r.user) {
      auth.applySession(r.token, r.user);
      await router.push("/courses");
    }
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}
</script>

<template>
  <div class="card" style="max-width: 480px">
    <h1>Регистрация</h1>
    <p class="muted">
      Без инвайта аккаунт появится в панели администратора до одобрения. С инвайт-кодом — сразу
      активен (+ 2 ваших инвайта).
    </p>
    <p v-if="err" class="error">{{ err }}</p>
    <p v-if="ok" style="color: var(--accent)">{{ ok }}</p>
    <form @submit.prevent="submit">
      <label>Ник (3–32, буквы, цифры, _)</label>
      <input v-model="nickname" required pattern="[A-Za-z0-9_]{3,32}" />
      <label style="display: block; margin-top: 0.75rem">Email</label>
      <input v-model="email" type="email" required />
      <label style="display: block; margin-top: 0.75rem">Пароль (мин. 8)</label>
      <input v-model="password" type="password" minlength="8" required />
      <label style="display: block; margin-top: 0.75rem">Роль</label>
      <select v-model="role">
        <option value="student">Ученик</option>
        <option value="teacher">Преподаватель</option>
      </select>
      <label style="display: block; margin-top: 0.75rem">Инвайт-код (необязательно)</label>
      <input v-model="invite" placeholder="если есть" />
      <button type="submit" style="margin-top: 1rem; width: 100%">Создать аккаунт</button>
    </form>
  </div>
</template>
