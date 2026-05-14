<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  listShopItems,
  buyShopItem,
  equipShopItem,
  type ShopItem,
  type ShopItemKind,
  type ShopListKind,
} from "../api/shop";
import { useAuthStore } from "../stores/auth";
import { toastError, toastSuccess } from "../utils/toast";

const auth = useAuthStore();

const UI_KINDS: ShopItemKind[] = ["font", "ink", "accent", "radius"];

const FONT_PREVIEW: Record<string, string> = {
  outfit: '"Outfit", system-ui, sans-serif',
  system: "system-ui, sans-serif",
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "JetBrains Mono", monospace',
  readable: 'Georgia, "Palatino Linotype", Palatino, serif',
  dm: '"DM Sans", system-ui, sans-serif',
};

function fontPreviewFamily(slug: string | null): string {
  const k = String(slug || "outfit");
  return FONT_PREVIEW[k] ?? FONT_PREVIEW.outfit;
}

function radiusPreviewPx(slug: string | null): string {
  if (slug === "soft") return "14px";
  if (slug === "sharp") return "6px";
  return "10px";
}

const tabs: { key: ShopListKind; label: string }[] = [
  { key: "avatar", label: "аватар" },
  { key: "frame", label: "рамка" },
  { key: "wallpaper", label: "фон" },
  { key: "cover", label: "обложка" },
  { key: "ui", label: "оформление" },
];

const tab = ref<ShopListKind>("avatar");
const items = ref<ShopItem[]>([]);
const loading = ref(true);
const busy = ref<string | null>(null);
const profileCoins = ref(0);

const shown = computed(() => {
  if (tab.value === "ui") return items.value.filter((i) => UI_KINDS.includes(i.kind));
  return items.value.filter((i) => i.kind === tab.value);
});

function shopSold(item: ShopItem): number {
  return Math.max(0, Math.floor(Number(item.sold_count ?? 0)));
}

function shopStockCap(item: ShopItem): number | null {
  const v = item.stock_limit;
  if (v == null) return null;
  const n = Math.max(0, Math.floor(Number(v)));
  return n > 0 ? n : null;
}

function shopStockLeft(item: ShopItem): number | null {
  const cap = shopStockCap(item);
  if (cap == null) return null;
  return Math.max(0, cap - shopSold(item));
}

function shopSoldOut(item: ShopItem): boolean {
  if (item.owned) return false;
  const left = shopStockLeft(item);
  return left !== null && left <= 0;
}

async function loadCoins() {
  if (!auth.token) return;
  const me = await fetch("/api/me", { headers: { Authorization: `Bearer ${auth.token}` } });
  const data = await me.json();
  profileCoins.value = Math.max(0, Math.floor(Number(data.coins ?? 0)));
}

async function load() {
  if (!auth.token) return;
  loading.value = true;
  try {
    await loadCoins();
    items.value = await listShopItems(auth.token, tab.value);
  } catch (e) {
    toastError(e);
  } finally {
    loading.value = false;
  }
}

async function onBuy(item: ShopItem) {
  if (!auth.token || busy.value) return;
  busy.value = item.id;
  try {
    const r = await buyShopItem(auth.token, item.id);
    profileCoins.value = r.coins;
    item.owned = true;
    item.sold_count = shopSold(item) + 1;
    toastSuccess(item.name);
  } catch (e) {
    toastError(e);
  } finally {
    busy.value = null;
  }
}

async function onEquip(item: ShopItem) {
  if (!auth.token || busy.value) return;
  busy.value = item.id;
  try {
    await equipShopItem(auth.token, item.id);
    toastSuccess("применено");
    window.dispatchEvent(new CustomEvent("enoobis:profile-cosmetics-updated"));
  } catch (e) {
    toastError(e);
  } finally {
    busy.value = null;
  }
}

onMounted(load);
watch(tab, load);
</script>

