<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { api } from "./api/http";
import { useAuthStore } from "./stores/auth";
import { useChatStore } from "./stores/chat";
import AppIcon from "./components/AppIcon.vue";
import AppToast from "./components/AppToast.vue";
import { rememberViewerPreferences } from "./utils/preferences";
import { routeNavPending } from "./sync/routeNavPending";

const router = useRouter();
const route = useRoute();
const onHome = computed(() => route.path === "/");

const auth = useAuthStore();
const chatStore = useChatStore();
const isOnline = ref(typeof navigator !== "undefined" ? navigator.onLine : true);
const profileMenuOpen = ref(false);
const profileMenuRoot = ref<HTMLElement | null>(null);
const navDrawerOpen = ref(false);
const navMenuAnchor = ref<HTMLElement | null>(null);
const navMenuSheetStyle = ref<Record<string, string>>({});
const navMenuMobile = ref(
  typeof window !== "undefined" ? window.innerWidth <= 640 : false,
);
const MOBILE_NAV_MAX = 640;
const profileAvatarUrl = ref("");
const profileAvatarBroken = ref(false);
const profileCoins = ref(0);
const initials = computed(() => (auth.nickname || "U").slice(0, 2).toUpperCase());
const chatBadge = computed(() => (chatStore.unread > 9 ? "9+" : String(chatStore.unread)));
let activityTickStart = Date.now();
let activityInterval: ReturnType<typeof setInterval> | null = null;
let chatPollInterval: ReturnType<typeof setInterval> | null = null;

function syncOnlineStatus() {
  isOnline.value = navigator.onLine;
}

function onDocumentClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest?.(".nav-burger")) return;
  if (profileMenuOpen.value) {
    const root = profileMenuRoot.value;
    if (root && target && root.contains(target)) return;
    profileMenuOpen.value = false;
  }
  if (navDrawerOpen.value) {
    if (target?.closest?.(".nav-menu-sheet")) return;
    navDrawerOpen.value = false;
  }
}

function onEscape(event: KeyboardEvent) {
  if (event.key === "Escape") {
    profileMenuOpen.value = false;
    navDrawerOpen.value = false;
  }
}

function isTypingTarget(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return t.isContentEditable;
}

function onGlobalKey(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    router.push("/search");
    return;
  }
  if (event.key === "/" && !isTypingTarget(event.target)) {
    event.preventDefault();
    router.push("/search");
  }
}

function refreshPage() {
  window.location.reload();
}

function isMobileNav() {
  return typeof window !== "undefined" && window.innerWidth <= MOBILE_NAV_MAX;
}

function refreshNavMenuMode() {
  navMenuMobile.value = isMobileNav();
  syncNavMenuSheetPos();
}

function syncNavMenuSheetPos() {
  if (!navDrawerOpen.value || navMenuMobile.value) {
    navMenuSheetStyle.value = {};
    return;
  }
  const btn = navMenuAnchor.value?.querySelector(".nav-burger") as HTMLElement | null;
  if (!btn) {
    navMenuSheetStyle.value = {};
    return;
  }
  const r = btn.getBoundingClientRect();
  const panelW = 248;
  const gap = 6;
  const margin = 8;
  let left = Math.round(r.left);
  const maxLeft = Math.max(margin, window.innerWidth - panelW - margin);
  if (left > maxLeft) left = maxLeft;
  navMenuSheetStyle.value = {
    position: "fixed",
    top: `${Math.round(r.bottom + gap)}px`,
    left: `${left}px`,
    width: `${panelW}px`,
    maxWidth: `min(${panelW}px, calc(100vw - ${margin * 2}px))`,
  };
}

function onNavMenuLayoutChange() {
  if (navDrawerOpen.value) refreshNavMenuMode();
}

function toggleNavDrawer() {
  navDrawerOpen.value = !navDrawerOpen.value;
  if (navDrawerOpen.value) {
    refreshNavMenuMode();
    void nextTick(() => syncNavMenuSheetPos());
  }
}

function closeNavDrawer() {
  navDrawerOpen.value = false;
}

function toggleProfileMenu() {
  profileMenuOpen.value = !profileMenuOpen.value;
}

async function clearOnlinePresence() {
  if (!auth.token) return;
  try {
    await api("/api/me/activity", {
      method: "POST",
      token: auth.token,
      body: JSON.stringify({ seconds: 0, visible: false }),
    });
  } catch {
    // ignore
  }
}

