<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { api } from "../api/http";
import { listAuthorPosts, type BlogListItem } from "../api/blog";
import { listMicroByAuthor, type MicroPost } from "../api/micro";
import MicroItem from "../components/MicroItem.vue";
import AppIcon from "../components/AppIcon.vue";
import { unpinPost, type Achievement } from "../api/profile";
import { useAuthStore } from "../stores/auth";
import { renderMarkdown } from "../utils/markdown";
import { toastError, toastSuccess } from "../utils/toast";

type PinnedPost =
  | {
      type: "micro";
      id: string;
      body: string;
      image_url: string;
      author_nickname: string;
      author_avatar: string;
      created_at: string;
    }
  | {
      type: "blog";
      id: string;
      title: string;
      excerpt: string;
      author_nickname: string;
      created_at: string;
    };

type Profile = {
  nickname: string;
  role: string;
  bio: string;
  avatar_url: string;
  full_name: string;
  website_url: string;
  social_links: { name: string; url: string }[];
  readme_md: string;
  created_at: string;
  last_seen_at: string;
  followers_count: number;
  following_count: number;
  achievements: Achievement[];
  pinned_post: PinnedPost | null;
};

type Tab = "blog" | "micro";

const route = useRoute();
const auth = useAuthStore();
const profile = ref<Profile | null>(null);
const posts = ref<BlogListItem[]>([]);
const micro = ref<MicroPost[]>([]);
const tab = ref<Tab>("blog");
const err = ref("");
const avatarBroken = ref(false);
const following = ref(false);
const followBusy = ref(false);

const nick = computed(() => route.params.nickname as string);
const isMe = computed(() => auth.token && auth.nickname === nick.value);
const displayName = computed(() => profile.value?.full_name?.trim() || profile.value?.nickname || "");
const renderedReadme = computed(() => renderMarkdown(profile.value?.readme_md ?? ""));
const socialPublic = computed(() =>
  (profile.value?.social_links ?? []).filter((s) => String(s?.url ?? "").trim().length > 0),
);

