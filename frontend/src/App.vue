<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { AnimatePresence, MotionConfig, motion } from "motion-v";
import {
  pageActive,
  pageEnter,
  pageExit,
  springSoft,
} from "./utils/motionPresets";
import { syncLiteMotion, useLiteMotion } from "./utils/reducedMotion";
import { useAuthStore } from "./stores/auth";
import { useChatStore } from "./stores/chat";
import { useReaderStore } from "./stores/reader";
import { useSessionStore } from "./stores/session";
import AppIcon from "./components/AppIcon.vue";
import AppToast from "./components/AppToast.vue";
import MotionCoinCount from "./components/MotionCoinCount.vue";
import SearchPanel from "./components/SearchPanel.vue";
import NavExpandSearch from "./components/NavExpandSearch.vue";

const router = useRouter();
const route = useRoute();
const onHome = computed(() => route.path === "/");
const motionLite = useLiteMotion();

const auth = useAuthStore();
const chatStore = useChatStore();
const reader = useReaderStore();
const session = useSessionStore();
const isOnline = ref(typeof navigator !== "undefined" ? navigator.onLine : true);
const profileMenuOpen = ref(false);
const navDrawerOpen = ref(false);
const searchOpen = ref(false);
const searchQuery = ref("");
const navEl = ref<HTMLElement | null>(null);

const navProgress = ref(0);
const navProgressOn = ref(false);
const navProgressDone = ref(false);
let navTrickleTimer: ReturnType<typeof setInterval> | null = null;
let navDoneTimer: ReturnType<typeof setTimeout> | null = null;

function startNavProgress() {
  if (navDoneTimer) {
    clearTimeout(navDoneTimer);
    navDoneTimer = null;
  }
  navProgressDone.value = false;
  navProgressOn.value = true;
  navProgress.value = 12;
  if (navTrickleTimer) clearInterval(navTrickleTimer);
  navTrickleTimer = setInterval(() => {
    const remaining = 90 - navProgress.value;
    if (remaining <= 0.5) return;
    navProgress.value += Math.max(0.5, remaining * 0.08);
  }, 180);
}

function finishNavProgress() {
  if (navTrickleTimer) {
    clearInterval(navTrickleTimer);
    navTrickleTimer = null;
  }
  if (!navProgressOn.value) return;
  navProgress.value = 100;
  navProgressDone.value = true;
  navDoneTimer = setTimeout(() => {
    navProgressOn.value = false;
    navProgressDone.value = false;
    navProgress.value = 0;
  }, 360);
}
const sheetMobile = ref(
  typeof window !== "undefined" ? window.innerWidth <= 640 : false,
);
const sheetGeom = ref({ top: 0, left: 0, width: 0 });
const SHEET_MOBILE_MAX = 640;
const profileCoins = computed(() => session.coins);
const headerSheetOpen = computed(
  () => navDrawerOpen.value || profileMenuOpen.value || searchOpen.value,
);
const navFullSheetOpen = computed(() => headerSheetOpen.value && !sheetMobile.value);
const initials = computed(() => (auth.nickname || "U").slice(0, 2).toUpperCase());
const chatBadge = computed(() => (chatStore.unread > 9 ? "9+" : String(chatStore.unread)));
const mobileSearchTo = computed(() => {
  if (route.path.startsWith("/blogs")) {
    return { path: "/search", query: { ...route.query, scope: "blog" } };
  }
  if (route.path.startsWith("/microblogs")) {
    return { path: "/search", query: { ...route.query, scope: "micro" } };
  }
  if (route.path.startsWith("/library")) {
    return { path: "/search", query: { ...route.query, scope: "library" } };
  }
  if (route.path.startsWith("/courses")) {
    return { path: "/search", query: { ...route.query, scope: "courses" } };
  }
  return { path: "/search" };
});
const searchPlaceholder = computed(() => {
  if (route.path.startsWith("/blogs")) return "поиск в блогах";
  if (route.path.startsWith("/microblogs")) return "поиск в микроблогах";
  if (route.path.startsWith("/library")) return "поиск книги";
  if (route.path.startsWith("/courses")) return "поиск курса";
  return "поиск";
});