function logoutFromMenu() {
  profileMenuOpen.value = false;
  profileAvatarUrl.value = "";
  profileAvatarBroken.value = false;
  profileCoins.value = 0;
  stopActivityTracking();
  void clearOnlinePresence().finally(() => auth.logout());
}

async function onProfileAvatarError() {
  await loadMePresentation();
  if (!profileAvatarUrl.value) profileAvatarBroken.value = true;
}

async function loadMePresentation() {
  if (!auth.token) {
    profileAvatarUrl.value = "";
    profileAvatarBroken.value = false;
    profileCoins.value = 0;
    rememberViewerPreferences({});
    return;
  }
  try {
    const me = await api<{
      theme_preference: string;
      language_preference: string;
      font_preference: string;
      avatar_url: string;
      coins?: number;
    }>("/api/me", { token: auth.token });
    profileAvatarUrl.value = me.avatar_url || "";
    profileAvatarBroken.value = false;
    profileCoins.value = Math.max(0, Math.floor(Number(me.coins ?? 0)));
    rememberViewerPreferences(me);
  } catch {
    // ignore preference/profile load failures
  }
}

async function flushActivity(force = false, visible = !document.hidden) {
  if (!auth.token) return;
  const now = Date.now();
  const elapsed = Math.floor((now - activityTickStart) / 1000);
  if (!force && elapsed < 10) return;
  if (!force && document.hidden) return;
  activityTickStart = now;
  const seconds = visible && elapsed > 0 ? Math.min(elapsed, 600) : 0;
  if (!visible && seconds <= 0 && !force) return;
  try {
    const data = await api<{ ok?: boolean; coins?: number }>("/api/me/activity", {
      method: "POST",
      token: auth.token,
      body: JSON.stringify({ seconds, visible: !!visible }),
    });
    if (typeof data.coins === "number") profileCoins.value = data.coins;
  } catch {
    // ignore tracking errors
  }
}

function pulseOnlinePresence() {
  if (!auth.token || document.hidden) return;
  void flushActivity(true, true);
}

function startActivityTracking() {
  stopActivityTracking();
  activityTickStart = Date.now();
  if (!auth.token) return;
  pulseOnlinePresence();
  activityInterval = setInterval(() => {
    void flushActivity(false, !document.hidden);
  }, 30000);
}

function startChatPoll() {
  stopChatPoll();
  if (!auth.token) return;
  chatPollInterval = setInterval(() => void chatStore.refresh(), 15000);
}

function stopChatPoll() {
  if (chatPollInterval) {
    clearInterval(chatPollInterval);
    chatPollInterval = null;
  }
}

function stopActivityTracking() {
  if (activityInterval) {
    clearInterval(activityInterval);
    activityInterval = null;
  }
}

function onVisibilityChange() {
  if (document.hidden) {
    void flushActivity(true, false);
  } else {
    activityTickStart = Date.now();
    void flushActivity(true, true);
  }
}

function onProfileCosmeticsUpdated() {
  void loadMePresentation();
}

function onOnlinePreferenceUpdated() {
  pulseOnlinePresence();
}

onMounted(async () => {
  window.addEventListener("enoobis:profile-cosmetics-updated", onProfileCosmeticsUpdated);
  window.addEventListener("enoobis:online-preference-updated", onOnlinePreferenceUpdated);
  window.addEventListener("online", syncOnlineStatus);
  window.addEventListener("offline", syncOnlineStatus);
  window.addEventListener("keydown", onEscape);
  window.addEventListener("keydown", onGlobalKey);
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("click", onDocumentClick);
  window.addEventListener("resize", onNavMenuLayoutChange);
  window.addEventListener("scroll", onNavMenuLayoutChange, true);
  await loadMePresentation();
  startActivityTracking();
  void chatStore.refresh();
  startChatPoll();
});

onUnmounted(() => {
  window.removeEventListener("enoobis:profile-cosmetics-updated", onProfileCosmeticsUpdated);
  window.removeEventListener("enoobis:online-preference-updated", onOnlinePreferenceUpdated);
  window.removeEventListener("online", syncOnlineStatus);
  window.removeEventListener("offline", syncOnlineStatus);
  window.removeEventListener("keydown", onEscape);
  document.documentElement.style.overflow = "";
  window.removeEventListener("keydown", onGlobalKey);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  document.removeEventListener("click", onDocumentClick);
  window.removeEventListener("resize", onNavMenuLayoutChange);
  window.removeEventListener("scroll", onNavMenuLayoutChange, true);
  void flushActivity(true, false);
  stopActivityTracking();
  stopChatPoll();
});