async function load() {
  err.value = "";
  avatarBroken.value = false;
  profile.value = null;
  posts.value = [];
  micro.value = [];
  following.value = false;
  try {
    profile.value = await api<Profile>(`/api/profile/${nick.value}`);
    const [pBlog, pMicro] = await Promise.all([
      listAuthorPosts(nick.value, { page: 1, page_size: 20 }),
      listMicroByAuthor(nick.value, auth.token),
    ]);
    posts.value = pBlog.items;
    micro.value = pMicro.items;
    if (auth.token && auth.nickname !== nick.value) {
      const state = await api<{ following: boolean }>(`/api/profile/${nick.value}/following/me`, {
        token: auth.token,
      });
      following.value = state.following;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ошибка";
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

const pinBusy = ref(false);

async function unpinFromProfile() {
  if (!auth.token || pinBusy.value) return;
  pinBusy.value = true;
  try {
    await unpinPost(auth.token);
    if (profile.value) profile.value.pinned_post = null;
    toastSuccess("открепили");
  } catch (e) {
    toastError(e);
  } finally {
    pinBusy.value = false;
  }
}

onMounted(load);
watch(nick, load);
</script>

<template>
  <section v-if="profile" class="profile">
    <header class="head">
      <img
        v-if="profile.avatar_url && !avatarBroken"
        class="avatar"
        :src="profile.avatar_url"
        alt=""
        @error="avatarBroken = true"
      />
      <div v-else class="avatar fallback">{{ profile.nickname.slice(0, 2) }}</div>

      <div class="info">
        <h1>{{ displayName }}</h1>
        <p class="muted">@{{ profile.nickname }}</p>
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

    <article v-if="profile.readme_md" class="readme markdown-body" v-html="renderedReadme" />

    <section v-if="profile.pinned_post" class="pinned">
      <header class="pinned-head">
        <span class="muted small pinned-label">
          <AppIcon name="pin" :size="12" />
          закреплено
        </span>
        <button
          v-if="isMe"
          type="button"
          class="pin-x"
          :disabled="pinBusy"
          aria-label="открепить"
          title="открепить"
          @click="unpinFromProfile"
        >
          <AppIcon name="close" :size="12" />
        </button>
      </header>
      <RouterLink
        v-if="profile.pinned_post.type === 'blog'"
        :to="`/blogs/${profile.pinned_post.id}`"
        class="pinned-blog"
      >
        <strong>{{ profile.pinned_post.title }}</strong>
        <span v-if="profile.pinned_post.excerpt" class="muted small">{{ profile.pinned_post.excerpt }}</span>
      </RouterLink>
      <RouterLink
        v-else-if="profile.pinned_post.type === 'micro'"
        :to="`/microblogs/${profile.pinned_post.id}`"
        class="pinned-micro"
      >
        <p v-if="profile.pinned_post.body" class="pinned-body">{{ profile.pinned_post.body }}</p>
        <img
          v-if="profile.pinned_post.image_url"
          :src="profile.pinned_post.image_url"
          alt=""
          class="pinned-img"
        />
      </RouterLink>
    </section>

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

    <div class="tabs">
      <button class="tab" :class="{ on: tab === 'blog' }" type="button" @click="tab = 'blog'">
        блоги
        <span v-if="posts.length" class="count muted">{{ posts.length }}</span>
      </button>
      <button class="tab" :class="{ on: tab === 'micro' }" type="button" @click="tab = 'micro'">
        микроблоги
        <span v-if="micro.length" class="count muted">{{ micro.length }}</span>
      </button>
    </div>

    <template v-if="tab === 'blog'">
      <ul v-if="posts.length" class="post-list">
        <li v-for="p in posts" :key="p.id">
          <RouterLink :to="`/blogs/${p.id}`" class="post-title">{{ p.title }}</RouterLink>
          <span class="muted small">{{ (p.published_at || p.created_at).slice(0, 10) }}</span>
        </li>
      </ul>
      <p v-else class="muted empty">записей нет</p>
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
      <p v-else class="muted empty">записей нет</p>
    </template>
  </section>
  <p v-else-if="err" class="error">{{ err }}</p>
  <p v-else class="muted">загрузка</p>
</template>

<style scoped>
.profile {
  max-width: 640px;
  margin: 0 auto;
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
  grid-template-columns: 64px 1fr auto;
  gap: 1rem;
  align-items: start;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 1rem;
}
.avatar {
  width: 64px;
  height: 64px;
  border-radius: 999px;
  border: 1px solid var(--border);
  object-fit: cover;
  background: var(--surface);
}
.avatar.fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 500;
  color: var(--muted);
  text-transform: lowercase;
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
  padding: 0.4rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.85rem;
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

.pinned {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.7rem 0.85rem;
  margin-bottom: 1rem;
  background: var(--surface);
}
.pinned-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.4rem;
}
.pinned-label {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.7rem;
}
.pin-x {
  width: 22px;
  height: 22px;
  min-height: 22px;
  padding: 0;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.pin-x:hover {
  color: var(--text);
  background: var(--surface2);
}
.pinned-blog,
.pinned-micro {
  display: block;
  color: var(--text);
}
.pinned-blog strong {
  display: block;
  margin-bottom: 0.2rem;
}
.pinned-body {
  margin: 0;
  font-size: 0.95rem;
  white-space: pre-wrap;
}
.pinned-img {
  max-width: 100%;
  max-height: 240px;
  border-radius: 8px;
  margin-top: 0.4rem;
  border: 1px solid var(--border);
  display: block;
}

.ach {
  margin-bottom: 1rem;
}
.ach-title {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  text-transform: uppercase;
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

.tabs {
  display: flex;
  gap: 0.3rem;
  margin: 0 0 1rem;
  border-bottom: 1px solid var(--border);
}
.tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--muted);
  padding: 0.5rem 0.8rem;
  min-height: 0;
  font-size: 0.9rem;
  border-radius: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.tab:hover {
  color: var(--text);
  background: transparent;
}
.tab.on {
  color: var(--text);
  border-bottom-color: var(--text);
}
.count {
  font-size: 0.78rem;
}

.post-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 1rem;
}
.post-list li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: baseline;
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
.empty {
  text-align: center;
  margin-top: 4vh;
}

@media (max-width: 600px) {
  .head {
    grid-template-columns: 56px 1fr;
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
