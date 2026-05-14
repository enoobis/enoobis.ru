<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useAuthStore } from "../stores/auth";
import { listShopAvatars, buyAvatar, equipAvatar, type ShopAvatar } from "../api/shop";
import { toastError, toastSuccess } from "../utils/toast";

const auth = useAuthStore();
const avatars = ref<ShopAvatar[]>([]);
const loading = ref(true);
const busy = ref<string | null>(null);
const profileCoins = ref(0);

async function load() {
  loading.value = true;
  try {
    avatars.value = await listShopAvatars(auth.token!);
    const me = await fetch("/api/me", { headers: { Authorization: `Bearer ${auth.token}` } });
    const data = await me.json();
    profileCoins.value = Math.max(0, Math.floor(Number(data.coins ?? 0)));
  } catch (e) {
    toastError(e);
  } finally {
    loading.value = false;
  }
}

async function onBuy(avatar: ShopAvatar) {
  if (!auth.token || busy.value) return;
  busy.value = avatar.id;
  try {
    const r = await buyAvatar(auth.token, avatar.id);
    profileCoins.value = r.coins;
    avatar.owned = true;
    toastSuccess(`куплено: ${avatar.name}`);
  } catch (e) {
    toastError(e);
  } finally {
    busy.value = null;
  }
}

async function onEquip(avatar: ShopAvatar) {
  if (!auth.token || busy.value) return;
  busy.value = avatar.id;
  try {
    await equipAvatar(auth.token, avatar.id);
    toastSuccess("аватарка установлена");
  } catch (e) {
    toastError(e);
  } finally {
    busy.value = null;
  }
}

onMounted(load);
</script>

<template>
  <section class="shop">
    <header class="shop-head">
      <h1>магазин аватарок</h1>
      <div class="coins-badge" title="ваши монеты">
        <img src="/coin-gem.png" alt="" width="18" height="18" loading="lazy" />
        <span>{{ profileCoins }}</span>
      </div>
    </header>

    <p class="muted small shop-hint">
      Покупайте аватарки за монеты. Монеты начисляются за активность — посты, задания, курсы.
    </p>

    <div v-if="loading" class="muted">загрузка…</div>

    <div v-else-if="!avatars.length" class="empty muted">в магазине пока ничего нет</div>

    <ul v-else class="grid">
      <li v-for="a in avatars" :key="a.id" class="card avatar-card">
        <div class="avatar-wrap">
          <img :src="a.url" :alt="a.name" class="avatar-img" loading="lazy" />
          <span v-if="a.is_animated" class="anim-badge">gif</span>
        </div>
        <p class="avatar-name">{{ a.name }}</p>
        <div class="avatar-footer">
          <span class="price">
            <img src="/coin-gem.png" alt="" width="14" height="14" loading="lazy" />
            {{ a.price }}
          </span>
          <button
            v-if="!a.owned"
            type="button"
            class="btn-buy"
            :disabled="busy === a.id || profileCoins < a.price"
            @click="onBuy(a)"
          >
            купить
          </button>
          <button
            v-else
            type="button"
            class="btn-equip"
            :disabled="busy === a.id"
            @click="onEquip(a)"
          >
            надеть
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.shop {
  max-width: 720px;
  margin: 0 auto;
}
.shop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.4rem;
}
.shop-head h1 {
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
.shop-hint {
  margin-bottom: 1.5rem;
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
  align-items: center;
  justify-content: space-between;
  gap: 0.3rem;
  margin-top: auto;
}
.price {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: var(--muted);
}
.btn-buy,
.btn-equip {
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  font-size: 0.8rem;
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--text);
  cursor: pointer;
  min-height: 0;
}
.btn-buy:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn-equip {
  border-color: var(--text);
}
.btn-equip:hover:not(:disabled) {
  background: var(--surface);
}
.empty {
  text-align: center;
  margin-top: 4vh;
}
</style>
