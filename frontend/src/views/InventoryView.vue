<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { api } from "../api/http";
import { listMyAvatars, equipAvatar, type OwnedAvatar } from "../api/shop";
import { useAuthStore } from "../stores/auth";
import { toastError, toastSuccess } from "../utils/toast";

const auth = useAuthStore();
const items = ref<OwnedAvatar[]>([]);
const loading = ref(true);
const busy = ref<string | null>(null);
const profileCoins = ref(0);

async function load() {
  loading.value = true;
  try {
    items.value = await listMyAvatars(auth.token!);
    const me = await api<{ coins?: number }>("/api/me", { token: auth.token! });
    profileCoins.value = Math.max(0, Math.floor(Number(me.coins ?? 0)));
  } catch (e) {
    toastError(e);
  } finally {
    loading.value = false;
  }
}

async function onEquip(a: OwnedAvatar) {
  if (!auth.token || busy.value) return;
  busy.value = a.id;
  try {
    await equipAvatar(auth.token, a.id);
    toastSuccess("аватарка установлена");
    window.dispatchEvent(new CustomEvent("enoobis:avatar-updated"));
  } catch (e) {
    toastError(e);
  } finally {
    busy.value = null;
  }
}

onMounted(load);
</script>

<template>
  <section class="inv">
    <header class="inv-head">
      <h1>инвентарь</h1>
      <div class="coins-badge" title="ваши монеты">
        <img src="/coin-gem.png" alt="" width="18" height="18" loading="lazy" />
        <span>{{ profileCoins }}</span>
      </div>
    </header>
    <div v-if="loading" class="muted">загрузка…</div>
    <div v-else-if="!items.length" class="empty muted">
      <p>пусто</p>
      <RouterLink to="/shop" class="to-shop">магазин →</RouterLink>
    </div>
    <ul v-else class="grid">
      <li v-for="a in items" :key="a.id" class="card avatar-card">
        <div class="avatar-wrap">
          <img :src="a.url" :alt="a.name" class="avatar-img" loading="lazy" />
          <span v-if="a.is_animated" class="anim-badge">gif</span>
        </div>
        <p class="avatar-name">{{ a.name }}</p>
        <div class="avatar-footer">
          <button type="button" class="btn-equip" :disabled="busy === a.id" @click="onEquip(a)">
            надеть
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.inv {
  max-width: 720px;
  margin: 0 auto;
}
.inv-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.4rem;
}
.inv-head h1 {
  font-size: 1.2rem;
  font-weight: 600;
  margin: 0;
}
.coins-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.9rem;
  background: var(--surface);
}
.grid {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
}
.avatar-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.avatar-wrap {
  position: relative;
  align-self: center;
}
.avatar-img {
  width: 80px;
  height: 80px;
  border-radius: 999px;
  object-fit: cover;
  border: 1px solid var(--border);
  display: block;
}
.anim-badge {
  position: absolute;
  bottom: 2px;
  right: 2px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.62rem;
  padding: 1px 4px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.avatar-name {
  margin: 0;
  font-size: 0.85rem;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.avatar-footer {
  display: flex;
  justify-content: center;
  margin-top: auto;
}
.btn-equip {
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  font-size: 0.8rem;
  border: 1px solid var(--text);
  background: var(--surface2);
  color: var(--text);
  cursor: pointer;
  min-height: 0;
}
.btn-equip:hover:not(:disabled) {
  background: var(--surface);
}
.btn-equip:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.empty {
  text-align: center;
  margin-top: 4vh;
}
.empty p {
  margin: 0 0 0.75rem;
}
.to-shop {
  color: var(--text);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
