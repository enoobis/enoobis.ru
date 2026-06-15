<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { api } from "../api/http";
import { listAuthorPosts, type BlogListItem } from "../api/blog";
import { listMicroByAuthor, type MicroPost } from "../api/micro";
import MicroItem from "../components/MicroItem.vue";
import AppIcon from "../components/AppIcon.vue";
import PostMetaStats from "../components/PostMetaStats.vue";
import type { Achievement } from "../api/profile";
import { useAuthStore } from "../stores/auth";
import { renderMarkdown } from "../utils/markdown";
import { useProfileOwnerThemeFromValue } from "../composables/useProfileOwnerTheme";
type Profile = {
  nickname: string;
  role: string;
  bio: string;
  avatar_url: string;
  avatar_frame_url: string;
  wallpaper_url: string;
  profile_cover_url: string;
  theme_preference: string;
  full_name: string;
  website_url: string;
  social_links: { name: string; url: string }[];
  readme_md: string;
  created_at: string;
  followers_count: number;
  following_count: number;
  coins?: number;
  achievements: Achievement[];
  moderation_notices?: string[];
};

type Tab = "blog" | "micro";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const profile = ref<Profile | null>(null);
const posts = ref<BlogListItem[]>([]);
const micro = ref<MicroPost[]>([]);
const tab = ref<Tab>("blog");
const err = ref("");
const avatarBroken = ref(false);
const frameBroken = ref(false);
const wallpaperBroken = ref(false);
const coverBroken = ref(false);
const avatarHealTried = ref(false);
const following = ref(false);
const followBusy = ref(false);
let loadSeq = 0;

const nick = computed(() => route.params.nickname as string);
const isMe = computed(() => auth.token && auth.nickname === nick.value);
const displayName = computed(() => profile.value?.full_name?.trim() || profile.value?.nickname || "");
const renderedReadme = computed(() => renderMarkdown(profile.value?.readme_md ?? ""));
const socialPublic = computed(() =>
  (profile.value?.social_links ?? []).filter((s) => String(s?.url ?? "").trim().length > 0),
);