function syncOnlineStatus() {
  isOnline.value = navigator.onLine;
}

function onDocumentClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest?.(".nav-burger")) return;
  if (target?.closest?.(".profile-trigger")) return;
  if (target?.closest?.(".nav-search-trigger")) return;
  if (profileMenuOpen.value) {
    if (target?.closest?.(".profile-menu-sheet")) return;
    profileMenuOpen.value = false;
  }
  if (navDrawerOpen.value) {
    if (target?.closest?.(".nav-menu-sheet")) return;
    navDrawerOpen.value = false;
  }
  if (searchOpen.value) {
    if (target?.closest?.(".search-menu-sheet")) return;
    if (target?.closest?.(".nav-search-expand")) return;
    searchOpen.value = false;
  }
}

function closeHeaderSheets() {
  navDrawerOpen.value = false;
  profileMenuOpen.value = false;
  searchOpen.value = false;
}

function onEscape(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  if (searchOpen.value) return;
  profileMenuOpen.value = false;
  navDrawerOpen.value = false;
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
    if (isSheetMobile()) {
      router.push(mobileSearchTo.value);
    } else {
      toggleSearch();
    }
    return;
  }
  if (event.key === "/" && !isTypingTarget(event.target)) {
    event.preventDefault();
    if (isSheetMobile()) {
      router.push(mobileSearchTo.value);
    } else {
      toggleSearch();
    }
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

function syncReaderTop() {
  const nav = resolveNavEl();
  const h = nav ? Math.round(nav.getBoundingClientRect().height) : 52;
  document.documentElement.style.setProperty("--reader-top", `${h}px`);
}

function syncSheetLayout() {
  sheetMobile.value = isSheetMobile();
  syncLiteMotion();
  const nav = resolveNavEl();
  if (!nav) return;
  syncReaderTop();
  const rect = nav.getBoundingClientRect();
  sheetGeom.value = {
    top: Math.round(rect.bottom),
    left: Math.round(rect.left),
    width: Math.round(rect.width),
  };
}

function lockPageScroll() {
  if (typeof document === "undefined" || !sheetMobile.value) return;
  const root = document.documentElement;
  root.style.overflow = "hidden";
}

function unlockPageScroll() {
  if (typeof document === "undefined") return;
  document.documentElement.style.overflow = "";
  document.documentElement.style.paddingRight = "";
}

function prepareSheetOpen() {
  lockPageScroll();
  syncSheetLayout();
}

function onSheetBeforeEnter() {
  syncSheetLayout();
}

function onSheetLayoutChange() {
  syncReaderTop();
  if (headerSheetOpen.value) syncSheetLayout();
}

function closeSearch() {
  searchOpen.value = false;
}

function toggleSearch() {
  if (searchOpen.value) {
    searchOpen.value = false;
    return;
  }
  searchQuery.value = typeof route.query.q === "string" ? route.query.q : "";
  searchOpen.value = true;
}

function overlayStyle() {
  if (sheetMobile.value) return { top: "0" };
  return { top: `${sheetGeom.value.top}px` };
}

function toggleNavDrawer() {
  if (navDrawerOpen.value) {
    navDrawerOpen.value = false;
    return;
  }
  profileMenuOpen.value = false;
  searchOpen.value = false;
  prepareSheetOpen();
  navDrawerOpen.value = true;
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
  closeSearch();
  prepareSheetOpen();
  profileMenuOpen.value = true;
}

function closeProfileMenu() {
  profileMenuOpen.value = false;
}

function logoutFromMenu() {
  profileMenuOpen.value = false;
  auth.logout();
}

function onProfileAvatarError() {
  void session.onAvatarError();
}

function onProfileCosmeticsUpdated() {
  void session.ensureMe(true);
}

function onVisibilityChange() {
  session.onVisibilityChange();
}

function syncShell() {
  if (auth.token) void session.startShell();
  else {
    chatStore.reset();
    session.stopShell();
  }
}

onMounted(() => {
  window.addEventListener("enoobis:profile-cosmetics-updated", onProfileCosmeticsUpdated);
  window.addEventListener("enoobis:nav-start", startNavProgress);
  window.addEventListener("enoobis:nav-done", finishNavProgress);
  window.addEventListener("online", syncOnlineStatus);
  window.addEventListener("offline", syncOnlineStatus);
  window.addEventListener("keydown", onEscape);
  window.addEventListener("keydown", onGlobalKey);
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("click", onDocumentClick);
  window.addEventListener("resize", onSheetLayoutChange);
  window.addEventListener("scroll", onSheetLayoutChange, true);
  syncSheetLayout();
  syncReaderTop();
  syncShell();
});

onUnmounted(() => {
  window.removeEventListener("enoobis:profile-cosmetics-updated", onProfileCosmeticsUpdated);
  window.removeEventListener("enoobis:nav-start", startNavProgress);
  window.removeEventListener("enoobis:nav-done", finishNavProgress);
  window.removeEventListener("online", syncOnlineStatus);
  window.removeEventListener("offline", syncOnlineStatus);
  window.removeEventListener("keydown", onEscape);
  window.removeEventListener("keydown", onGlobalKey);
  unlockPageScroll();
  document.removeEventListener("visibilitychange", onVisibilityChange);
  document.removeEventListener("click", onDocumentClick);
  window.removeEventListener("resize", onSheetLayoutChange);
  window.removeEventListener("scroll", onSheetLayoutChange, true);
  if (navTrickleTimer) clearInterval(navTrickleTimer);
  if (navDoneTimer) clearTimeout(navDoneTimer);
  session.stopShell();
});

watch(searchOpen, (open) => {
  if (!open) return;
  closeNavDrawer();
  closeProfileMenu();
  prepareSheetOpen();
});

watch(
  () => route.path,
  () => {
    closeNavDrawer();
    closeProfileMenu();
    closeSearch();
  },
);

watch(headerSheetOpen, async (open) => {
  if (!open) unlockPageScroll();
  await nextTick();
  syncSheetLayout();
});

watch(
  () => auth.token,
  () => {
    if (!auth.token) closeNavDrawer();
    syncShell();
  },
);

watch(
  () => reader.active,
  async (open) => {
    if (open) closeHeaderSheets();
    await nextTick();
    syncReaderTop();
  },
);
</script>

<template>
  <MotionConfig reduced-motion="user">
  <div class="layout">
    <header ref="navEl" class="nav" :class="{ 'nav--sheet-open': navFullSheetOpen }">
      <div class="nav-bar">
      <div v-if="auth.token" class="nav-menu-anchor">
        <button
          v-if="reader.active"
          type="button"
          class="icon-btn"
          aria-label="закрыть книгу"
          @click.stop="reader.close()"
        >
          <AppIcon name="back" :size="20" />
        </button>
        <button
          v-else
          type="button"
          class="icon-btn nav-burger"
          :aria-expanded="navDrawerOpen"
          aria-controls="nav-drawer"
          aria-label="меню"
          @click.stop="toggleNavDrawer"
        >
          <AppIcon name="menu" :size="20" />
        </button>
      </div>
      <RouterLink v-if="onHome && !reader.active" to="/" class="nav-link brand-link" aria-label="enoobis">
        <img src="/logo.png" alt="" class="brand-logo" width="28" height="28" decoding="async" />
      </RouterLink>
      <template v-if="!auth.token && !reader.active">
        <RouterLink to="/blogs" class="nav-link"><span>блоги</span></RouterLink>
        <RouterLink to="/microblogs" class="nav-link"><span>микроблоги</span></RouterLink>
      </template>
      <div v-if="reader.active" class="nav-reader-center">
        <span class="nav-reader-title">{{ reader.title }}</span>
      </div>
      <div v-else class="nav-spacer" />
      <template v-if="auth.token">
        <div v-if="reader.active" class="nav-reader-controls">
          <span v-if="reader.pageCount > 0" class="nav-reader-page">
            {{ reader.page }} / {{ reader.pageCount }}
          </span>
          <button type="button" class="icon-btn" aria-label="уменьшить" @click.stop="reader.zoomOut()">
            <span class="nav-zoom-glyph">−</span>
          </button>
          <button type="button" class="icon-btn" aria-label="увеличить" @click.stop="reader.zoomIn()">
            <span class="nav-zoom-glyph">+</span>
          </button>
        </div>
        <div v-else class="nav-actions">
          <NavExpandSearch
            v-if="!sheetMobile"
            v-model:open="searchOpen"
            v-model:query="searchQuery"
            :placeholder="searchPlaceholder"
          />
          <RouterLink
            v-else
            :to="mobileSearchTo"
            class="icon-btn nav-search-trigger"
            aria-label="поиск"
            title="поиск"
          >
            <AppIcon name="search" :size="20" />
          </RouterLink>
          <RouterLink
            to="/leaderboard"
            class="icon-btn"
            aria-label="лидерборд"
            title="лидерборд"
          >
            <AppIcon name="leaderboard" :size="20" />
          </RouterLink>
          <RouterLink to="/chats" class="icon-btn chat-btn" aria-label="чаты" title="чаты">
            <AppIcon name="chat" :size="20" />
            <span v-if="chatStore.unread > 0" class="chat-badge">{{ chatBadge }}</span>
          </RouterLink>
          <RouterLink
            v-if="auth.canBlogAndStorage"
            to="/storage"
            class="icon-btn"
            aria-label="хранилище"
            title="хранилище"
          >
            <AppIcon name="folder" :size="20" />
          </RouterLink>
          <RouterLink
            v-if="auth.canBlogAndStorage"
            to="/blogs/write"
            class="icon-btn desktop-only"
            aria-label="написать"
            title="написать"
          >
            <AppIcon name="write" :size="20" />
          </RouterLink>
        </div>
        <div class="profile-menu-wrap">
          <button
            class="profile-trigger"
            type="button"
            :aria-expanded="profileMenuOpen"
            aria-label="меню профиля"
            @click.stop="toggleProfileMenu"
          >
            <span class="profile-trigger-avatar">
              <img
                v-if="session.avatarUrl && !session.avatarBroken"
                :src="session.avatarUrl"
                alt=""
                class="profile-trigger-avatar-img"
                width="44"
                height="44"
                decoding="async"
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
      </div>
      <Transition name="nav-drawer">
        <div
          v-if="navDrawerOpen && !sheetMobile"
          id="nav-drawer"
          class="nav-dropdown nav-drawer-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="разделы"
        >
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
              v-if="auth.isPanelStaff"
              to="/admin"
              class="nav-menu-link"
              @click="closeNavDrawer"
            >
              {{ auth.isModerator ? "модерация" : "админ" }}
            </RouterLink>
          </nav>
        </div>
      </Transition>
      <Transition name="nav-sheet">
        <div
          v-if="profileMenuOpen && auth.token && !sheetMobile"
          class="nav-dropdown profile-menu-sheet card"
          role="dialog"
          aria-modal="true"
          aria-label="профиль"
        >
          <div class="profile-menu-head">
            <div class="profile-menu-head-main">
              <span class="profile-menu-name">@{{ auth.nickname }}</span>
            </div>
            <div class="profile-menu-head-actions">
              <div class="profile-menu-coins" title="монеты">
                <img
                  src="/coin-gem.png"
                  alt=""
                  width="18"
                  height="18"
                  class="profile-coin-img"
                  loading="lazy"
                />
                <span><MotionCoinCount :value="profileCoins" /></span>
              </div>
            </div>
          </div>
          <RouterLink :to="`/u/${auth.nickname}`" class="profile-menu-item" @click="closeProfileMenu">
            <AppIcon name="profile" :size="22" /><span>профиль</span>
          </RouterLink>
          <RouterLink to="/inventory" class="profile-menu-item" @click="closeProfileMenu">
            <AppIcon name="inventory" :size="22" /><span>инвентарь</span>
          </RouterLink>
          <RouterLink to="/saved" class="profile-menu-item" @click="closeProfileMenu">
            <AppIcon name="bookmark" :size="22" /><span>закладки</span>
          </RouterLink>
          <RouterLink
            v-if="auth.isStaff"
            to="/invites"
            class="profile-menu-item"
            @click="closeProfileMenu"
          >
            <AppIcon name="invites" :size="22" /><span>инвайты</span>
          </RouterLink>
          <RouterLink to="/me/edit" class="profile-menu-item" @click="closeProfileMenu">
            <AppIcon name="settings" :size="22" /><span>настройки</span>
          </RouterLink>
          <RouterLink
            v-if="auth.role === 'master' || auth.role === 'admin'"
            to="/work"
            class="profile-menu-item"
            @click="closeProfileMenu"
          >
            <AppIcon name="briefcase" :size="22" /><span>работа</span>
          </RouterLink>
          <span class="profile-menu-sep" />
          <div class="profile-menu-footer">
            <button class="profile-menu-footer-btn" type="button" @click="logoutFromMenu">
              <AppIcon name="logout" :size="22" /><span>выход</span>
            </button>
            <RouterLink to="/auth/qr" class="profile-menu-footer-btn" @click="closeProfileMenu">
              <AppIcon name="qr" :size="22" /><span>вход по qr</span>
            </RouterLink>
          </div>
        </div>
      </Transition>
      <Transition name="nav-sheet">
        <div
          v-if="searchOpen && auth.token && !sheetMobile"
          class="nav-dropdown search-menu-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="поиск"
        >
          <SearchPanel
            embedded
            :query="searchQuery"
            @update:query="searchQuery = $event"
            @close="closeSearch"
          />
        </div>
      </Transition>
    </header>
    <Teleport to="body">
      <Transition name="nav-menu">
        <div
          v-if="headerSheetOpen && !sheetMobile"
          class="nav-menu-root nav-menu-root--backdrop"
          :style="overlayStyle()"
          @click="closeHeaderSheets"
        />
      </Transition>
    </Teleport>
    <Teleport to="body">
      <Transition name="nav-menu" @before-enter="onSheetBeforeEnter">
        <div
          v-if="navDrawerOpen && sheetMobile"
          id="nav-drawer-mobile"
          class="nav-menu-root nav-menu-root--mobile"
          @click="closeNavDrawer"
        >
          <div
            class="nav-menu-sheet nav-menu-sheet--full"
            role="dialog"
            aria-modal="true"
            aria-label="разделы"
            @click.stop
          >
            <span class="nav-menu-handle" aria-hidden="true" />
            <div class="nav-menu-sheet-body">
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
                  v-if="auth.isPanelStaff"
                  to="/admin"
                  class="nav-menu-link"
                  @click="closeNavDrawer"
                >
                  {{ auth.isModerator ? "модерация" : "админ" }}
                </RouterLink>
              </nav>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
    <Teleport to="body">
      <Transition name="nav-menu" @before-enter="onSheetBeforeEnter">
        <div
          v-if="profileMenuOpen && auth.token && sheetMobile"
          class="nav-menu-root nav-menu-root--mobile"
          @click="closeProfileMenu"
        >
          <div
            class="nav-menu-sheet profile-menu-sheet nav-menu-sheet--full card"
            role="dialog"
            aria-modal="true"
            aria-label="профиль"
            @click.stop
          >
            <span class="nav-menu-handle" aria-hidden="true" />
            <div class="nav-menu-sheet-body">
              <div class="profile-menu-head">
                <div class="profile-menu-head-main">
                  <span class="profile-menu-name">@{{ auth.nickname }}</span>
                </div>
                <div class="profile-menu-head-actions">
                  <div class="profile-menu-coins" title="монеты">
                    <img
                      src="/coin-gem.png"
                      alt=""
                      width="18"
                      height="18"
                      class="profile-coin-img"
                      loading="lazy"
                    />
                    <span><MotionCoinCount :value="profileCoins" /></span>
                  </div>
                </div>
              </div>
              <RouterLink :to="`/u/${auth.nickname}`" class="profile-menu-item" @click="closeProfileMenu">
                <AppIcon name="profile" :size="22" /><span>профиль</span>
              </RouterLink>
              <RouterLink to="/inventory" class="profile-menu-item" @click="closeProfileMenu">
                <AppIcon name="inventory" :size="22" /><span>инвентарь</span>
              </RouterLink>
              <RouterLink to="/saved" class="profile-menu-item" @click="closeProfileMenu">
                <AppIcon name="bookmark" :size="22" /><span>закладки</span>
              </RouterLink>
              <RouterLink
                v-if="auth.isStaff"
                to="/invites"
                class="profile-menu-item"
                @click="closeProfileMenu"
              >
                <AppIcon name="invites" :size="22" /><span>инвайты</span>
              </RouterLink>
              <RouterLink to="/me/edit" class="profile-menu-item" @click="closeProfileMenu">
                <AppIcon name="settings" :size="22" /><span>настройки</span>
              </RouterLink>
              <RouterLink
                v-if="auth.role === 'master' || auth.role === 'admin'"
                to="/work"
                class="profile-menu-item"
                @click="closeProfileMenu"
              >
                <AppIcon name="briefcase" :size="22" /><span>работа</span>
              </RouterLink>
              <span class="profile-menu-sep" />
              <div class="profile-menu-footer">
                <button class="profile-menu-footer-btn" type="button" @click="logoutFromMenu">
                  <AppIcon name="logout" :size="22" /><span>выход</span>
                </button>
                <RouterLink to="/auth/qr" class="profile-menu-footer-btn" @click="closeProfileMenu">
                  <AppIcon name="qr" :size="22" /><span>вход по qr</span>
                </RouterLink>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
    <RouterView v-slot="{ Component, route: rv }">
      <component v-if="motionLite" :is="Component" :key="rv.path" class="page-motion-root" />
      <AnimatePresence v-else mode="wait">
        <motion.div
          :key="rv.path"
          class="page-motion-root"
          :initial="pageEnter"
          :animate="pageActive"
          :exit="pageExit"
          :transition="springSoft"
        >
          <component :is="Component" />
        </motion.div>
      </AnimatePresence>
    </RouterView>
    <AppToast />
    <Teleport to="body">
      <div
        class="nprog"
        :class="{ on: navProgressOn, done: navProgressDone }"
        :style="{ width: navProgress + '%' }"
        aria-hidden="true"
      />
    </Teleport>
    <div v-if="!isOnline" class="offline-overlay" role="status" aria-live="polite">
      <div class="offline-card">
        <h2>нет связи</h2>
        <p class="muted">проверьте подключение</p>
        <button type="button" @click="refreshPage">обновить</button>
      </div>
    </div>
  </div>
  </MotionConfig>
</template>

<style scoped>
.page-motion-root {
  width: 100%;
  min-height: 0;
}

.offline-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: var(--glass-bg, rgba(0, 0, 0, 0.95));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  backdrop-filter: blur(var(--glass-blur));
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

.nav-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: nowrap;
  padding: 0.4rem 0.6rem;
  position: relative;
}