watch(
  () => route.path,
  () => {
    closeNavDrawer();
  },
);

watch(navDrawerOpen, (open) => {
  if (typeof document === "undefined") return;
  if (open) {
    refreshNavMenuMode();
    void nextTick(() => syncNavMenuSheetPos());
    if (navMenuMobile.value) document.documentElement.style.overflow = "hidden";
  } else {
    navMenuSheetStyle.value = {};
    document.documentElement.style.overflow = "";
  }
});

watch(
  () => auth.token,
  async (tok) => {
    if (!tok) closeNavDrawer();
    await loadMePresentation();
    startActivityTracking();
    if (!auth.token) chatStore.reset();
    void chatStore.refresh();
    startChatPoll();
  },
);
</script>

<template>
  <div class="layout">
    <header class="nav">
      <span v-if="routeNavPending" class="nav-route-loading muted" aria-live="polite">загрузка…</span>
      <div v-if="auth.token" ref="navMenuAnchor" class="nav-menu-anchor">
        <button
          type="button"
          class="icon-btn nav-burger"
          :aria-expanded="navDrawerOpen"
          aria-controls="nav-drawer"
          aria-label="меню"
          @click.stop="toggleNavDrawer"
        >
          <AppIcon name="menu" :size="18" />
        </button>
      </div>
      <RouterLink v-if="onHome" to="/" class="nav-link brand-link">
        <span>enoobis</span>
      </RouterLink>
      <template v-if="!auth.token">
        <RouterLink to="/blogs" class="nav-link"><span>блоги</span></RouterLink>
        <RouterLink to="/microblogs" class="nav-link"><span>микроблоги</span></RouterLink>
      </template>
      <span class="nav-spacer" />
      <template v-if="auth.token">
        <div class="nav-actions">
          <RouterLink to="/search" class="icon-btn" aria-label="поиск" title="поиск">
            <AppIcon name="search" :size="18" />
          </RouterLink>
          <RouterLink to="/chats" class="icon-btn chat-btn" aria-label="чаты" title="чаты">
            <AppIcon name="chat" :size="18" />
            <span v-if="chatStore.unread > 0" class="chat-badge">{{ chatBadge }}</span>
          </RouterLink>
          <RouterLink
            v-if="auth.role === 'teacher' || auth.role === 'admin'"
            to="/storage"
            class="icon-btn"
            aria-label="хранилище"
            title="хранилище"
          >
            <AppIcon name="folder" :size="18" />
          </RouterLink>
          <RouterLink
            v-if="auth.role === 'teacher' || auth.role === 'admin'"
            to="/blogs/write"
            class="icon-btn desktop-only"
            aria-label="написать"
            title="написать"
          >
            <AppIcon name="write" :size="18" />
          </RouterLink>
        </div>
        <div ref="profileMenuRoot" class="profile-menu-wrap">
          <button class="profile-trigger" type="button" @click.stop="toggleProfileMenu">
            <span class="profile-trigger-avatar">
              <img
                v-if="profileAvatarUrl && !profileAvatarBroken"
                :src="profileAvatarUrl"
                alt=""
                class="profile-trigger-avatar-img"
                @error="onProfileAvatarError"
              />
              <span v-else>{{ initials }}</span>
            </span>
          </button>
          <div v-if="profileMenuOpen" class="profile-menu card">
            <div class="profile-menu-head">
              <div class="profile-menu-head-main">
                <span class="profile-menu-name">@{{ auth.nickname }}</span>
              </div>
              <div class="profile-menu-coins" title="монеты">
                <img
                  src="/coin-gem.png"
                  alt=""
                  width="18"
                  height="18"
                  class="profile-coin-img"
                  loading="lazy"
                />
                <span>{{ profileCoins }}</span>
              </div>
            </div>
            <RouterLink :to="`/u/${auth.nickname}`" class="profile-menu-item" @click="profileMenuOpen = false">
              <AppIcon name="profile" :size="20" /><span>профиль</span>
            </RouterLink>
            <RouterLink to="/inventory" class="profile-menu-item" @click="profileMenuOpen = false">
              <AppIcon name="inventory" :size="20" /><span>инвентарь</span>
            </RouterLink>
            <RouterLink to="/saved" class="profile-menu-item" @click="profileMenuOpen = false">
              <AppIcon name="bookmark" :size="20" /><span>закладки</span>
            </RouterLink>
            <RouterLink
              v-if="auth.role === 'teacher' || auth.role === 'admin'"
              to="/invites"
              class="profile-menu-item"
              @click="profileMenuOpen = false"
            >
              <AppIcon name="invites" :size="20" /><span>инвайты</span>
            </RouterLink>
            <RouterLink to="/me/edit" class="profile-menu-item" @click="profileMenuOpen = false">
              <AppIcon name="settings" :size="20" /><span>настройки</span>
            </RouterLink>
            <span class="profile-menu-sep" />
            <button class="profile-menu-item profile-menu-btn" type="button" @click="logoutFromMenu">
              <AppIcon name="logout" :size="20" /><span>выход</span>
            </button>
          </div>
        </div>
      </template>
      <template v-else>
        <RouterLink to="/login" class="nav-link"><span>вход</span></RouterLink>
        <RouterLink to="/register" class="nav-link"><span>регистрация</span></RouterLink>
      </template>
    </header>
    <Teleport to="body">
      <Transition name="nav-menu">
        <div
          v-if="navDrawerOpen"
          id="nav-drawer"
          class="nav-menu-root"
          :class="{ 'nav-menu-root--sheet': navMenuMobile }"
          @click="closeNavDrawer"
        >
          <div
            class="nav-menu-sheet"
            :class="{ 'nav-menu-sheet--popover': !navMenuMobile }"
            :style="navMenuSheetStyle"
            role="dialog"
            aria-modal="true"
            aria-label="разделы"
            @click.stop
          >
            <span class="nav-menu-handle" aria-hidden="true" />
            <nav class="nav-menu-inner">
              <RouterLink to="/blogs" class="nav-menu-link" @click="closeNavDrawer">блоги</RouterLink>
              <RouterLink to="/microblogs" class="nav-menu-link" @click="closeNavDrawer">микроблоги</RouterLink>
              <RouterLink v-if="auth.token" to="/courses" class="nav-menu-link" @click="closeNavDrawer">
                курсы
              </RouterLink>
              <RouterLink v-if="auth.token" to="/library" class="nav-menu-link" @click="closeNavDrawer">
                библиотека
              </RouterLink>
              <RouterLink v-if="auth.token" to="/shop" class="nav-menu-link" @click="closeNavDrawer">
                магазин
              </RouterLink>
              <RouterLink
                v-if="auth.role === 'admin'"
                to="/admin"
                class="nav-menu-link"
                @click="closeNavDrawer"
              >
                админ
              </RouterLink>
            </nav>
          </div>
        </div>
      </Transition>
    </Teleport>
    <RouterView v-slot="{ Component, route }">
      <Transition name="page" mode="out-in">
        <component :is="Component" :key="route.path" />
      </Transition>
    </RouterView>
    <AppToast />
    <div v-if="!isOnline" class="offline-overlay" role="status" aria-live="polite">
      <div class="offline-card">
        <h2>нет связи</h2>
        <p class="muted">проверьте подключение</p>
        <button type="button" @click="refreshPage">обновить</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.offline-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.95);
  display: grid;
  place-items: center;
  padding: 1rem;
}

