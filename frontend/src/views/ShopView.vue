<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  listShopCategories,
  listShopItemsPage,
  getShopStorage,
  shopStorageMeta,
  SHOP_PAGE_SIZE,
  buyShopItem,
  type ShopCategory,
  type ShopItem,
  type ShopItemKind,
  type ShopStorage,
} from "../api/shop";
import { useAuthStore } from "../stores/auth";
import { useSessionStore } from "../stores/session";
import { toastError, toastSuccess } from "../utils/toast";
import { fmtBytes } from "../utils/bytes";
import PageHeader from "../components/PageHeader.vue";

const auth = useAuthStore();
const session = useSessionStore();

const tabs: { key: ShopItemKind; label: string }[] = [
  { key: "avatar", label: "аватар" },
  { key: "frame", label: "рамка" },
  { key: "wallpaper", label: "фон" },
  { key: "cover", label: "обложка" },
];

const tab = ref<ShopItemKind>("avatar");
const categoryFilter = ref("");
const categoryOpen = ref(false);
const categoryMenuRoot = ref<HTMLElement | null>(null);
const shopCategories = ref<ShopCategory[]>([]);
const items = ref<ShopItem[]>([]);
const page = ref(1);
const pageDraft = ref(1);
const total = ref(0);
const loading = ref(true);
const busy = ref<string | null>(null);
const shopStorage = ref<ShopStorage | null>(null);
const profileCoins = computed(() => session.coins);
const shopHeadMeta = computed(() => shopStorageMeta(shopStorage.value, tab.value));

let shopLoadSeq = 0;

const categoryButtonLabel = computed(() => {
  if (!categoryFilter.value) return "категория · все";
  const name = shopCategories.value.find((c) => c.id === categoryFilter.value)?.name;
  return name ? `категория · ${name}` : "категория";
});

function selectCategory(id: string) {
  categoryFilter.value = id;
  categoryOpen.value = false;
}

function onDocumentClick(e: MouseEvent) {
  if (!categoryOpen.value) return;
  const t = e.target as HTMLElement | null;
  if (categoryMenuRoot.value?.contains(t)) return;
  categoryOpen.value = false;
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / SHOP_PAGE_SIZE)));

watch(page, (p) => {
  pageDraft.value = p;
});

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
  await session.ensureMe();
}

async function load() {
  const seq = ++shopLoadSeq;
  const kind = tab.value;

  if (!auth.token) {
    loading.value = false;
    items.value = [];
    return;
  }

  const showLoading = !items.value.length;
  if (showLoading) loading.value = true;
  try {
    await loadCoins();
    if (seq !== shopLoadSeq) return;

    const [listPage, cats, storage] = await Promise.all([
      listShopItemsPage(auth.token, {
        kind,
        category: categoryFilter.value || undefined,
        page: page.value,
      }),
      shopCategories.value.length
        ? Promise.resolve(shopCategories.value)
        : listShopCategories(auth.token),
      getShopStorage(auth.token),
    ]);
    if (seq !== shopLoadSeq) return;

    shopStorage.value = storage;

    if (!shopCategories.value.length) shopCategories.value = cats;
    const maxPage = Math.max(1, Math.ceil(listPage.total / SHOP_PAGE_SIZE));
    if (page.value > maxPage) {
      page.value = maxPage;
      if (seq === shopLoadSeq) void load();
      return;
    }
    items.value = listPage.items;
    total.value = listPage.total;
  } catch (e) {
    if (seq === shopLoadSeq) toastError(e);
  } finally {
    if (seq === shopLoadSeq) loading.value = false;
  }
}

function goPage(next: number) {
  const p = Math.min(totalPages.value, Math.max(1, Math.floor(Number(next)) || 1));
  pageDraft.value = p;
  if (p === page.value) return;
  page.value = p;
  void load();
}

function applyPageDraft() {
  goPage(pageDraft.value);
}

async function onBuy(item: ShopItem) {
  if (!auth.token || busy.value) return;
  busy.value = item.id;
  try {
    const r = await buyShopItem(auth.token, item.id);
    session.setCoins(r.coins);
    toastSuccess(item.name);
    await load();
  } catch (e) {
    toastError(e);
  } finally {
    busy.value = null;
  }
}

onMounted(() => {
  document.addEventListener("click", onDocumentClick);
  void load();
});

onUnmounted(() => {
  document.removeEventListener("click", onDocumentClick);
});

watch(tab, () => {
  categoryFilter.value = "";
  categoryOpen.value = false;
  page.value = 1;
  void load();
});

