<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "../api/http";
import { useAuthStore } from "../stores/auth";
import AppIcon from "../components/AppIcon.vue";
import PageHeader from "../components/PageHeader.vue";

type Link = {
  id: string;
  code: string;
  target_role: "student" | "teacher";
  max_uses: number;
  used_count: number;
  remaining: number;
  created_at: string;
};

const auth = useAuthStore();
const links = ref<Link[]>([]);
const err = ref("");

const newRole = ref<"student" | "teacher">("student");
const newMaxUses = ref(1);
const creating = ref(false);

const isAdmin = computed(() => auth.user?.role === "admin");
const canCreate = computed(() => auth.isStaff);

async function load() {
  err.value = "";
  try {
    links.value = await api<Link[]>("/api/me/invites", { token: auth.token });
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

onMounted(load);

async function create() {
  if (!auth.token || !canCreate.value) return;
  err.value = "";
  creating.value = true;
  try {
    const max = Math.max(1, Math.min(100, Number(newMaxUses.value) || 1));
    const created = await api<Link>("/api/me/invites", {
      method: "POST",
      token: auth.token,
      body: JSON.stringify({
        target_role: newRole.value,
        max_uses: max,
      }),
    });
    links.value = [created, ...links.value];
    newMaxUses.value = 1;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    creating.value = false;
  }
}

async function remove(id: string) {
  if (!auth.token) return;
  err.value = "";
  try {
    await api(`/api/me/invites/${id}`, { method: "DELETE", token: auth.token });
    links.value = links.value.filter((l) => l.id !== id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

function fullUrl(code: string) {
  return `${window.location.origin}/register?invite=${encodeURIComponent(code)}`;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {}
}
</script>

<template>
  <section class="invites page-shell">
    <PageHeader title="инвайты" />

    <p v-if="err" class="error">{{ err }}</p>

    <form v-if="canCreate" class="creator" @submit.prevent="create">
      <div class="row">
        <select v-model="newRole">
          <option value="student">ученик</option>
          <option v-if="isAdmin" value="teacher">ментор</option>
        </select>
        <input
          v-model.number="newMaxUses"
          type="number"
          min="1"
          max="100"
          placeholder="мест"
        />
        <button type="submit" :disabled="creating">
          {{ creating ? "…" : "создать" }}
        </button>
      </div>
      <p class="muted small">мест: 1–100</p>
    </form>

    <p v-if="!links.length" class="muted">пусто</p>
    <ul v-else class="list">
      <li v-for="l in links" :key="l.id">
        <div class="head">
          <span class="role">{{ l.target_role === "teacher" ? "ментор" : "ученик" }}</span>
          <span class="muted small">
            <template v-if="l.remaining === 0">использован</template>
            <template v-else>осталось {{ l.remaining }} / {{ l.max_uses }}</template>
          </span>
        </div>
        <div class="row link-row">
          <input :value="fullUrl(l.code)" readonly @focus="(e) => (e.target as HTMLInputElement).select()" />
          <button
            type="button"
            class="icon-btn"
            aria-label="копировать"
            title="копировать"
            @click="copy(fullUrl(l.code))"
          >
            <AppIcon name="copy" :size="16" />
          </button>
          <button
            type="button"
            class="icon-btn danger"
            aria-label="удалить"
            title="удалить"
            @click="remove(l.id)"
          >
            <AppIcon name="delete" :size="16" />
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.invites {
  max-width: 640px;
  margin: 0 auto;
}
.invites :deep(.page-head) {
  margin-bottom: 1rem;
}
.creator {
  display: grid;
  gap: 0.3rem;
  padding: 0.7rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  margin-bottom: 1rem;
}
.row {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}
.row select,
.row input[type="number"] {
  flex-shrink: 0;
}
.row select {
  width: 110px;
}
.row input[type="number"] {
  width: 90px;
}
.row button[type="submit"] {
  margin-left: auto;
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.6rem;
}
.list li {
  display: grid;
  gap: 0.35rem;
  padding: 0.6rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.head {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.role {
  font-weight: 500;
}
.link-row input {
  flex: 1;
  min-width: 0;
  font-family: var(--mono);
  font-size: 0.78rem;
  background: transparent;
}
.link-row .icon-btn {
  flex-shrink: 0;
}
.small {
  font-size: 0.8rem;
}
</style>
