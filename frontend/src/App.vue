<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { api } from "./api/http";
import { useAuthStore } from "./stores/auth";
import { useChatStore } from "./stores/chat";
import AppIcon from "./components/AppIcon.vue";
import AppToast from "./components/AppToast.vue";
import { applyUserPreferences } from "./utils/preferences";

const router = useRouter();
const route = useRoute();

const auth = useAuthStore();

const onHome = computed(() => route.path === "/");
const onBlogs = computed(() => route.path === "/blogs" || route.path.startsWith("/blogs/"));
const onMicroblogs = computed(() => route.path === "/microblogs" || route.path.startsWith("/microblogs/"));
const onCourses = computed(() => route.path === "/courses" || route.path.startsWith("/courses/"));
const onLibrary = computed(() => route.path === "/library" || route.path.startsWith("/library/"));
const onAdminNav = computed(() => route.path === "/admin" || route.path.startsWith("/admin/"));
const chatStore = useChatStore();
const isOnline = ref(typeof navigator !== "undefined" ? navigator.onLine : true);
const profileMenuOpen = ref(false);
const profileMenuRoot = ref<HTMLElement | null>(null);
const profileAvatarUrl = ref("");
const profileAvatarBroken = ref(false);
const initials = computed(() => (auth.nickname || "U").slice(0, 2).toUpperCase());
const chatBadge = computed(() => (chatStore.unread > 9 ? "9+" : String(chatStore.unread)));
let activityTickStart = Date.now();
let activityInterval: ReturnType<typeof setInterval> | null = null;
let chatPollInterval: ReturnType<typeof setInterval> | null = null;

function syncOnlineStatus() {
  isOnline.value = navigator.onLine;
}

function onDocumentClick(event: MouseEvent) {
  if (!profileMenuOpen.value) return;
  const root = profileMenuRoot.value;
  if (!root) return;
  const target = event.target as Node | null;
  if (!target || root.contains(target)) return;
  profileMenuOpen.value = false;
}

function onEscape(event: KeyboardEvent) {
  if (event.key === "Escape") {
    profileMenuOpen.value = false;
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

function toggleProfileMenu() {
  profileMenuOpen.value = !profileMenuOpen.value;
}

function logoutFromMenu() {
  profileMenuOpen.value = false;
  profileAvatarUrl.value = "";
  profileAvatarBroken.value = false;
  stopActivityTracking();
  auth.logout();
}

async function loadMePresentation() {
  if (!auth.token) {
    profileAvatarUrl.value = "";
    profileAvatarBroken.value = false;
    return;
  }
  try {
    const me = await api<{
      theme_preference: string;
      language_preference: string;
      font_preference: string;
      avatar_url: string;
    }>("/api/me", { token: auth.token });
    profileAvatarUrl.value = me.avatar_url || "";
    profileAvatarBroken.value = false;
    applyUserPreferences(me);
  } catch {
    // ignore preference/profile load failures
  }
}

async function flushActivity(force = false) {
  if (!auth.token) return;
  const now = Date.now();
  const elapsed = Math.floor((now - activityTickStart) / 1000);
  if (!force && elapsed < 15) return;
  activityTickStart = now;
  if (elapsed <= 0) return;
  try {
    await api("/api/me/activity", {
      method: "POST",
      token: auth.token,
      body: JSON.stringify({ seconds: Math.min(elapsed, 600) }),
    });
  } catch {
    // ignore tracking errors
  }
}

function startActivityTracking() {
  stopActivityTracking();
  activityTickStart = Date.now();
  if (!auth.token) return;
  activityInterval = setInterval(() => {
    void flushActivity(false);
  }, 60000);
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
    void flushActivity(true);
  } else {
    activityTickStart = Date.now();
  }
}

onMounted(async () => {
  window.addEventListener("online", syncOnlineStatus);
  window.addEventListener("offline", syncOnlineStatus);
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
  window.removeEventListener("online", syncOnlineStatus);
  window.removeEventListener("offline", syncOnlineStatus);
  window.removeEventListener("keydown", onEscape);
  window.removeEventListener("keydown", onGlobalKey);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  document.removeEventListener("click", onDocumentClick);
  void flushActivity(true);
  stopActivityTracking();
  stopChatPoll();
});

watch(
  () => auth.token,
  async () => {
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
      <RouterLink v-if="!onHome" to="/" class="nav-link brand-link">
        <span>enoobis</span>
      </RouterLink>
      <RouterLink v-if="!onBlogs" to="/blogs" class="nav-link"><span>блоги</span></RouterLink>
      <RouterLink v-if="!onMicroblogs" to="/microblogs" class="nav-link"><span>микроблоги</span></RouterLink>
      <RouterLink v-if="auth.token && !onCourses" to="/courses" class="nav-link desktop-only">
        <span>курсы</span>
      </RouterLink>
      <RouterLink v-if="auth.token && !onLibrary" to="/library" class="nav-link desktop-only">
        <span>библиотека</span>
      </RouterLink>
      <RouterLink
        v-if="auth.token && auth.role === 'admin' && !onAdminNav"
        to="/admin"
        class="nav-link desktop-only"
      >
        <span>админ</span>
      </RouterLink>
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
              <span class="profile-menu-name">@{{ auth.nickname }}</span>
              <span v-if="auth.role" class="profile-menu-role muted">{{ auth.role }}</span>
            </div>
            <RouterLink :to="`/u/${auth.nickname}`" class="profile-menu-item" @click="profileMenuOpen = false">
              <AppIcon name="profile" :size="16" /><span>профиль</span>
            </RouterLink>
            <RouterLink to="/blogs?mode=bookmarks" class="profile-menu-item" @click="profileMenuOpen = false">
              <AppIcon name="bookmark" :size="16" /><span>закладки блогов</span>
            </RouterLink>
            <RouterLink to="/microblogs/saved" class="profile-menu-item" @click="profileMenuOpen = false">
              <AppIcon name="bookmark" :size="16" /><span>закладки микро</span>
            </RouterLink>
            <RouterLink
              v-if="auth.role === 'teacher' || auth.role === 'admin'"
              to="/storage"
              class="profile-menu-item desktop-only"
              @click="profileMenuOpen = false"
            >
              <AppIcon name="folder" :size="16" /><span>хранилище</span>
            </RouterLink>
            <RouterLink
              v-if="auth.role === 'teacher' || auth.role === 'admin'"
              to="/invites"
              class="profile-menu-item"
              @click="profileMenuOpen = false"
            >
              <AppIcon name="invites" :size="16" /><span>инвайты</span>
            </RouterLink>
            <RouterLink
              v-if="auth.role === 'admin'"
              to="/admin"
              class="profile-menu-item desktop-only"
              @click="profileMenuOpen = false"
            >
              <AppIcon name="admin" :size="16" /><span>админ</span>
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
  background: #181818;
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
  align-items: baseline;
  gap: 0.4rem;
  padding: 0.45rem 0.6rem 0.55rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 0.25rem;
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