.offline-card {
  width: min(520px, 100%);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 1.25rem;
  text-align: center;
}

.offline-card p {
  color: var(--muted);
}

.nav-menu-anchor {
  display: inline-flex;
  align-items: center;
}

.nav-menu-root {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(0, 0, 0, 0.2);
}

.nav-menu-root--sheet {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}

.nav-menu-sheet {
  background: var(--surface);
  border: 1px solid var(--border);
  overflow-y: auto;
}

.nav-menu-sheet--popover {
  padding: 0.4rem;
  border-radius: var(--radius);
  max-height: min(70vh, 22rem);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.nav-menu-root--sheet .nav-menu-sheet {
  width: 100%;
  max-width: 640px;
  margin: 0;
  padding: 0.5rem 0.85rem calc(0.85rem + env(safe-area-inset-bottom, 0px));
  border-bottom: none;
  border-radius: var(--radius) var(--radius) 0 0;
  max-height: min(72vh, 28rem);
}

.nav-menu-handle {
  display: block;
  width: 2.25rem;
  height: 3px;
  margin: 0.35rem auto 0.65rem;
  border-radius: 999px;
  background: var(--border);
}

.nav-menu-root:not(.nav-menu-root--sheet) .nav-menu-handle {
  display: none;
}

.nav-menu-inner {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.nav-menu-link {
  display: block;
  width: 100%;
  min-height: 48px;
  padding: 0.75rem 0.85rem;
  color: var(--text);
  text-transform: lowercase;
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.35;
  border: none;
  border-radius: 8px;
  background: transparent;
  text-align: left;
}

.nav-menu-root--sheet .nav-menu-link {
  min-height: 52px;
  padding: 0.9rem 0.75rem;
  font-size: 1.05rem;
  border-radius: 0;
  text-align: center;
}

.nav-menu-link:hover {
  background: var(--surface2);
  color: var(--text);
  text-decoration: none;
}

.nav-menu-root--sheet .nav-menu-link:hover {
  background: var(--surface2);
  color: var(--text);
}

.nav-menu-enter-active .nav-menu-sheet,
.nav-menu-leave-active .nav-menu-sheet {
  transition: transform 0.24s ease, opacity 0.18s ease;
}

.nav-menu-enter-active.nav-menu-root,
.nav-menu-leave-active.nav-menu-root {
  transition: background 0.2s ease;
}

.nav-menu-root--sheet.nav-menu-enter-from .nav-menu-sheet,
.nav-menu-root--sheet.nav-menu-leave-to .nav-menu-sheet {
  transform: translateY(100%);
}

.nav-menu-root:not(.nav-menu-root--sheet).nav-menu-enter-from .nav-menu-sheet,
.nav-menu-root:not(.nav-menu-root--sheet).nav-menu-leave-to .nav-menu-sheet {
  transform: translateY(-6px);
  opacity: 0;
}

.nav-menu-enter-from.nav-menu-root,
.nav-menu-leave-to.nav-menu-root {
  background: rgba(0, 0, 0, 0);
}

.profile-menu-wrap {
  position: relative;
}

.nav-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-right: 0.25rem;
}

.chat-btn {
  position: relative;
}
.chat-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 999px;
  background: var(--text);
  color: var(--bg, #000);
  font-size: 0.62rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.profile-trigger {
  border-radius: var(--avatar-radius);
  min-height: 44px;
  width: 44px;
  height: 44px;
  padding: 0;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  transition: background 0.18s ease, border-color 0.18s ease;
}

@media (max-width: 640px) {
  .profile-trigger {
    min-height: 40px;
    width: 40px;
    height: 40px;
  }
}

.profile-trigger:hover {
  background: var(--hover-surface);
  border-color: var(--hover-border);
}

.profile-trigger-avatar {
  width: 100%;
  height: 100%;
  border-radius: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.68rem;
  font-weight: 600;
  background: transparent;
  color: var(--muted);
  overflow: hidden;
}

.profile-trigger-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.profile-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 0.4rem);
  width: 260px;
  padding: 0.45rem;
  z-index: 40;
}
@media (max-width: 640px) {
  .profile-menu {
    width: min(280px, calc(100vw - 1.2rem));
  }
  .nav-actions {
    gap: 0.2rem;
  }
}

