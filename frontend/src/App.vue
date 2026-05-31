<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
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
const navDrawerOpen = ref(false);
const navEl = ref<HTMLElement | null>(null);
const navBurgerEl = ref<HTMLElement | null>(null);
const profileTriggerEl = ref<HTMLElement | null>(null);
const sheetMobile = ref(
  typeof window !== "undefined" ? window.innerWidth <= 640 : false,
);
const sheetGeom = ref({ top: 0, left: 0, width: 0 });
const SHEET_MOBILE_MAX = 640;
const DESKTOP_SHEET_WIDTH = 240;
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
  if (target?.closest?.(".profile-trigger")) return;
  if (profileMenuOpen.value) {
    if (target?.closest?.(".profile-menu-sheet")) return;
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

function isSheetMobile() {
  return typeof window !== "undefined" && window.innerWidth <= SHEET_MOBILE_MAX;
}

function resolveNavEl() {
  return navEl.value ?? document.querySelector<HTMLElement>(".nav");
}

function syncSheetLayout() {
  sheetMobile.value = isSheetMobile();
  const nav = resolveNavEl();
  if (!nav) return;
  const rect = nav.getBoundingClientRect();
  sheetGeom.value = {
    top: Math.round(rect.bottom),
    left: Math.round(rect.left),
    width: Math.round(rect.width),
  };
}

function onSheetBeforeEnter() {
  syncSheetLayout();
}

function onSheetLayoutChange() {
  if (navDrawerOpen.value || profileMenuOpen.value) syncSheetLayout();
}

function overlayStyle() {
  if (sheetMobile.value) return { top: "0" };
  return { top: `${sheetGeom.value.top}px` };
}

function clampSheetLeft(left: number, width: number, nav: HTMLElement | null) {
  if (!nav) return left;
  const navRect = nav.getBoundingClientRect();
  const minLeft = Math.round(navRect.left);
  const maxLeft = Math.round(navRect.right - width);
  return Math.max(minLeft, Math.min(left, maxLeft));
}

function desktopTriggerSheetStyle(
  trigger: HTMLElement | null,
  align: "left" | "right",
) {
  if (sheetMobile.value) return undefined;
  const top = sheetGeom.value.top;
  const width = DESKTOP_SHEET_WIDTH;
  const nav = resolveNavEl();
  if (trigger) {
    const triggerRect = trigger.getBoundingClientRect();
    const rawLeft =
      align === "right"
        ? Math.round(triggerRect.right - width)
        : Math.round(triggerRect.left);
    const left = clampSheetLeft(rawLeft, width, nav);
    return { top: `${top}px`, left: `${left}px`, width: `${width}px` };
  }
  const fallbackLeft =
    align === "right"
      ? sheetGeom.value.left + sheetGeom.value.width - width
      : sheetGeom.value.left;
  const left = clampSheetLeft(fallbackLeft, width, nav);
  return { top: `${top}px`, left: `${left}px`, width: `${width}px` };
}

function desktopNavSheetStyle() {
  return desktopTriggerSheetStyle(navBurgerEl.value, "left");
}

function desktopProfileSheetStyle() {
  return desktopTriggerSheetStyle(profileTriggerEl.value, "right");
}

function toggleNavDrawer() {
  if (navDrawerOpen.value) {
    navDrawerOpen.value = false;
    return;
  }
  profileMenuOpen.value = false;
  syncSheetLayout();
  navDrawerOpen.value = true;
  requestAnimationFrame(syncSheetLayout);
}

function closeNavDrawer() {
  navDrawerOpen.value = false;
}

function toggleProfileMenu() {
  if (profileMenuOpen.value) {
    profileMenuOpen.value = false;
    return;
  }
  closeNavDrawer();
  syncSheetLayout();
  profileMenuOpen.value = true;
  requestAnimationFrame(syncSheetLayout);
}

function closeProfileMenu() {
  profileMenuOpen.value = false;
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
  window.addEventListener("resize", onSheetLayoutChange);
  window.addEventListener("scroll", onSheetLayoutChange, true);
  await loadMePresentation();
  syncSheetLayout();
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
  window.removeEventListener("resize", onSheetLayoutChange);
  window.removeEventListener("scroll", onSheetLayoutChange, true);
  void flushActivity(true, false);
  stopActivityTracking();
  stopChatPoll();
});

