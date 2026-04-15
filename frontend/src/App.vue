<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, RouterView } from "vue-router";
import { api } from "./api/http";
import { useAuthStore } from "./stores/auth";
import AppIcon from "./components/AppIcon.vue";
import { applyUserPreferences } from "./utils/preferences";

const auth = useAuthStore();
const isOnline = ref(typeof navigator !== "undefined" ? navigator.onLine : true);
const profileMenuOpen = ref(false);
const profileMenuRoot = ref<HTMLElement | null>(null);
const currentTheme = ref<"black" | "graphite" | "contrast">("black");
const profileAvatarUrl = ref("");
const profileAvatarBroken = ref(false);
const initials = computed(() => (auth.nickname || "U").slice(0, 2).toUpperCase());
let activityTickStart = Date.now();
let activityInterval: ReturnType<typeof setInterval> | null = null;

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

function refreshPage() {
  window.location.reload();
}

function toggleProfileMenu() {
  profileMenuOpen.value = !profileMenuOpen.value;
}

async function setTheme(theme: "black" | "graphite" | "contrast") {
  currentTheme.value = theme;
  applyUserPreferences({ theme_preference: theme });
  if (!auth.token) return;
  try {
    await api("/api/me", {
      method: "PATCH",
      token: auth.token,
      body: JSON.stringify({ theme_preference: theme }),
    });
  } catch {
    // keep local theme even if save fails
  }
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
    if (me.theme_preference === "black" || me.theme_preference === "graphite" || me.theme_preference === "contrast") {
      currentTheme.value = me.theme_preference;
    }
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
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("click", onDocumentClick);
  await loadMePresentation();
  startActivityTracking();
});

onUnmounted(() => {
  window.removeEventListener("online", syncOnlineStatus);
  window.removeEventListener("offline", syncOnlineStatus);
  window.removeEventListener("keydown", onEscape);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  document.removeEventListener("click", onDocumentClick);
  void flushActivity(true);
  stopActivityTracking();
});

watch(
  () => auth.token,
  async () => {
    await loadMePresentation();
    startActivityTracking();
  },
);
</script>

<template>
  <div class="layout">
    <header class="nav">
      <RouterLink to="/" class="nav-link"><AppIcon name="home" /> <span>enoobis.ru</span></RouterLink>
      <RouterLink to="/blog" class="nav-link"><AppIcon name="blog" /> <span>Блог</span></RouterLink>
      <RouterLink v-if="auth.token" to="/courses" class="nav-link"><AppIcon name="courses" /> <span>Курсы</span></RouterLink>
      <RouterLink v-if="auth.token" to="/invites" class="nav-link"><AppIcon name="invites" /> <span>Инвайты</span></RouterLink>
      <RouterLink v-if="auth.token && auth.role === 'admin'" to="/admin" class="nav-link">
        <AppIcon name="admin" />
        <span>Админ</span>
      </RouterLink>
      <span class="nav-spacer" />
      <template v-if="auth.token">
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
            <AppIcon name="menu" />
          </button>
          <div v-if="profileMenuOpen" class="profile-menu card">
            <RouterLink :to="`/u/${auth.nickname}`" class="profile-menu-item" @click="profileMenuOpen = false">
              <span>View profile</span>
              <AppIcon name="profile" />
            </RouterLink>
            <RouterLink to="/me/edit" class="profile-menu-item" @click="profileMenuOpen = false">
              <span>Settings</span>
              <AppIcon name="settings" />
            </RouterLink>
            <a href="https://github.com/enoobis" class="profile-menu-item" target="_blank" rel="noopener noreferrer">
              <span>Contact us</span>
              <AppIcon name="comment" />
            </a>
            <RouterLink to="/invites" class="profile-menu-item" @click="profileMenuOpen = false">
              <span>Invites</span>
              <AppIcon name="invites" />
            </RouterLink>
            <button class="profile-menu-item profile-menu-btn" type="button" @click="logoutFromMenu">
              <span>Logout</span>
              <AppIcon name="logout" />
            </button>
            <div class="profile-menu-theme">
              <span>Theme</span>
              <div class="theme-switch">
                <button
                  type="button"
                  :class="{ active: currentTheme === 'graphite' }"
                  @click="setTheme('graphite')"
                >
                  <AppIcon name="sun" />
                </button>
                <button
                  type="button"
                  :class="{ active: currentTheme === 'black' }"
                  @click="setTheme('black')"
                >
                  <AppIcon name="moon" />
                </button>
                <button
                  type="button"
                  :class="{ active: currentTheme === 'contrast' }"
                  @click="setTheme('contrast')"
                >
                  <AppIcon name="contrast" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>
      <template v-else>
        <RouterLink to="/login" class="nav-link"><AppIcon name="login" /> <span>Вход</span></RouterLink>
        <RouterLink to="/register" class="nav-link"><AppIcon name="register" /> <span>Регистрация</span></RouterLink>
      </template>
    </header>
    <RouterView v-slot="{ Component, route }">
      <Transition name="page" mode="out-in">
        <component :is="Component" :key="route.fullPath" />
      </Transition>
    </RouterView>
    <div v-if="!isOnline" class="offline-overlay" role="status" aria-live="polite">
      <div class="offline-card">
        <h2>You’re offline!</h2>
        <p>Check your connection and refresh to access enoobis.ru</p>
        <button type="button" @click="refreshPage">Refresh</button>
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

.profile-trigger {
  border-radius: 999px;
  min-height: 44px;
  padding: 0.2rem 0.5rem 0.2rem 0.25rem;
  background: #101010;
  border-color: #2f2f2f;
  color: var(--text);
}

.profile-trigger-avatar {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: 1px solid #3a3a3a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 700;
  background: #070707;
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
  top: calc(100% + 0.45rem);
  width: min(320px, calc(100vw - 1.5rem));
  border-radius: 18px;
  padding: 0.8rem;
  z-index: 40;
}

.profile-menu-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.8rem;
  width: 100%;
  color: var(--text);
  padding: 0.9rem 0.7rem;
  border-radius: 10px;
  border: 1px solid transparent;
}

.profile-menu-item:hover {
  background: var(--surface2);
  border-color: var(--border);
  text-decoration: none;
}

.profile-menu-btn {
  background: transparent;
  color: var(--text);
  font: inherit;
  min-height: 0;
}

.profile-menu-theme {
  border-top: 1px solid var(--border);
  margin-top: 0.3rem;
  padding: 0.95rem 0.7rem 0.3rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.theme-switch {
  background: #0a0a0a;
  border: 1px solid var(--border);
  border-radius: 999px;
  display: inline-flex;
  gap: 0.2rem;
  padding: 0.15rem;
}

.theme-switch button {
  min-height: 0;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  padding: 0;
  background: transparent;
  color: var(--muted);
  border-color: transparent;
}

.theme-switch button.active {
  background: #2a2a2a;
  color: #f5f5f5;
  border-color: #444;
}
</style>