.nav-reader-center {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: center;
  padding: 0 0.35rem;
}

.nav-reader-title {
  font-weight: 600;
  font-size: 0.95rem;
  text-transform: lowercase;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: min(42vw, 360px);
}

.nav-reader-controls {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  flex-shrink: 0;
}

.nav-reader-page {
  font-size: 0.82rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  margin-right: 0.15rem;
  white-space: nowrap;
}

.nav-zoom-glyph {
  font-size: 1.15rem;
  font-weight: 600;
  line-height: 1;
}

.nav.nav--sheet-open {
  border-bottom-color: transparent;
}

.nav.nav--sheet-open:has(#nav-drawer) {
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  background: var(--bg);
}

.nav-dropdown {
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  margin-top: -1px;
  z-index: 2;
  border: 1px solid var(--border);
  border-top: 1px solid var(--border);
  border-radius: 0 0 var(--radius) var(--radius);
  padding: 0.5rem 0.6rem 0.75rem;
  overflow: hidden;
  background: var(--glass-bg, var(--bg));
  transform-origin: top center;
}

.nav-dropdown:not(.nav-drawer-sheet) {
  -webkit-backdrop-filter: blur(var(--glass-blur));
  backdrop-filter: blur(var(--glass-blur));
  will-change: transform, opacity;
}

