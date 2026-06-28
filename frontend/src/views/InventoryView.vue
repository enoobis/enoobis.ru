<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { api } from "../api/http";
import {
  deleteOwnedShopItem,
  listMyShopItems,
  equipShopItem,
  type EquipResult,
  type OwnedShopItem,
  type ShopItemKind,
  shopKindLabel,
} from "../api/shop";
import { useAuthStore } from "../stores/auth";
import { useSessionStore } from "../stores/session";
import { toastError, toastSuccess } from "../utils/toast";
import PageHeader from "../components/PageHeader.vue";
import AppIcon from "../components/AppIcon.vue";
import MotionCoinCount from "../components/MotionCoinCount.vue";
import MotionStagger from "../components/MotionStagger.vue";
import MotionStaggerItem from "../components/MotionStaggerItem.vue";
import DisplacementImage from "../components/DisplacementImage.vue";

const auth = useAuthStore();
const session = useSessionStore();
const items = ref<OwnedShopItem[]>([]);
const loading = ref(true);
const busy = ref<string | null>(null);
const profileCoins = computed(() => session.coins);

const KIND_ORDER: ShopItemKind[] = ["frame", "special", "wallpaper", "avatar"];

type Cosmetics = {
  avatar_url: string;
  wallpaper_url: string;
  avatar_frame_url: string;
  profile_cover_url: string;
};

const cosmetics = ref<Cosmetics | null>(null);

function kindLabel(k: ShopItemKind): string {
  return shopKindLabel(k);
}

function kindSortKey(k: ShopItemKind): number {
  const i = KIND_ORDER.indexOf(k);
  return i === -1 ? 100 : i;
}

const sortedItems = computed(() =>
  [...items.value].sort((a, b) => {
    const d = kindSortKey(a.kind) - kindSortKey(b.kind);
    if (d !== 0) return d;
    return a.acquired_at < b.acquired_at ? 1 : -1;
  }),
);

function applyCosmeticsFromEquip(r: EquipResult) {
  cosmetics.value = {
    avatar_url: r.avatar_url,
    wallpaper_url: r.wallpaper_url,
    avatar_frame_url: r.avatar_frame_url,
    profile_cover_url: r.profile_cover_url,
  };
}

function isEquipped(a: OwnedShopItem): boolean {
  const c = cosmetics.value;
  if (!c) return false;
  if (a.kind === "avatar") return !!a.url && a.url !== "#" && a.url === c.avatar_url;
  if (a.kind === "frame") return !!a.url && a.url !== "#" && a.url === c.avatar_frame_url;
  if (a.kind === "wallpaper") return !!a.url && a.url !== "#" && a.url === c.wallpaper_url;
  return false;
}

async function load() {
  const showLoading = !items.value.length;
  if (showLoading) loading.value = true;
  try {
    await session.ensureMe();
    items.value = await listMyShopItems(auth.token!);
    const me = await api<Cosmetics & { coins?: number }>("/api/me", { token: auth.token! });
    cosmetics.value = {
      avatar_url: me.avatar_url ?? "",
      wallpaper_url: me.wallpaper_url ?? "",
      avatar_frame_url: me.avatar_frame_url ?? "",
      profile_cover_url: me.profile_cover_url ?? "",
    };
  } catch (e) {
    toastError(e);
  } finally {
    loading.value = false;
  }
}

async function onApply(a: OwnedShopItem) {
  if (!auth.token || busy.value) return;
  busy.value = a.id;
  try {
    const r = await equipShopItem(auth.token, a.id);
    applyCosmeticsFromEquip(r);
    toastSuccess("применено");
    window.dispatchEvent(new CustomEvent("enoobis:profile-cosmetics-updated"));
  } catch (e) {
    toastError(e);
  } finally {
    busy.value = null;
  }
}

async function onRemove(a: OwnedShopItem) {
  if (!auth.token || busy.value) return;
  if (!window.confirm(`удалить «${a.name}»? вернуть можно только новой покупкой`)) return;
  busy.value = a.id;
  try {
    const r = await deleteOwnedShopItem(auth.token, a.id);
    applyCosmeticsFromEquip(r);
    items.value = items.value.filter((x) => x.id !== a.id);
    toastSuccess("удалено");
    window.dispatchEvent(new CustomEvent("enoobis:profile-cosmetics-updated"));
  } catch (e) {
    toastError(e);
  } finally {
    busy.value = null;
  }
}