function isWallpaperVideoUrl(url: string) {
  return /\.(mp4|webm)(\?|#|$)/i.test(url);
}

const showWallpaper = computed(
  () => !!profile.value?.wallpaper_url && !wallpaperBroken.value,
);

const isWallpaperVideo = computed(
  () => isWallpaperVideoUrl(profile.value?.wallpaper_url ?? ""),
);

const WALLPAPER_STAGE_REF = 1920;
/** рамка обоев — чуть шире layout, по внутренним краям крыльев на фоне */
const WALLPAPER_PANEL_REF = 948;
const WALLPAPER_DESKTOP_MIN = 761;

const wallpaperDesktop = ref(false);
const wallpaperStageWidthPx = ref(WALLPAPER_STAGE_REF);
const wallpaperPanelWidthPx = ref(WALLPAPER_PANEL_REF);
const wallpaperPanelMarginPx = ref(0);

function clearWallpaperDocumentVars() {
  const root = document.documentElement;
  root.classList.remove("profile-wallpaper-desktop");
  root.style.removeProperty("--profile-wallpaper-panel");
  root.style.removeProperty("--profile-wallpaper-margin");
}

function applyWallpaperDocumentVars(active: boolean) {
  if (!active) {
    clearWallpaperDocumentVars();
    return;
  }
  const cw = document.documentElement.clientWidth;
  const stage = Math.min(cw, WALLPAPER_STAGE_REF);
  const panel = Math.round((stage * WALLPAPER_PANEL_REF) / WALLPAPER_STAGE_REF);
  const stageLeft = (cw - stage) / 2;
  const panelLeft = stageLeft + (stage - panel) / 2;
  const root = document.documentElement;
  root.classList.add("profile-wallpaper-desktop");
  root.style.setProperty("--profile-wallpaper-panel", `${panel}px`);
  root.style.setProperty("--profile-wallpaper-margin", `${panelLeft}px`);
  wallpaperStageWidthPx.value = stage;
  wallpaperPanelWidthPx.value = panel;
  wallpaperPanelMarginPx.value = panelLeft;
}

function syncWallpaperLayout() {
  if (typeof window === "undefined") return;
  const cw = document.documentElement.clientWidth;
  wallpaperDesktop.value = cw >= WALLPAPER_DESKTOP_MIN;
  applyWallpaperDocumentVars(showWallpaper.value && wallpaperDesktop.value);
}

const showDesktopWallpaper = computed(
  () => showWallpaper.value && wallpaperDesktop.value,
);

const wallpaperStageStyle = computed(() => ({
  width: `${wallpaperStageWidthPx.value}px`,
}));

const wallpaperWrapStyle = computed(() => {
  if (!showDesktopWallpaper.value) return undefined;
  return {
    width: `${wallpaperPanelWidthPx.value}px`,
    marginLeft: `${wallpaperPanelMarginPx.value}px`,
  };
});
const showCover = computed(
  () => !!profile.value?.profile_cover_url && !coverBroken.value,
);
const showFrame = computed(
  () => !!profile.value?.avatar_frame_url && !frameBroken.value,
);

function probeImage(url: string, onFail: () => void) {
  const img = new Image();
  img.onerror = onFail;
  img.src = url;
}

watch(
  () => profile.value?.wallpaper_url ?? "",
  (url) => {
    wallpaperBroken.value = false;
    if (url && !isWallpaperVideoUrl(url)) probeImage(url, () => { wallpaperBroken.value = true; });
  },
);

watch(
  () => profile.value?.profile_cover_url ?? "",
  (url) => {
    coverBroken.value = false;
    if (url) probeImage(url, () => { coverBroken.value = true; });
  },
);

async function onAvatarError() {
  if (avatarHealTried.value) {
    avatarBroken.value = true;
    return;
  }
  avatarHealTried.value = true;
  try {
    const p = await api<Profile>(`/api/profile/${nick.value}`);
    if (!profile.value) return;
    profile.value = { ...profile.value, ...p };
    avatarBroken.value = false;
  } catch {
    avatarBroken.value = true;
  }
}

function onFrameError() {
  frameBroken.value = true;
  if (profile.value) profile.value.avatar_frame_url = "";
}

async function load() {
  const seq = ++loadSeq;
  const target = nick.value;
  err.value = "";
  avatarBroken.value = false;
  frameBroken.value = false;
  wallpaperBroken.value = false;
  coverBroken.value = false;
  avatarHealTried.value = false;
  const sameProfile = profile.value?.nickname === target;
  if (!sameProfile) {
    profile.value = null;
    posts.value = [];
    micro.value = [];
    following.value = false;
  }
  try {
    const loaded = await api<Profile>(`/api/profile/${target}`);
    if (seq !== loadSeq) return;
    profile.value = loaded;
    const [pBlog, pMicro] = await Promise.all([
      listAuthorPosts(target, { page: 1, page_size: 20 }),
      listMicroByAuthor(target, auth.token),
    ]);
    if (seq !== loadSeq) return;
    posts.value = pBlog.items;
    micro.value = pMicro.items;
    if (auth.token && auth.nickname !== target) {
      const state = await api<{ following: boolean }>(`/api/profile/${target}/following/me`, {
        token: auth.token,
      });
      if (seq !== loadSeq) return;
      following.value = state.following;
    }
  } catch (e) {
    if (seq !== loadSeq) return;
    const msg = e instanceof Error ? e.message : "ошибка";
    if (!auth.token && msg.toLowerCase().includes("login required")) {
      await router.push({ name: "login", query: { next: route.fullPath } });
      return;
    }
    err.value = msg.toLowerCase().includes("forbidden") || msg.includes("403") ? "профиль скрыт" : msg;
  }
}

async function toggleFollow() {
  if (!auth.token || !profile.value || followBusy.value) return;
  followBusy.value = true;
  try {
    const path = `/api/profile/${profile.value.nickname}/follow`;
    if (following.value) {
      await api(path, { method: "DELETE", token: auth.token });
      following.value = false;
      profile.value.followers_count = Math.max(0, profile.value.followers_count - 1);
    } else {
      await api(path, { method: "POST", token: auth.token });
      following.value = true;
      profile.value.followers_count += 1;
    }
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    followBusy.value = false;
  }
}

function onMicroDeleted(id: string) {
  micro.value = micro.value.filter((p) => p.id !== id);
}

function onMicroUpdated(updated: MicroPost) {
  micro.value = micro.value.map((p) => (p.id === updated.id ? updated : p));
}

const earnedAchievements = computed(() =>
  (profile.value?.achievements ?? []).filter((a) => a.earned),
);

const moderationNotices = computed(() => profile.value?.moderation_notices ?? []);

onMounted(() => {
  syncWallpaperLayout();
  void load();
  window.addEventListener("resize", syncWallpaperLayout);
});

onUnmounted(() => {
  window.removeEventListener("resize", syncWallpaperLayout);
  clearWallpaperDocumentVars();
});

watch(nick, load);

watch(showDesktopWallpaper, () => {
  syncWallpaperLayout();
});

useProfileOwnerThemeFromValue(() => profile.value?.theme_preference);
</script>

<template>
  <div
    v-if="profile"
    class="profile-wrap"
    :class="{ 'has-wallpaper-desktop': showDesktopWallpaper }"
    :style="wallpaperWrapStyle"
  >
    <Teleport to="body">
      <div
        v-if="showDesktopWallpaper"
        class="profile-bg"
        aria-hidden="true"
      >
        <div class="profile-bg-stage" :style="wallpaperStageStyle">
          <video
            v-if="isWallpaperVideo"
            class="profile-bg-img profile-bg-video"
            :src="profile.wallpaper_url"
            autoplay
            loop
            muted
            playsinline
            @error="wallpaperBroken = true"
          />
          <img
            v-else
            class="profile-bg-img"
            :src="profile.wallpaper_url"
            alt=""
            decoding="async"
            @error="wallpaperBroken = true"
          />
          <div class="profile-bg-fade" />
        </div>
      </div>
    </Teleport>
    <section
      class="profile"
      :class="{
        'on-wallpaper': showWallpaper,
        'on-wallpaper-desktop': showDesktopWallpaper,
      }"
    >
    <div class="profile-inner" :class="{ 'profile-steam-panel': showWallpaper }">
    <div
      v-if="showCover"
      class="cover-banner"
      :style="{ backgroundImage: `url(${profile.profile_cover_url})` }"
    />
    <header class="head" :class="{ 'head-with-cover': showCover }">
      <div class="avatar-cell">
        <div
          class="avatar-stack"
          :class="{ framed: showFrame }"
        >
          <img
            v-if="profile.avatar_url && !avatarBroken"
            class="avatar"
            :src="profile.avatar_url"
            alt=""
            @error="onAvatarError"
          />
          <div v-else class="avatar fallback">{{ profile.nickname.slice(0, 2) }}</div>
          <img
            v-if="showFrame"
            class="avatar-frame"
            :src="profile.avatar_frame_url"
            alt=""
            @error="onFrameError"
          />
        </div>
      </div>

      <div class="info">
        <h1>{{ displayName }}</h1>
        <p class="muted nick-line">
          @{{ profile.nickname }}
        </p>
        <p v-if="profile.bio" class="bio">{{ profile.bio }}</p>
        <p class="meta muted">
          <RouterLink
            :to="{ name: 'follows', params: { nickname: profile.nickname }, query: { tab: 'followers' } }"
            class="link-btn"
          >
            {{ profile.followers_count }} подписчиков
          </RouterLink>
          <span>·</span>
          <RouterLink
            :to="{ name: 'follows', params: { nickname: profile.nickname }, query: { tab: 'following' } }"
            class="link-btn"
          >
            {{ profile.following_count }} подписок
          </RouterLink>
        </p>
        <a v-if="profile.website_url" :href="profile.website_url" target="_blank" rel="noopener noreferrer" class="muted">
          {{ profile.website_url }}
        </a>
        <ul v-if="socialPublic.length" class="socials">
          <li v-for="(s, i) in socialPublic" :key="i">
            <a :href="s.url" target="_blank" rel="noopener noreferrer" class="muted small">
              {{ s.name?.trim() || s.url }}
            </a>
          </li>
        </ul>
      </div>

      <div class="actions">
        <RouterLink v-if="isMe" to="/me/edit" class="btn secondary">редактировать</RouterLink>
        <template v-else-if="auth.token">
          <RouterLink :to="{ name: 'chats', query: { with: profile.nickname } }" class="btn">
            написать
          </RouterLink>
          <button
            class="secondary"
            type="button"
            :disabled="followBusy"
            @click="toggleFollow"
          >
            {{ following ? "отписаться" : "подписаться" }}
          </button>
        </template>
      </div>
    </header>

    <div class="profile-body">
    <ul v-if="moderationNotices.length" class="mod-notes">
      <li v-for="(line, i) in moderationNotices" :key="i">{{ line }}</li>
    </ul>

    <article v-if="profile.readme_md" class="readme markdown-body" v-html="renderedReadme" />

    <section v-if="earnedAchievements.length" class="ach">
      <p class="muted small ach-title">
        <AppIcon name="trophy" :size="12" />
        ачивки
      </p>
      <ul class="ach-list">
        <li v-for="a in earnedAchievements" :key="a.key" class="ach-item" :title="a.description">
          <span>{{ a.title }}</span>
        </li>
      </ul>
    </section>

    <div class="content-tabs">
      <button class="content-tab" :class="{ on: tab === 'blog' }" type="button" @click="tab = 'blog'">
        блоги
      </button>
      <button class="content-tab" :class="{ on: tab === 'micro' }" type="button" @click="tab = 'micro'">
        микроблоги
      </button>
    </div>

    <template v-if="tab === 'blog'">
      <ul v-if="posts.length" class="post-list">
        <li v-for="p in posts" :key="p.id">
          <RouterLink :to="`/blogs/${p.id}`" class="post-title">{{ p.title }}</RouterLink>
          <p class="meta muted small">
            <span>{{ (p.published_at || p.created_at).slice(0, 10) }}</span>
            <template v-if="p.up_count || p.down_count || p.comment_count">
              <span>·</span>
              <PostMetaStats
                :up-count="p.up_count"
                :down-count="p.down_count"
                :comment-count="p.comment_count"
              />
            </template>
          </p>
        </li>
      </ul>
      <p v-else class="page-empty muted">записей нет</p>
    </template>

    <template v-else>
      <div v-if="micro.length" class="micro-list">
        <MicroItem
          v-for="m in micro"
          :key="m.id"
          :post="m"
          clickable
          @deleted="onMicroDeleted"
          @updated="onMicroUpdated"
        />
      </div>
      <p v-else class="page-empty muted">записей нет</p>
    </template>
    </div>
    </div>
    </section>
  </div>
  <p v-else-if="err" class="error">{{ err }}</p>
  <div v-else class="profile-skeleton" aria-busy="true" />