watch(categoryFilter, () => {
  page.value = 1;
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
    <PageHeader title="магазин" :meta="shopHeadMeta || undefined">
      <template #actions>
        <div class="coins-badge" title="монеты">
          <img src="/coin-gem.png" alt="" width="18" height="18" loading="lazy" />
          <span>{{ profileCoins }}</span>
        </div>
      </template>
    </PageHeader>

    <div class="shop-filters">
      <div class="filter-tabs shop-kind" role="tablist" aria-label="разделы">
        <button
          v-for="t in tabs"
          :key="t.key"
          type="button"
          role="tab"
          class="filter-tab"
          :class="{ on: tab === t.key }"
          :aria-selected="tab === t.key"
          @click="tab = t.key"
        >
          {{ t.label }}
        </button>
      </div>
      <div
        v-if="shopCategories.length"
        ref="categoryMenuRoot"
        class="shop-cat-picker filter-menu-wrap"
      >
        <button
          type="button"
          class="filter-tab shop-cat-btn"
          :class="{ on: categoryOpen || categoryFilter }"
          aria-haspopup="listbox"
          :aria-expanded="categoryOpen"
          @click.stop="categoryOpen = !categoryOpen"
        >
          {{ categoryButtonLabel }}
        </button>
        <div v-if="categoryOpen" class="filter-menu card shop-cat-menu" role="listbox" aria-label="категории">
          <button
            type="button"
            class="filter-menu-opt"
            :class="{ on: !categoryFilter }"
            role="option"
            @click="selectCategory('')"
          >
            все
          </button>
          <button
            v-for="c in shopCategories"
            :key="c.id"
            type="button"
            class="filter-menu-opt"
            :class="{ on: categoryFilter === c.id }"
            role="option"
            @click="selectCategory(c.id)"
          >
            {{ c.name }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading && !items.length" class="page-empty muted">загрузка</div>
    <div v-else-if="!loading && !items.length" class="page-empty muted">пусто</div>
    <ul v-if="items.length" class="grid">
      <li v-for="item in items" :key="item.id" class="item-card">
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
              <span v-if="item.is_animated" class="anim-badge">anim</span>
            </div>
          </template>
          <template v-else-if="item.kind === 'wallpaper' || item.kind === 'cover'">
            <video
              v-if="item.kind === 'wallpaper' && /\.(mp4|webm)(\?|#|$)/i.test(item.url)"
              class="wide-thumb wide-thumb-video"
              :class="item.kind === 'wallpaper' ? 'wallpaper-strip-thumb' : ''"
              :src="item.url"
              autoplay
              loop
              muted
              playsinline
            />
            <div
              v-else
              class="wide-thumb"
              :class="item.kind === 'wallpaper' ? 'wallpaper-strip-thumb' : ''"
              :style="{ backgroundImage: `url(${item.url})` }"
            />
          </template>
        </div>
        <p class="item-name">{{ item.name }}</p>
        <p v-if="item.size_bytes" class="item-size muted small">{{ fmtBytes(item.size_bytes) }}</p>
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
            class="btn-pill-sm"
            :disabled="busy === item.id || profileCoins < item.price || shopSoldOut(item)"
            @click="onBuy(item)"
          >
            купить
          </button>
        </div>
      </li>
    </ul>

    <nav v-if="!loading && totalPages > 1" class="shop-pages" aria-label="страницы">
      <button type="button" class="shop-page-btn secondary" :disabled="page <= 1" @click="goPage(page - 1)">
        назад
      </button>
      <label class="shop-page-jump">
        <input
          v-model.number="pageDraft"
          type="number"
          min="1"
          :max="totalPages"
          class="shop-page-input"
          aria-label="страница"
          @keyup.enter="applyPageDraft"
          @blur="applyPageDraft"
        />
        <span class="muted small">/ {{ totalPages }}</span>
      </label>
      <button
        type="button"
        class="shop-page-btn secondary"
        :disabled="page >= totalPages"
        @click="goPage(page + 1)"
      >
        вперёд
      </button>
    </nav>
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
@media (max-width: 480px) {
  .shop-kind {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.shop-cat-picker {
  width: 100%;
}
.shop-cat-btn {
  width: 100%;
  justify-content: flex-start;
  text-align: left;
}
.shop-cat-menu {
  left: 0;
  right: 0;
  width: 100%;
  max-width: none;
  max-height: min(14rem, 45vh);
  overflow-y: auto;
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
  border-radius: var(--avatar-radius);
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
  text-transform: lowercase;
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
  border-radius: var(--avatar-radius);
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
.wide-thumb-video {
  display: block;
  object-fit: cover;
  object-position: center;
  pointer-events: none;
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
.shop-pages {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  margin-top: 0.35rem;
  padding-top: 0.25rem;
}
.shop-page-btn {
  min-height: 0;
  padding: 0.35rem 0.75rem;
  font-size: 0.82rem;
}
.shop-page-jump {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.82rem;
}
.shop-page-input {
  width: 2.75rem;
  font: inherit;
  font-size: 0.82rem;
  padding: 0.3rem 0.35rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
  text-align: center;
  -moz-appearance: textfield;
}
.shop-page-input::-webkit-outer-spin-button,
.shop-page-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.shop-page-input:focus {
  outline: none;
  border-color: var(--text);
}
</style>