async function onCancel(a: OwnedShopItem) {
  if (!auth.token || busy.value) return;
  busy.value = a.id;
  try {
    const body: Record<string, string> = {};
    if (a.kind === "avatar") body.avatar_url = "";
    else if (a.kind === "frame") body.avatar_frame_url = "";
    else if (a.kind === "wallpaper") body.wallpaper_url = "";
    await api("/api/me", { method: "PATCH", token: auth.token, body: JSON.stringify(body) });
    toastSuccess("снято");
    window.dispatchEvent(new CustomEvent("enoobis:profile-cosmetics-updated"));
    await load();
  } catch (e) {
    toastError(e);
  } finally {
    busy.value = null;
  }
}

onMounted(load);
</script>

<template>
  <section class="inv page-shell">
    <PageHeader title="инвентарь">
      <template #actions>
        <div class="coins-badge" title="монеты">
          <img src="/coin-gem.png" alt="" width="18" height="18" loading="lazy" />
          <MotionCoinCount :value="profileCoins" />
        </div>
      </template>
    </PageHeader>
    <div v-if="loading && !items.length" class="page-empty muted">загрузка</div>
    <div v-else-if="!loading && !items.length" class="page-empty muted">
      <p>пусто</p>
      <RouterLink to="/shop" class="to-shop">магазин →</RouterLink>
    </div>
    <MotionStagger v-if="items.length" :list-key="String(items.length)" class="grid">
      <MotionStaggerItem v-for="a in sortedItems" :key="a.id" class="item-card">
        <span class="kind muted small">{{ kindLabel(a.kind) }}</span>
        <div class="preview">
          <template v-if="a.kind === 'avatar'">
            <div class="avatar-wrap">
              <DisplacementImage
                :src="a.url"
                :alt="a.name"
                :enabled="!a.is_animated"
                class="avatar-img displacement-host"
              />
              <span v-if="a.is_animated" class="anim-badge">gif</span>
            </div>
          </template>
          <template v-else-if="a.kind === 'frame'">
            <div class="frame-demo">
              <span class="frame-inner" />
              <DisplacementImage
                :src="a.url"
                alt=""
                :enabled="!a.is_animated"
                class="frame-layer displacement-host"
              />
              <span v-if="a.is_animated" class="anim-badge">anim</span>
            </div>
          </template>
          <template v-else-if="a.kind === 'wallpaper'">
            <video
              v-if="/\.(mp4|webm)(\?|#|$)/i.test(a.url)"
              class="wide-thumb wide-thumb-video wallpaper-strip-thumb"
              :src="a.url"
              autoplay
              loop
              muted
              playsinline
            />
            <div
              v-else
              class="wide-thumb wallpaper-strip-thumb"
              :style="{ backgroundImage: `url(${a.url})` }"
            />
          </template>
          <template v-else-if="a.kind === 'special'">
            <img :src="a.url" :alt="a.name" class="special-thumb" loading="lazy" decoding="async" />
          </template>
        </div>
        <p class="item-name">{{ a.name }}</p>
        <div class="item-footer">
          <template v-if="a.kind === 'special'">
            <span class="owned-label muted small">куплено</span>
          </template>
          <template v-else>
            <button
              v-if="isEquipped(a)"
              type="button"
              class="btn-pill-sm btn-cancel"
              :disabled="busy === a.id"
              @click="onCancel(a)"
            >
              отменить
            </button>
            <button v-else type="button" class="btn-pill-sm btn-equip" :disabled="busy === a.id" @click="onApply(a)">
              применить
            </button>
          </template>
          <button
            type="button"
            class="btn-remove"
            aria-label="удалить"
            title="удалить"
            :disabled="busy === a.id"
            @click="onRemove(a)"
          >
            <AppIcon name="delete" :size="15" />
          </button>
        </div>
      </MotionStaggerItem>
    </MotionStagger>
  </section>
</template>

<style scoped>
.inv {
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
.item-card {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.kind {
  font-size: 0.72rem;
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
.avatar-img,
.displacement-host.avatar-img {
  width: 80px;
  height: 80px;
  border-radius: var(--avatar-radius);
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
.special-thumb {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: calc(var(--radius) - 2px);
  border: 1px solid var(--border);
  display: block;
  background: var(--surface2);
}
.owned-label {
  flex: 1;
  text-align: center;
}
.item-name {
  margin: 0;
  font-size: 0.85rem;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  margin-top: auto;
}
.btn-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.3rem;
  min-height: 0;
  border: none;
  background: transparent;
  color: var(--muted);
}
.btn-remove:hover {
  color: var(--text);
  background: transparent;
  transform: none;
}
.btn-equip {
  border-color: var(--text);
}
.btn-cancel {
  border-color: var(--muted);
  color: var(--muted);
}
.to-shop {
  display: inline-block;
  margin-top: 0.5rem;
}
</style>