<template>
  <section class="shop">
    <header class="shop-head">
      <h1>магазин</h1>
      <div class="coins-badge" title="монеты">
        <img src="/coin-gem.png" alt="" width="18" height="18" loading="lazy" />
        <span>{{ profileCoins }}</span>
      </div>
    </header>

    <nav class="shop-tabs" aria-label="разделы">
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        class="tab-btn"
        :class="{ on: tab === t.key }"
        @click="tab = t.key"
      >
        {{ t.label }}
      </button>
    </nav>

    <div v-if="loading" class="muted">загрузка…</div>
    <div v-else-if="!shown.length" class="empty muted">пусто</div>
    <ul v-else class="grid">
      <li v-for="item in shown" :key="item.id" class="card item-card">
        <div class="preview">
          <template v-if="item.kind === 'avatar'">
            <div class="avatar-wrap">
              <img :src="item.url" :alt="item.name" class="avatar-img" loading="lazy" />
              <span v-if="item.is_animated" class="anim-badge">gif</span>
            </div>
          </template>
          <template v-else-if="item.kind === 'frame'">
            <div class="frame-demo">
              <span class="frame-inner" />
              <img :src="item.url" alt="" class="frame-layer" loading="lazy" />
            </div>
          </template>
          <template v-else-if="item.kind === 'font'">
            <div class="preset-font" :style="{ fontFamily: fontPreviewFamily(item.preset_value) }">аг</div>
          </template>
          <template v-else-if="item.kind === 'ink' || item.kind === 'accent'">
            <div
              class="preset-swatch"
              :style="{ background: item.preset_value && item.preset_value.startsWith('#') ? item.preset_value : 'var(--surface2)' }"
            />
          </template>
          <template v-else-if="item.kind === 'radius'">
            <div class="preset-radius">
              <span class="preset-radius-box" :style="{ borderRadius: radiusPreviewPx(item.preset_value) }" />
            </div>
          </template>
          <template v-else-if="item.kind === 'wallpaper' || item.kind === 'cover'">
            <div
              class="wide-thumb"
              :class="item.kind === 'wallpaper' ? 'wallpaper-strip-thumb' : ''"
              :style="{ backgroundImage: `url(${item.url})` }"
            />
          </template>
        </div>
        <p class="item-name">{{ item.name }}</p>
        <p v-if="!item.owned && shopStockCap(item) !== null" class="stock-line muted">
          {{ shopSoldOut(item) ? "распродано" : `ещё ${shopStockLeft(item)}` }}
        </p>
        <div class="item-footer">
          <span class="price">
            <img src="/coin-gem.png" alt="" width="14" height="14" loading="lazy" />
            {{ item.price }}
          </span>
          <button
            v-if="!item.owned"
            type="button"
            class="btn-buy"
            :disabled="busy === item.id || profileCoins < item.price || shopSoldOut(item)"
            @click="onBuy(item)"
          >
            купить
          </button>
          <button
            v-else
            type="button"
            class="btn-equip"
            :disabled="busy === item.id"
            @click="onEquip(item)"
          >
            применить
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
  margin-bottom: 0.5rem;
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
.shop-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.65rem;
}
.tab-btn {
  padding: 0.28rem 0.65rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--muted);
  font-size: 0.82rem;
  cursor: pointer;
  min-height: 0;
}
.tab-btn.on {
  color: var(--text);
  border-color: var(--text);
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
.item-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.preview {
  min-height: 88px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar-wrap {
  position: relative;
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
.frame-demo {
  position: relative;
  width: 72px;
  height: 72px;
}
.frame-inner {
  position: absolute;
  inset: 10px;
  border-radius: 999px;
  background: var(--surface2);
  border: 1px solid var(--border);
}
.frame-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}
.preset-font {
  font-size: 2rem;
  line-height: 1;
  font-weight: 600;
  color: var(--text);
}
.preset-swatch {
  width: 100%;
  height: 72px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
}
.preset-radius {
  width: 100%;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface2);
  border-radius: var(--radius);
  border: 1px solid var(--border);
}
.preset-radius-box {
  display: block;
  width: 52px;
  height: 34px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.wide-thumb {
  width: 100%;
  height: 72px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background-size: cover;
  background-position: center;
}
.wallpaper-strip-thumb {
  height: 56px;
}
.item-name {
  margin: 0;
  font-size: 0.85rem;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stock-line {
  margin: 0;
  font-size: 0.72rem;
  text-align: center;
}
.item-footer {
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