.nav-dropdown.nav-drawer-sheet {
  z-index: 5;
  background: var(--surface);
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}

.nav-dropdown.search-menu-sheet {
  padding: 0.35rem 0.6rem 0.65rem;
  max-height: min(75vh, 36rem);
  overflow-y: auto;
  background: color-mix(in srgb, var(--bg) 94%, transparent);
}

.nav-dropdown.profile-menu-sheet {
  padding: 0.35rem 0.6rem 0.65rem;
}

.nav-dropdown:not(.search-menu-sheet) {
  max-height: min(72vh, 28rem);
  overflow-y: auto;
}

.nav-drawer-enter-active,
.nav-drawer-leave-active {
  transition: opacity 0.16s ease;
}

.nav-drawer-enter-from,
.nav-drawer-leave-to {
  opacity: 0;
}

.nav-sheet-enter-active,
.nav-sheet-leave-active {
  transition:
    transform 0.18s ease,
    opacity 0.14s ease;
  overflow: hidden;
}

.nav-sheet-enter-from,
.nav-sheet-leave-to {
  transform: scaleY(0);
  opacity: 0;
}

.nav-sheet-enter-to,
.nav-sheet-leave-from {
  transform: scaleY(1);
  opacity: 1;
}

.nav-menu-root--backdrop {
  background: rgba(0, 0, 0, 0.45);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  pointer-events: auto;
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
  background: var(--glass-bg, var(--surface));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--border);
  overflow-y: auto;
  transform-origin: top center;
}