watch(
  () => route.path,
  () => {
    closeNavDrawer();
    closeProfileMenu();
  },
);

watch([navDrawerOpen, profileMenuOpen], ([navOpen, profileOpen]) => {
  if (typeof document === "undefined") return;
  document.documentElement.style.overflow = navOpen || profileOpen ? "hidden" : "";
  if (navOpen || profileOpen) syncSheetLayout();
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
    <header ref="navEl" class="nav">
      <span v-if="routeNavPending" class="nav-route-loading muted" aria-live="polite">загрузка…</span>
      <div v-if="auth.token" class="nav-menu-anchor">
        <button
          ref="navBurgerEl"
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
        <div class="profile-menu-wrap">
          <button
            ref="profileTriggerEl"
            class="profile-trigger"
            type="button"
            :aria-expanded="profileMenuOpen"
            aria-label="меню профиля"
            @click.stop="toggleProfileMenu"
          >
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
        </div>
      </template>
      <template v-else>
        <RouterLink to="/login" class="nav-link"><span>вход</span></RouterLink>
        <RouterLink to="/register" class="nav-link"><span>регистрация</span></RouterLink>
      </template>
    </header>
    <Teleport to="body">
      <Transition name="nav-menu" @before-enter="onSheetBeforeEnter">
        <div
          v-if="navDrawerOpen"
          id="nav-drawer"
          class="nav-menu-root"
          :class="{ 'nav-menu-root--mobile': sheetMobile }"
          :style="overlayStyle()"
          @click="closeNavDrawer"
        >
          <div
            class="nav-menu-sheet"
            :style="desktopNavSheetStyle()"
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
    <Teleport to="body">
      <Transition name="nav-menu" @before-enter="onSheetBeforeEnter">
        <div
          v-if="profileMenuOpen && auth.token"
          class="nav-menu-root"
          :class="{ 'nav-menu-root--mobile': sheetMobile }"
          :style="overlayStyle()"
          @click="closeProfileMenu"
        >
          <div
            class="nav-menu-sheet profile-menu-sheet card"
            :style="desktopProfileSheetStyle()"
            role="dialog"
            aria-modal="true"
            aria-label="профиль"
            @click.stop
          >
            <span class="nav-menu-handle" aria-hidden="true" />
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
            <RouterLink :to="`/u/${auth.nickname}`" class="profile-menu-item" @click="closeProfileMenu">
              <AppIcon name="profile" :size="20" /><span>профиль</span>
            </RouterLink>
            <RouterLink to="/inventory" class="profile-menu-item" @click="closeProfileMenu">
              <AppIcon name="inventory" :size="20" /><span>инвентарь</span>
            </RouterLink>
            <RouterLink to="/saved" class="profile-menu-item" @click="closeProfileMenu">
              <AppIcon name="bookmark" :size="20" /><span>закладки</span>
            </RouterLink>
            <RouterLink
              v-if="auth.role === 'teacher' || auth.role === 'admin'"
              to="/invites"
              class="profile-menu-item"
              @click="closeProfileMenu"
            >
              <AppIcon name="invites" :size="20" /><span>инвайты</span>
            </RouterLink>
            <RouterLink to="/me/edit" class="profile-menu-item" @click="closeProfileMenu">
              <AppIcon name="settings" :size="20" /><span>настройки</span>
            </RouterLink>
            <span class="profile-menu-sep" />
            <button class="profile-menu-item profile-menu-btn" type="button" @click="logoutFromMenu">
              <AppIcon name="logout" :size="20" /><span>выход</span>
            </button>
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
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 90;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}

.nav-menu-root--mobile {
  top: 0;
  align-items: flex-end;
}

.nav-menu-sheet {
  width: 100%;
  max-width: 640px;
  margin: 0;
  padding: 0.5rem 0.85rem 0.85rem;
  border-top: none;
  border-radius: 0 0 var(--radius) var(--radius);
  max-height: min(72vh, 28rem);
  background: var(--surface);
  border: 1px solid var(--border);
  overflow-y: auto;
  transform-origin: top center;
}

.nav-menu-root:not(.nav-menu-root--mobile) .nav-menu-sheet {
  position: fixed;
  margin: 0;
  padding: 0.35rem;
  border: 1px solid var(--border);
  border-radius: 0 0 var(--radius) var(--radius);
  background: var(--bg);
  z-index: 91;
}

.nav-menu-root:not(.nav-menu-root--mobile) .nav-menu-sheet:not(.profile-menu-sheet) {
  transform-origin: top left;
}

.nav-menu-root:not(.nav-menu-root--mobile) .profile-menu-sheet {
  transform-origin: top right;
  padding: 0.35rem 0.35rem 0.5rem;
}

.nav-menu-root--mobile .nav-menu-sheet {
  padding: 0.5rem 0.85rem calc(0.85rem + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--border);
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
  border-bottom: none;
  border-radius: var(--radius) var(--radius) 0 0;
  transform-origin: bottom center;
}

.profile-menu-sheet {
  padding-bottom: 1rem;
}

.nav-menu-root--mobile .profile-menu-sheet {
  padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
}

.nav-menu-handle {
  display: none;
  width: 2.25rem;
  height: 3px;
  margin: 0.35rem auto 0.65rem;
  border-radius: 999px;
  background: var(--border);
}

.nav-menu-root--mobile .nav-menu-handle {
  display: block;
}

.nav-menu-inner {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.nav-menu-link {
  display: block;
  width: 100%;
  min-height: 52px;
  padding: 0.9rem 0.75rem;
  color: var(--text);
  text-transform: lowercase;
  font-size: 1.05rem;
  font-weight: 500;
  line-height: 1.35;
  border: none;
  border-radius: 0;
  background: transparent;
  text-align: center;
}

.nav-menu-link:hover {
  background: var(--surface2);
  color: var(--text);
  text-decoration: none;
}

.nav-menu-root:not(.nav-menu-root--mobile) .nav-menu-link {
  min-height: 40px;
  padding: 0.45rem 0.45rem;
  font-size: 0.95rem;
  text-align: left;
  border-radius: 6px;
}

.nav-menu-enter-active .nav-menu-sheet,
.nav-menu-leave-active .nav-menu-sheet {
  transition: transform 0.24s ease, opacity 0.18s ease;
}

.nav-menu-enter-active.nav-menu-root,
.nav-menu-leave-active.nav-menu-root {
  transition: background 0.2s ease;
}

.nav-menu-enter-from:not(.nav-menu-root--mobile) .nav-menu-sheet:not(.profile-menu-sheet),
.nav-menu-leave-to:not(.nav-menu-root--mobile) .nav-menu-sheet:not(.profile-menu-sheet) {
  transform: scaleY(0);
  transform-origin: top left;
}

.nav-menu-enter-from:not(.nav-menu-root--mobile) .profile-menu-sheet,
.nav-menu-leave-to:not(.nav-menu-root--mobile) .profile-menu-sheet {
  transform: scaleY(0);
  transform-origin: top right;
}

.nav-menu-root--mobile.nav-menu-enter-from .nav-menu-sheet,
.nav-menu-root--mobile.nav-menu-leave-to .nav-menu-sheet {
  transform: translateY(100%);
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

.profile-menu-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.65rem;
  padding: 0.35rem 0.45rem 0.45rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 0.15rem;
}

.nav-menu-root--mobile .profile-menu-head {
  padding: 0.2rem 0.85rem 0.65rem;
  margin-bottom: 0.35rem;
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
  gap: 0.65rem;
  width: 100%;
  color: var(--text);
  padding: 0.45rem 0.45rem;
  border-radius: 6px;
  border: none;
  background: transparent;
  text-align: left;
  text-transform: lowercase;
  font: inherit;
  font-size: 0.95rem;
  line-height: 1.35;
  min-height: 40px;
  cursor: pointer;
}

.nav-menu-root--mobile .profile-menu-item {
  padding: 0.65rem 0.85rem;
  min-height: 48px;
}

@media (max-width: 640px) {
  .nav-actions {
    gap: 0.2rem;
  }
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