</template>

<style scoped>
.profile-skeleton {
  min-height: 72vh;
  max-width: 640px;
  margin: 0 auto;
}
.profile-bg {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 0;
  pointer-events: none;
  background: var(--bg);
  display: flex;
  justify-content: center;
}
.profile-bg-stage {
  position: relative;
  flex: 0 0 auto;
  max-width: 1920px;
  overflow: hidden;
}
.profile-bg-stage::before {
  content: "";
  display: block;
  padding-top: 56.25%;
}
.profile-bg-img,
.profile-bg-video {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  object-position: center top;
}
.profile-bg-video {
  border: 0;
  pointer-events: none;
}
.profile-bg-fade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 42%;
  max-height: 360px;
  background: linear-gradient(to bottom, transparent, var(--bg));
}
.profile {
  position: relative;
  z-index: 1;
  max-width: 640px;
  margin: 0 auto;
}
.profile-inner {
  display: grid;
  gap: 0;
}
.profile-body {
  display: grid;
  gap: 0;
}
.profile.on-wallpaper {
  --profile-wide: min(calc(880px - 2rem), calc(100vw - 2 * var(--layout-pad, 1rem)));
  --profile-steam-bg: rgba(8, 9, 12, 0.55);
  --profile-steam-border: rgba(255, 255, 255, 0.12);
  --profile-steam-line: rgba(255, 255, 255, 0.1);
  --profile-steam-blur: 22px;
  max-width: var(--profile-wide);
  padding: 0.75rem 0 1.5rem;
}
:global(html[data-theme="white"]) .profile.on-wallpaper {
  --profile-steam-bg: rgba(255, 255, 255, 0.58);
  --profile-steam-border: rgba(0, 0, 0, 0.1);
  --profile-steam-line: rgba(0, 0, 0, 0.08);
}
.profile-steam-panel {
  border-radius: 4px;
  border: 1px solid var(--profile-steam-border);
  background: var(--profile-steam-bg);
  -webkit-backdrop-filter: blur(var(--profile-steam-blur)) saturate(1.2);
  backdrop-filter: blur(var(--profile-steam-blur)) saturate(1.2);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 8px 32px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}