.nav-menu-root:not(.nav-menu-root--mobile) .nav-menu-sheet--full {
  position: fixed;
  margin: 0;
  padding: 0;
  max-width: none;
  border-top: none;
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  border-radius: 0 0 var(--radius) var(--radius);
  background: var(--glass-bg, var(--bg));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  backdrop-filter: blur(var(--glass-blur));
  z-index: 91;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.nav-menu-root:not(.nav-menu-root--mobile) .nav-menu-sheet-body {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0.5rem 0.6rem 0.75rem;
}

.nav-menu-root:not(.nav-menu-root--mobile) .profile-menu-sheet .nav-menu-sheet-body {
  padding: 0.35rem 0.6rem 0.65rem;
}

.nav-menu-root:not(.nav-menu-root--mobile) .search-menu-sheet {
  max-height: min(75vh, 36rem);
}

.nav-menu-root:not(.nav-menu-root--mobile) .nav-menu-sheet--full:not(.search-menu-sheet) {
  max-height: min(72vh, 28rem);
}

.nav-menu-root--mobile .nav-menu-sheet {
  padding: 0.5rem 0.85rem calc(0.85rem + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--border);
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
  border-bottom: none;
  border-radius: var(--radius) var(--radius) 0 0;
  transform-origin: bottom center;
  display: block;
}

.nav-menu-root--mobile .nav-menu-sheet-body {
  overflow: visible;
  padding: 0;
  flex: none;
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
  transition: opacity 0.16s ease;
}

.nav-menu-enter-active.nav-menu-root,
.nav-menu-leave-active.nav-menu-root {
  transition: background 0.18s ease;
}

.nav-menu-enter-from:not(.nav-menu-root--mobile) .nav-menu-sheet--full,
.nav-menu-leave-to:not(.nav-menu-root--mobile) .nav-menu-sheet--full {
  opacity: 0;
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

.nav-spacer {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  padding: 0 0.5rem;
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
  min-height: 44px;
  width: 44px;
  height: 44px;
  padding: 0;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  transition:
    background var(--dur-2) var(--ease-out),
    border-color var(--dur-2) var(--ease-out),
    transform var(--dur-2) var(--ease-spring);
}
.profile-trigger:active {
  transform: scale(0.94);
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
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 700;
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
.profile-menu-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}
.profile-menu-footer {
  display: flex;
  align-items: stretch;
}
.profile-menu-footer-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-width: 0;
  min-height: 40px;
  padding: 0.45rem 0.35rem;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--text);
  text-transform: lowercase;
  font: inherit;
  font-size: 0.95rem;
  line-height: 1.35;
  cursor: pointer;
  text-decoration: none;
}
.profile-menu-footer-btn + .profile-menu-footer-btn {
  border-left: 1px solid var(--border);
}
.nav-menu-root--mobile .profile-menu-footer-btn {
  min-height: 48px;
  padding: 0.65rem 0.35rem;
}
.profile-menu-footer-btn:hover {
  background: var(--surface2);
  color: var(--text);
  text-decoration: none;
}
.profile-menu-footer-btn :deep(.app-icon) {
  flex-shrink: 0;
  opacity: 0.8;
}
.profile-menu-footer-btn > span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.profile-menu-footer-btn:hover :deep(.app-icon) {
  opacity: 1;
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
  min-width: 0;
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
  .nav-bar {
    gap: 0.15rem;
    padding: 0.3rem 0.2rem;
  }

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
.profile-menu-item > span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.profile-menu-item:hover :deep(.app-icon) {
  opacity: 1;
}

.brand-link {
  padding: 0.2rem 0.35rem;
  border-bottom: none;
}
.brand-link:hover {
  opacity: 0.88;
}
.brand-logo {
  display: block;
  width: 28px;
  height: 28px;
  object-fit: contain;
  border-radius: 6px;
}

.offline-card h2 {
  text-transform: lowercase;
}

html[data-theme="contrast"] .nav-dropdown,
html[data-theme="contrast-white"] .nav-dropdown,
html[data-theme="contrast"] .nav-menu-sheet,
html[data-theme="contrast-white"] .nav-menu-sheet,
html[data-theme="contrast"] .nav-menu-sheet--full,
html[data-theme="contrast-white"] .nav-menu-sheet--full,
html[data-theme="contrast"] .offline-overlay,
html[data-theme="contrast-white"] .offline-overlay {
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  background: var(--surface);
}

@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
  .nav-dropdown,
  .nav-menu-sheet,
  .nav-menu-sheet--full {
    background: var(--surface);
  }
  .offline-overlay {
    background: rgba(0, 0, 0, 0.95);
  }
}

@media (max-width: 640px), (hover: none) and (pointer: coarse) {
  .nav-menu-root--backdrop,
  .nav-dropdown,
  .nav-menu-sheet,
  .nav-menu-sheet--full,
  .offline-overlay {
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    background: var(--surface);
  }

  .offline-overlay {
    background: rgba(0, 0, 0, 0.92);
  }
}
</style>
