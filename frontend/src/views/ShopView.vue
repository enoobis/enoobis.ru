<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  listShopItemsPage,
  SHOP_PAGE_SIZE,
  buyShopItem,
  type ShopItem,
  type ShopItemKind,
} from "../api/shop";
import { useAuthStore } from "../stores/auth";
import { useSessionStore } from "../stores/session";
import { toastError, toastSuccess } from "../utils/toast";
import PageHeader from "../components/PageHeader.vue";
import AppLoading from "../components/AppLoading.vue";
import MotionCoinCount from "../components/MotionCoinCount.vue";
import MotionStagger from "../components/MotionStagger.vue";
import MotionStaggerItem from "../components/MotionStaggerItem.vue";
import DisplacementImage from "../components/DisplacementImage.vue";

const auth = useAuthStore();
const session = useSessionStore();

const tabs: { key: ShopItemKind; label: string }[] = [
  { key: "avatar", label: "аватар" },
  { key: "frame", label: "рамка" },
  { key: "wallpaper", label: "фон" },
  { key: "special", label: "особое" },
];

const tab = ref<ShopItemKind>("avatar");
const items = ref<ShopItem[]>([]);
const page = ref(1);
const pageDraft = ref(1);
const total = ref(0);
const loading = ref(true);
const busy = ref<string | null>(null);
const profileCoins = computed(() => session.coins);

let shopLoadSeq = 0;

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / SHOP_PAGE_SIZE)));

watch(page, (p) => {
  pageDraft.value = p;
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

  loading.value = true;
  try {
    await loadCoins();
    if (seq !== shopLoadSeq) return;

    const listPage = await listShopItemsPage(auth.token, {
      kind,
      page: page.value,
    });
    if (seq !== shopLoadSeq) return;

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
  void load();
});

watch(tab, () => {
  page.value = 1;
  items.value = [];
  loading.value = true;
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
    <PageHeader title="магазин">
      <template #actions>
        <div class="coins-badge" title="монеты">
          <img src="/coin-gem.png" alt="" width="18" height="18" loading="lazy" />
          <MotionCoinCount :value="profileCoins" />
        </div>
      </template>
    </PageHeader>

    <div class="filter-bar filter-bar--stack">
      <div class="filter-tabs" role="tablist" aria-label="разделы">
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
    </div>

    <AppLoading v-if="loading && !items.length" class="page-empty" />
    <div v-else-if="!loading && !items.length" class="page-empty muted">пусто</div>
    <MotionStagger
      v-if="items.length"
      :list-key="`${tab}-${page}`"
      :class="['grid', { 'grid-special': tab === 'special' }]"
    >
      <MotionStaggerItem v-for="item in items" :key="item.id" class="item-card">
        <div class="preview">
          <template v-if="item.kind === 'avatar'">
            <div class="avatar-wrap">
              <DisplacementImage
                :src="item.url"
                :alt="item.name"
                :enabled="!item.is_animated"
                class="avatar-img displacement-host"
              />
              <span v-if="item.is_animated" class="anim-badge">gif</span>
            </div>
          </template>
          <template v-else-if="item.kind === 'frame'">
            <div class="frame-demo">
              <span class="frame-inner" />
              <DisplacementImage
                :src="item.url"
                alt=""
                :enabled="!item.is_animated"
                class="frame-layer displacement-host"
              />
              <span v-if="item.is_animated" class="anim-badge">anim</span>
            </div>
          </template>
          <template v-else-if="item.kind === 'wallpaper'">
            <video
              v-if="/\.(mp4|webm)(\?|#|$)/i.test(item.url)"
              class="wide-thumb wide-thumb-video wallpaper-strip-thumb"
              :src="item.url"
              autoplay
              loop
              muted
              playsinline
            />
            <div
              v-else
              class="wide-thumb wallpaper-strip-thumb"
              :style="{ backgroundImage: `url(${item.url})` }"
            />
          </template>
          <template v-else-if="item.kind === 'special'">
            <img :src="item.url" :alt="item.name" class="special-thumb" loading="lazy" decoding="async" />
          </template>
        </div>
        <p class="item-name" :class="{ 'item-name-special': item.kind === 'special' }">{{ item.name }}</p>
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
      </MotionStaggerItem>
    </MotionStagger>

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
.grid {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
}
.grid-special {
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
}
.special-thumb {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: calc(var(--radius) - 2px);
  border: 1px solid var(--border);
  display: block;
  background: var(--surface2);
}
.item-name-special {
  font-weight: 600;
  line-height: 1.35;
  text-align: center;
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
/* превью — квадратное: круг обрезал бы часть рисунка */
.avatar-img,
.displacement-host.avatar-img {
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
  font-size: var(--text-2xs);
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
.frame-layer,
.displacement-host.frame-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: auto;
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
  font-size: var(--text-sm);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stock-line {
  margin: 0;
  font-size: var(--text-2xs);
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
  font-size: var(--text-sm);
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
  min-height: 36px;
  padding: 0.4rem 0.9rem;
  font-size: var(--text-sm);
}
.shop-page-jump {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: var(--text-xs);
}
.shop-page-input {
  width: 2.75rem;
  font: inherit;
  font-size: var(--text-xs);
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
