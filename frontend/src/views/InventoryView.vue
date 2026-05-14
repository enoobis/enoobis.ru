<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { api } from "../api/http";
import {
  listMyShopItems,
  equipShopItem,
  type EquipResult,
  type OwnedShopItem,
  type ShopItemKind,
} from "../api/shop";
import { useAuthStore } from "../stores/auth";
import { toastError, toastSuccess } from "../utils/toast";

const auth = useAuthStore();
const items = ref<OwnedShopItem[]>([]);
const loading = ref(true);
const busy = ref<string | null>(null);
const profileCoins = ref(0);

/** порядок: рамка → обложка → фон → аватар → оформление */
const KIND_ORDER: ShopItemKind[] = [
  "frame",
  "cover",
  "wallpaper",
  "avatar",
  "font",
  "ink",
  "accent",
  "radius",
];

type Cosmetics = {
  avatar_url: string;
  wallpaper_url: string;
  avatar_frame_url: string;
  profile_cover_url: string;
  ui_font_slug: string;
  ui_ink_hex: string;
  ui_accent_hex: string;
  ui_radius_slug: string;
};

const cosmetics = ref<Cosmetics | null>(null);

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

function kindLabel(k: ShopItemKind): string {
  if (k === "avatar") return "аватар";
  if (k === "frame") return "рамка";
  if (k === "wallpaper") return "фон";
  if (k === "cover") return "обложка";
  if (k === "font") return "шрифт";
  if (k === "ink") return "текст";
  if (k === "accent") return "акцент";
  return "углы";
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
    ui_font_slug: r.ui_font_slug,
    ui_ink_hex: r.ui_ink_hex,
    ui_accent_hex: r.ui_accent_hex,
    ui_radius_slug: r.ui_radius_slug,
  };
}

function isEquipped(a: OwnedShopItem): boolean {
  const c = cosmetics.value;
  if (!c) return false;
  if (a.kind === "avatar") return !!a.url && a.url !== "#" && a.url === c.avatar_url;
  if (a.kind === "frame") return !!a.url && a.url !== "#" && a.url === c.avatar_frame_url;
  if (a.kind === "wallpaper") return !!a.url && a.url !== "#" && a.url === c.wallpaper_url;
  if (a.kind === "cover") return !!a.url && a.url !== "#" && a.url === c.profile_cover_url;
  const pv = (a.preset_value ?? "").trim().toLowerCase();
  if (a.kind === "font") return pv === (c.ui_font_slug || "outfit").trim().toLowerCase();
  if (a.kind === "ink") return !!pv && pv === (c.ui_ink_hex || "").trim().toLowerCase();
  if (a.kind === "accent") return !!pv && pv === (c.ui_accent_hex || "").trim().toLowerCase();
  if (a.kind === "radius") {
    const cur = (c.ui_radius_slug || "default").trim();
    return (a.preset_value || "default").trim() === cur;
  }
  return false;
}

async function load() {
  loading.value = true;
  try {
    items.value = await listMyShopItems(auth.token!);
    const me = await api<Cosmetics & { coins?: number }>("/api/me", { token: auth.token! });
    profileCoins.value = Math.max(0, Math.floor(Number(me.coins ?? 0)));
    cosmetics.value = {
      avatar_url: me.avatar_url ?? "",
      wallpaper_url: me.wallpaper_url ?? "",
      avatar_frame_url: me.avatar_frame_url ?? "",
      profile_cover_url: me.profile_cover_url ?? "",
      ui_font_slug: me.ui_font_slug ?? "outfit",
      ui_ink_hex: me.ui_ink_hex ?? "",
      ui_accent_hex: me.ui_accent_hex ?? "",
      ui_radius_slug: me.ui_radius_slug ?? "default",
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

async function onCancel(a: OwnedShopItem) {
  if (!auth.token || busy.value) return;
  busy.value = a.id;
  try {
    const body: Record<string, string> = {};
    if (a.kind === "avatar") body.avatar_url = "";
    else if (a.kind === "frame") body.avatar_frame_url = "";
    else if (a.kind === "wallpaper") body.wallpaper_url = "";
    else if (a.kind === "cover") body.profile_cover_url = "";
    else if (a.kind === "font") body.ui_font_slug = "outfit";
    else if (a.kind === "ink") body.ui_ink_hex = "";
    else if (a.kind === "accent") body.ui_accent_hex = "";
    else if (a.kind === "radius") body.ui_radius_slug = "default";
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
  <section class="inv">
    <header class="inv-head">
      <h1>инвентарь</h1>
      <div class="coins-badge" title="монеты">
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
      <li v-for="a in sortedItems" :key="a.id" class="card item-card">
        <span class="kind muted small">{{ kindLabel(a.kind) }}</span>
        <div class="preview">
          <template v-if="a.kind === 'avatar'">
            <div class="avatar-wrap">
              <img :src="a.url" :alt="a.name" class="avatar-img" loading="lazy" />
              <span v-if="a.is_animated" class="anim-badge">gif</span>
            </div>
          </template>
          <template v-else-if="a.kind === 'frame'">
            <div class="frame-demo">
              <span class="frame-inner" />
              <img :src="a.url" alt="" class="frame-layer" loading="lazy" />
            </div>
          </template>
          <template v-else-if="a.kind === 'font'">
            <div class="preset-font" :style="{ fontFamily: fontPreviewFamily(a.preset_value) }">аг</div>
          </template>
          <template v-else-if="a.kind === 'ink' || a.kind === 'accent'">
            <div
              class="preset-swatch"
              :style="{ background: a.preset_value && a.preset_value.startsWith('#') ? a.preset_value : 'var(--surface2)' }"
            />
          </template>
          <template v-else-if="a.kind === 'radius'">
            <div class="preset-radius">
              <span class="preset-radius-box" :style="{ borderRadius: radiusPreviewPx(a.preset_value) }" />
            </div>
          </template>
          <template v-else-if="a.kind === 'wallpaper' || a.kind === 'cover'">
            <div
              class="wide-thumb"
              :class="a.kind === 'wallpaper' ? 'wallpaper-strip-thumb' : ''"
              :style="{ backgroundImage: `url(${a.url})` }"
            />
          </template>
        </div>
        <p class="item-name">{{ a.name }}</p>
        <div class="item-footer">
          <button
            v-if="isEquipped(a)"
            type="button"
            class="btn-cancel"
            :disabled="busy === a.id"
            @click="onCancel(a)"
          >
            отменить
          </button>
          <button v-else type="button" class="btn-equip" :disabled="busy === a.id" @click="onApply(a)">
            применить
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
.item-footer {
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
.btn-cancel {
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  font-size: 0.8rem;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  min-height: 0;
}
.btn-cancel:hover:not(:disabled) {
  background: var(--surface2);
  color: var(--text);
}
.btn-equip:disabled,
.btn-cancel:disabled {
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
