<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  listShopCategories,
  listShopItems,
  buyShopItem,
  type ShopCategory,
  type ShopItem,
  type ShopItemKind,
} from "../api/shop";
import { useAuthStore } from "../stores/auth";
import { toastError, toastSuccess } from "../utils/toast";

const auth = useAuthStore();

const tabs: { key: ShopItemKind; label: string }[] = [
  { key: "avatar", label: "аватар" },
  { key: "frame", label: "рамка" },
  { key: "wallpaper", label: "фон" },
  { key: "cover", label: "обложка" },
];

const tab = ref<ShopItemKind>("avatar");
const categoryFilter = ref("");
const shopCategories = ref<ShopCategory[]>([]);
const items = ref<ShopItem[]>([]);
const loading = ref(true);
const busy = ref<string | null>(null);
const profileCoins = ref(0);

let shopLoadSeq = 0;

const shown = computed(() =>
  items.value.filter((i) => {
    if (i.kind !== tab.value || i.owned) return false;
    if (!categoryFilter.value) return true;
    return (i.categories ?? []).some((c) => c.id === categoryFilter.value);
  }),
);

function itemCategoryLine(item: ShopItem): string {
  return (item.categories ?? []).map((c) => c.name).join(" · ");
}

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
  const left = shopStockLeft(item);
  return left !== null && left <= 0;
}

async function loadCoins(): Promise<void> {
  if (!auth.token) return;
  const me = await fetch("/api/me", { headers: { Authorization: `Bearer ${auth.token}` } });
  const data = (await me.json()) as { coins?: unknown };
  profileCoins.value = Math.max(0, Math.floor(Number(data.coins ?? 0)));
}

async function load() {
  const seq = ++shopLoadSeq;
  const kind = tab.value;

  if (!auth.token) {
    loading.value = false;
    items.value = [];
    return;
  }

  loading.value = true;
  try {
    await loadCoins();
    if (seq !== shopLoadSeq) return;

    const [list, cats] = await Promise.all([
      listShopItems(auth.token, kind, categoryFilter.value || undefined),
      shopCategories.value.length
        ? Promise.resolve(shopCategories.value)
        : listShopCategories(auth.token),
    ]);
    if (seq !== shopLoadSeq) return;

    if (!shopCategories.value.length) shopCategories.value = cats;
    items.value = list;
  } catch (e) {
    if (seq === shopLoadSeq) toastError(e);
  } finally {
    if (seq === shopLoadSeq) loading.value = false;
  }
}

async function onBuy(item: ShopItem) {
  if (!auth.token || busy.value) return;
  busy.value = item.id;
  try {
    const r = await buyShopItem(auth.token, item.id);
    profileCoins.value = r.coins;
    items.value = items.value.filter((x) => x.id !== item.id);
    toastSuccess(item.name);
  } catch (e) {
    toastError(e);
  } finally {
    busy.value = null;
  }
}

onMounted(load);
watch(tab, () => {
  categoryFilter.value = "";
  void load();
});

watch(categoryFilter, () => {
  void load();
});
watch(
  () => auth.token,
  (t) => {
    if (!t) {
      shopLoadSeq += 1;
      loading.value = false;
      items.value = [];
      return;
    }
    void load();
  },
);
</script>

<template>
  <section class="shop page-shell">
    <header class="page-head">
      <div class="page-head-main">
        <h1>магазин</h1>
      </div>
      <div class="coins-badge" title="монеты">
        <img src="/coin-gem.png" alt="" width="18" height="18" loading="lazy" />
        <span>{{ profileCoins }}</span>
      </div>
    </header>

    <div class="shop-filters">
      <div class="shop-kind" role="tablist" aria-label="разделы">
        <button
          v-for="t in tabs"
          :key="t.key"
          type="button"
          role="tab"
          class="shop-pill shop-pill-kind"
          :class="{ on: tab === t.key }"
          :aria-selected="tab === t.key"
          @click="tab = t.key"
        >
          {{ t.label }}
        </button>
      </div>
      <div v-if="shopCategories.length" class="shop-cats" role="tablist" aria-label="категории">
        <button
          type="button"
          role="tab"
          class="shop-pill"
          :class="{ on: !categoryFilter }"
          :aria-selected="!categoryFilter"
          @click="categoryFilter = ''"
        >
          все
        </button>
        <button
          v-for="c in shopCategories"
          :key="c.id"
          type="button"
          role="tab"
          class="shop-pill"
          :class="{ on: categoryFilter === c.id }"
          :aria-selected="categoryFilter === c.id"
          @click="categoryFilter = categoryFilter === c.id ? '' : c.id"
        >
          {{ c.name }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="page-empty muted">загрузка</div>
    <div v-else-if="!shown.length" class="page-empty muted">пусто</div>
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
          <template v-else-if="item.kind === 'wallpaper' || item.kind === 'cover'">
            <div
              class="wide-thumb"
              :class="item.kind === 'wallpaper' ? 'wallpaper-strip-thumb' : ''"
              :style="{ backgroundImage: `url(${item.url})` }"
            />
          </template>
        </div>
        <p class="item-name">{{ item.name }}</p>
        <p v-if="itemCategoryLine(item)" class="item-category muted small">{{ itemCategoryLine(item) }}</p>
        <p v-if="shopStockCap(item) !== null" class="stock-line muted">
          {{ shopSoldOut(item) ? "распродано" : `ещё ${shopStockLeft(item)}` }}
        </p>
        <div class="item-footer">
          <span class="price">
            <img src="/coin-gem.png" alt="" width="14" height="14" loading="lazy" />
            {{ item.price }}
          </span>
          <button
            type="button"
            class="btn-buy"
            :disabled="busy === item.id || profileCoins < item.price || shopSoldOut(item)"
            @click="onBuy(item)"
          >
            купить
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.shop {
  display: grid;
  gap: 0.5rem;
}
.shop-filters {
  display: grid;
  gap: 0.5rem;
  margin-bottom: 0.15rem;
}
.shop-kind {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.35rem;
}
.shop-cats {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.35rem;
  overflow-x: auto;
  padding-bottom: 0.1rem;
  scrollbar-width: none;
}
.shop-cats::-webkit-scrollbar {
  display: none;
}
.shop-pill {
  font: inherit;
  font-size: 0.8rem;
  line-height: 1.2;
  padding: 0.38rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;
}
.shop-pill-kind {
  border-radius: var(--radius);
  padding: 0.45rem 0.35rem;
  text-align: center;
}
.shop-pill:hover {
  color: var(--text);
  border-color: var(--hover-border);
}
.shop-pill.on,
.shop-pill[aria-selected="true"] {
  background: var(--text);
  color: var(--bg);
  border-color: var(--text);
}
.shop-cats .shop-pill {
  flex: 0 0 auto;
}
.item-category {
  margin: -0.15rem 0 0;
  text-transform: lowercase;
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
.btn-buy {
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
</style>