:global(html[data-theme="white"]) .profile-steam-panel {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.65),
    0 8px 28px rgba(0, 0, 0, 0.12);
}
@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
  .profile-steam-panel {
    background: color-mix(in srgb, var(--bg) 92%, transparent);
  }
}
.profile.on-wallpaper .head {
  padding: 1rem 1.15rem 1.1rem;
  margin-bottom: 0;
  border-bottom: 1px solid var(--profile-steam-line);
  border-radius: 0;
  background: transparent;
}
.profile.on-wallpaper .profile-body {
  padding: 0.85rem 1.15rem 1.15rem;
  background: transparent;
}
.profile.on-wallpaper .readme {
  border: none;
  padding: 0;
  margin-bottom: 1rem;
  background: transparent;
}
.profile.on-wallpaper .readme :deep(img) {
  width: 100%;
  border-radius: 4px;
}
.profile.on-wallpaper .readme :deep(video) {
  width: 100%;
  border-radius: 4px;
}
.profile.on-wallpaper .content-tabs {
  margin-top: 0;
  border-bottom-color: var(--profile-steam-line);
}
.profile.on-wallpaper .page-empty {
  color: var(--muted);
}
.cover-banner {
  width: 100%;
  height: 180px;
  border-radius: var(--radius);
  background-size: cover;
  background-position: center;
  margin-bottom: -40px;
  border: 1px solid var(--border);
}
.head-with-cover {
  padding-top: 0;
}
.head-with-cover .avatar-stack {
  width: 80px;
  height: 80px;
}
.head-with-cover .avatar-stack.framed .avatar,
.head-with-cover .avatar-stack.framed .avatar.fallback {
  border: none;
}
.avatar-cell {
  min-width: 0;
}
.avatar-stack {
  position: relative;
  width: 64px;
  height: 64px;
}
.avatar-stack .avatar {
  width: 100%;
  height: 100%;
  border-radius: var(--avatar-radius);
  border: 1px solid var(--border);
  object-fit: cover;
  background: var(--surface);
}
.avatar-stack.framed .avatar,
.avatar-stack.framed .avatar.fallback {
  border: none;
}
.avatar-frame {
  position: absolute;
  inset: -8px;
  width: calc(100% + 16px);
  height: calc(100% + 16px);
  object-fit: contain;
  pointer-events: none;
}
.nick-line {
  margin: 0;
}
.mod-notes {
  list-style: none;
  padding: 0;
  margin: 0 0 1rem;
  color: var(--danger, #c44);
  font-size: 0.82rem;
  line-height: 1.35;
}
.mod-notes li + li {
  margin-top: 0.35rem;
}
.socials {
  list-style: none;
  padding: 0;
  margin: 0.35rem 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
}
.head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  column-gap: var(--profile-head-gap);
  row-gap: 1rem;
  align-items: start;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 1rem;
}
.avatar-stack .avatar.fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 500;
  color: var(--muted);
  text-transform: lowercase;
  border-radius: var(--avatar-radius);
}
.info h1 {
  font-size: 1.2rem;
  font-weight: 600;
  margin: 0;
}
.info .muted {
  margin: 0.2rem 0;
  font-size: 0.9rem;
}
.bio {
  margin-top: 0.6rem;
  color: var(--text);
}
.meta {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.4rem;
}
.actions {
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.actions .btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--control-h);
  padding: 0.5rem 1.1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  font-size: 0.9rem;
  font-weight: 600;
  text-transform: lowercase;
  color: var(--text);
  text-align: center;
}
.actions .btn:hover {
  background: var(--surface);
  text-decoration: none;
}