.profile-menu-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.65rem;
  padding: 0.45rem 0.6rem 0.55rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 0.25rem;
}
.profile-menu-head-main {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  min-width: 0;
}
.profile-menu-coins {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
}
.profile-coin-img {
  display: block;
  width: 18px;
  height: 18px;
  object-fit: contain;
  flex-shrink: 0;
}
.profile-menu-name {
  color: var(--text);
  font-size: 1rem;
  font-weight: 500;
  text-transform: lowercase;
}
.profile-menu-role {
  font-size: 0.72rem;
  text-transform: lowercase;
}

.profile-menu-sep {
  display: block;
  height: 1px;
  background: var(--border);
  margin: 0.3rem 0;
}

.profile-menu-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  color: var(--text);
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  border: none;
  background: transparent;
  text-align: left;
  text-transform: lowercase;
  font: inherit;
  font-size: 1rem;
  line-height: 1.35;
  min-height: 48px;
  cursor: pointer;
}

.profile-menu-item:hover {
  background: var(--surface2);
  color: var(--text);
  text-decoration: none;
}
.profile-menu-item :deep(.app-icon) {
  flex-shrink: 0;
  opacity: 0.8;
}
.profile-menu-item:hover :deep(.app-icon) {
  opacity: 1;
}

.brand-link {
  font-weight: 600;
  color: var(--text);
}
.brand-link:hover {
  color: var(--text);
}

.offline-card h2 {
  text-transform: lowercase;
}
</style>
