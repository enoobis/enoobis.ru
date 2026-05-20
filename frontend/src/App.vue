<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { api } from "./api/http";
import { useAuthStore } from "./stores/auth";
import { useChatStore } from "./stores/chat";
import AppIcon from "./components/AppIcon.vue";
import AppToast from "./components/AppToast.vue";
import { applyUserPreferences } from "./utils/preferences";
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
const navBurgerRef = ref<HTMLButtonElement | null>(null);
const drawerPanelPos = ref({ top: "0px", left: "0px" });
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
    if (target?.closest?.(".nav-drawer-panel")) return;
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

function syncDrawerPanelPos() {
  const el = navBurgerRef.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const pad = 6;
  const panelW = 208;
  let left = Math.round(r.left);
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - panelW - margin);
  if (left > maxLeft) left = maxLeft;
  drawerPanelPos.value = {
    top: `${Math.round(r.bottom + pad)}px`,
    left: `${left}px`,
  };
}

function onLayoutScrollResize() {
  if (navDrawerOpen.value) syncDrawerPanelPos();
}

function toggleNavDrawer() {
  navDrawerOpen.value = !navDrawerOpen.value;
  if (navDrawerOpen.value) void nextTick(() => syncDrawerPanelPos());
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

async function loadMePresentation() {
  if (!auth.token) {
    profileAvatarUrl.value = "";
    profileAvatarBroken.value = false;
    profileCoins.value = 0;
    applyUserPreferences({});
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
    applyUserPreferences(me);
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
  window.addEventListener("resize", onLayoutScrollResize);
  window.addEventListener("scroll", onLayoutScrollResize, true);
  window.addEventListener("keydown", onEscape);
  window.addEventListener("keydown", onGlobalKey);
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("click", onDocumentClick);
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
  window.removeEventListener("resize", onLayoutScrollResize);
  window.removeEventListener("scroll", onLayoutScrollResize, true);
  window.removeEventListener("keydown", onEscape);
  window.removeEventListener("keydown", onGlobalKey);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  document.removeEventListener("click", onDocumentClick);
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
  if (open) void nextTick(() => syncDrawerPanelPos());
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
      <button
        v-if="auth.token"
        ref="navBurgerRef"
        type="button"
        class="icon-btn nav-burger"
        :aria-expanded="navDrawerOpen"
        aria-controls="nav-drawer"
        aria-label="меню"
        @click.stop="toggleNavDrawer"
      >
        <AppIcon name="menu" :size="18" />
      </button>
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
            class="icon-btn desktop-only"
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
                @error="profileAvatarBroken = true"
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
              <AppIcon name="profile" :size="16" /><span>профиль</span>
            </RouterLink>
            <RouterLink to="/inventory" class="profile-menu-item" @click="profileMenuOpen = false">
              <AppIcon name="inventory" :size="16" /><span>инвентарь</span>
            </RouterLink>
            <RouterLink to="/saved" class="profile-menu-item" @click="profileMenuOpen = false">
              <AppIcon name="bookmark" :size="16" /><span>закладки</span>
            </RouterLink>
            <RouterLink
              v-if="auth.role === 'teacher' || auth.role === 'admin'"
              to="/invites"
              class="profile-menu-item"
              @click="profileMenuOpen = false"
            >
              <AppIcon name="invites" :size="16" /><span>инвайты</span>
            </RouterLink>
            <RouterLink to="/me/edit" class="profile-menu-item" @click="profileMenuOpen = false">
              <AppIcon name="settings" :size="16" /><span>настройки</span>
            </RouterLink>
            <span class="profile-menu-sep" />
            <button class="profile-menu-item profile-menu-btn" type="button" @click="logoutFromMenu">
              <AppIcon name="logout" :size="16" /><span>выход</span>
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
      <template v-if="navDrawerOpen">
        <div class="nav-drawer-backdrop" aria-hidden="true" @click="closeNavDrawer" />
        <aside
          id="nav-drawer"
          class="nav-drawer-panel card"
          role="dialog"
          aria-modal="true"
          aria-label="разделы"
          :style="{ top: drawerPanelPos.top, left: drawerPanelPos.left }"
          @click.stop
        >
          <nav class="nav-drawer-inner">
            <RouterLink to="/blogs" class="nav-drawer-link" @click="closeNavDrawer">блоги</RouterLink>
            <RouterLink to="/microblogs" class="nav-drawer-link" @click="closeNavDrawer">
              микроблоги
            </RouterLink>
            <RouterLink
              v-if="auth.token"
              to="/courses"
              class="nav-drawer-link"
              @click="closeNavDrawer"
            >
              курсы
            </RouterLink>
            <RouterLink
              v-if="auth.token"
              to="/library"
              class="nav-drawer-link"
              @click="closeNavDrawer"
            >
              библиотека
            </RouterLink>
            <RouterLink v-if="auth.token" to="/shop" class="nav-drawer-link" @click="closeNavDrawer">
              магазин
            </RouterLink>
            <RouterLink
              v-if="auth.role === 'teacher' || auth.role === 'admin'"
              to="/storage"
              class="nav-drawer-link"
              @click="closeNavDrawer"
            >
              хранилище
            </RouterLink>
            <RouterLink
              v-if="auth.role === 'admin'"
              to="/admin"
              class="nav-drawer-link"
              @click="closeNavDrawer"
            >
              админ
            </RouterLink>
          </nav>
        </aside>
      </template>
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

.nav-drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(0, 0, 0, 0.4);
}

.nav-drawer-panel {
  position: fixed;
  z-index: 91;
  margin: 0;
  min-width: 13rem;
  max-width: min(16rem, calc(100vw - 1rem));
  max-height: min(70vh, calc(100vh - 3.5rem));
  padding: 0.45rem 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  overflow-y: auto;
  border-radius: var(--radius);
}

.nav-drawer-inner {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
}

.nav-drawer-link {
  display: block;
  padding: 0.52rem 0.62rem;
  border-radius: 6px;
  color: var(--muted);
  text-transform: lowercase;
  font-size: 0.92rem;
  font-weight: 500;
  border: none;
  background: transparent;
}

.nav-drawer-link:hover {
  background: var(--surface2);
  color: var(--text);
  text-decoration: none;
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
  border-radius: 999px;
  min-height: 36px;
  width: 36px;
  height: 36px;
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text);
  transition: background 0.18s ease;
}

.profile-trigger:hover {
  background: var(--hover-surface);
}

.profile-trigger-avatar {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.68rem;
  font-weight: 600;
  background: #1a1a1a;
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
  width: 220px;
  padding: 0.35rem;
  z-index: 40;
}
@media (max-width: 640px) {
  .profile-menu {
    width: min(240px, calc(100vw - 1.2rem));
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
  font-size: 0.88rem;
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
  gap: 0.55rem;
  width: 100%;
  color: var(--muted);
  padding: 0.5rem 0.6rem;
  border-radius: 6px;
  border: none;
  background: transparent;
  text-align: left;
  text-transform: lowercase;
  font: inherit;
  font-size: 0.9rem;
  min-height: 0;
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