.readme {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem 1.2rem;
  margin: 0 0 1.2rem;
  line-height: 1.65;
  font-size: 0.95rem;
}
.readme :deep(h1),
.readme :deep(h2),
.readme :deep(h3) {
  font-weight: 600;
  margin: 1rem 0 0.5rem;
  text-transform: lowercase;
}
.readme :deep(h1) {
  font-size: 1.2rem;
}
.readme :deep(h2) {
  font-size: 1.05rem;
}
.readme :deep(h3) {
  font-size: 0.98rem;
}
.readme :deep(p) {
  margin: 0.4rem 0;
}
.readme :deep(ul),
.readme :deep(ol) {
  padding-left: 1.4rem;
  margin: 0.4rem 0;
}
.readme :deep(li) {
  margin: 0.2rem 0;
}
.readme :deep(img) {
  max-width: 100%;
  border-radius: var(--radius);
  margin: 0.6rem 0;
}
.readme :deep(video) {
  display: block;
  width: 100%;
  max-width: 100%;
  border-radius: var(--radius);
  margin: 0.6rem 0;
  background: #000;
}
.readme :deep(a) {
  color: var(--text);
  border-bottom: 1px solid var(--border);
}
.readme :deep(a:hover) {
  border-bottom-color: var(--text);
  text-decoration: none;
}
.readme :deep(blockquote) {
  margin: 0.6rem 0;
  padding: 0.05rem 0.8rem;
  border-left: 2px solid var(--border);
  color: var(--muted);
}
.readme :deep(code) {
  font-family: var(--mono, ui-monospace, monospace);
  font-size: 0.88em;
}
.readme :deep(p code),
.readme :deep(li code) {
  background: var(--surface2);
  padding: 0.05em 0.3em;
  border-radius: 4px;
}
.readme :deep(pre) {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 0.6rem 0.8rem;
  overflow-x: auto;
  margin: 0.6rem 0;
}
.readme :deep(pre code) {
  background: none;
  padding: 0;
}

