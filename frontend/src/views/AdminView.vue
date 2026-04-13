<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../api/http";
import { useAuthStore } from "../stores/auth";

type Pending = {
  id: string;
  email: string;
  nickname: string;
  role: string;
  created_at: string;
};

const auth = useAuthStore();
const pending = ref<Pending[]>([]);
const err = ref("");
const inviteUserId = ref("");
const inviteCount = ref(2);

async function load() {
  err.value = "";
  try {
    pending.value = await api<Pending[]>("/api/admin/pending", { token: auth.token });
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

onMounted(load);

async function approve(id: string) {
  await api(`/api/admin/users/${id}/approve`, { method: "POST", token: auth.token });
  await load();
}

async function reject(id: string) {
  await api(`/api/admin/users/${id}/reject`, { method: "POST", token: auth.token });
  await load();
}

async function addInvites() {
  err.value = "";
  try {
    await api(`/api/admin/users/${inviteUserId.value.trim()}/invites`, {
      method: "POST",
      token: auth.token,
      body: JSON.stringify({ count: inviteCount.value }),
    });
    inviteUserId.value = "";
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}
</script>

<template>
  <section>
    <h1>Администрирование</h1>
    <p v-if="err" class="error">{{ err }}</p>

    <div class="card" style="margin-bottom: 1.5rem">
      <h2>Добавить инвайт-коды пользователю</h2>
      <p class="muted">UUID пользователя + количество новых одноразовых ссылок (до 50).</p>
      <input v-model="inviteUserId" placeholder="user uuid" />
      <input
        v-model.number="inviteCount"
        type="number"
        min="1"
        max="50"
        style="margin-top: 0.5rem; max-width: 120px"
      />
      <button type="button" style="margin-top: 0.5rem; display: block" @click="addInvites">
        Выдать
      </button>
    </div>

    <h2>Ожидают одобрения</h2>
    <p v-if="!pending.length" class="muted">Пусто</p>
    <div v-for="u in pending" :key="u.id" class="card" style="margin-bottom: 0.75rem">
      <strong>{{ u.nickname }}</strong> ({{ u.role }}) — {{ u.email }}
      <div class="muted" style="font-family: var(--mono); font-size: 0.8rem">{{ u.id }}</div>
      <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem">
        <button type="button" @click="approve(u.id)">Одобрить</button>
        <button class="secondary" type="button" @click="reject(u.id)">Отклонить</button>
      </div>
    </div>
  </section>
</template>