.ach {
  margin-bottom: 1rem;
}
.ach-title {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  text-transform: lowercase;
  letter-spacing: 0.06em;
  font-size: 0.7rem;
  margin-bottom: 0.4rem;
}
.ach-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.ach-item {
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.78rem;
  color: var(--muted);
  cursor: help;
}

.post-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 1rem;
}
.post-list li {
  display: grid;
  gap: 0.25rem;
}
.post-list .meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin: 0;
}
.post-title {
  color: var(--text);
  font-weight: 500;
}
.micro-list {
  display: grid;
}
.small {
  font-size: 0.82rem;
}
@media (max-width: 760px) {
  .profile.on-wallpaper {
    padding: 0;
  }
}

.profile-wrap.has-wallpaper-desktop {
  margin-right: auto;
  margin-top: -1.5rem;
}
.profile.on-wallpaper-desktop {
  width: 100%;
  max-width: none;
  padding: 0 0 1.5rem;
}
.profile.on-wallpaper-desktop .profile-steam-panel {
  border-radius: 0 0 4px 4px;
}
.profile.on-wallpaper-desktop .cover-banner {
  --profile-cover-ratio: 5 / 2;
  height: auto;
  aspect-ratio: var(--profile-cover-ratio);
  background-repeat: no-repeat;
  margin-bottom: -2.5rem;
  border-radius: 0;
  border-top: none;
  border-left: none;
  border-right: none;
}

@media (max-width: 600px) {
  .head {
    grid-template-columns: auto 1fr;
    column-gap: 1.25rem;
  }
  .actions {
    grid-column: 1 / -1;
  }
}

.link-btn {
  background: transparent;
  border: 0;
  padding: 0;
  margin: 0;
  min-height: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.link-btn:hover {
  color: var(--text);
  background: transparent;
  text-decoration: none;
}
</style>
