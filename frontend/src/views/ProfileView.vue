<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { api } from "../api/http";
import { listAuthorPosts, listMyBookmarks, type BlogListItem } from "../api/blog";
import { useAuthStore } from "../stores/auth";

type Profile = {
  nickname: string;
  role: string;
  bio: string;
  wallpaper_url: string;
  avatar_url: string;
  full_name: string;
  website_url: string;
  social_links: { name: string; url: string }[];
  created_at: string;
  last_seen_at: string;
  favorite_courses: { id: string; title: string }[];
  followers_count: number;
  following_count: number;
};

type FollowPreview = {
  id: string;
  nickname: string;
  avatar_url: string;
};

const route = useRoute();
const auth = useAuthStore();
const profile = ref<Profile | null>(null);
const posts = ref<BlogListItem[]>([]);
const bookmarks = ref<BlogListItem[]>([]);
const followersPreview = ref<FollowPreview[]>([]);
const followingPreview = ref<FollowPreview[]>([]);
const err = ref("");
const avatarBroken = ref(false);
const following = ref(false);
const followBusy = ref(false);
const tab = ref<"elements" | "collections">("elements");

const nick = computed(() => route.params.nickname as string);
const displayName = computed(() => {
  if (!profile.value) return "";
  return profile.value.full_name?.trim() || profile.value.nickname;
});

const onlineLabel = computed(() => {
  const raw = profile.value?.last_seen_at || profile.value?.created_at;
  if (!raw) return "";
  const ts = Date.parse(raw);
  if (Number.isNaN(ts)) return "";
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff <= 120) return "Online now";
  if (diff < 3600) return `Online ${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `Online ${Math.floor(diff / 3600)} hours ago`;
  if (diff < 86400 * 30) return `Online ${Math.floor(diff / 86400)} days ago`;
  if (diff < 86400 * 365) return `Online ${Math.floor(diff / (86400 * 30))} months ago`;
  if (diff < 86400 * 365 * 100) return `Online ${Math.floor(diff / (86400 * 365))} years ago`;
  return `Online ${Math.floor(diff / (86400 * 365 * 100))} centuries ago`;
});

const collectionsCount = computed(() => {
  if (auth.token && auth.nickname === nick.value) return bookmarks.value.length;
  return profile.value?.favorite_courses.length ?? 0;
});

async function loadFollowPreviews() {
  followersPreview.value = await api<FollowPreview[]>(`/api/profile/${nick.value}/followers`);
  followingPreview.value = await api<FollowPreview[]>(`/api/profile/${nick.value}/following`);
}

async function load() {
  err.value = "";
  avatarBroken.value = false;
  profile.value = null;
  posts.value = [];
  bookmarks.value = [];
  followersPreview.value = [];
  followingPreview.value = [];
  following.value = false;
  try {
    profile.value = await api<Profile>(`/api/profile/${nick.value}`);
    const p = await listAuthorPosts(nick.value, { page: 1, page_size: 12 });
    posts.value = p.items;

    if (auth.token && auth.nickname !== nick.value) {
      const state = await api<{ following: boolean }>(`/api/profile/${nick.value}/following/me`, {
        token: auth.token,
      });
      following.value = state.following;
    }
    if (auth.token && auth.nickname === nick.value) {
      const saved = await listMyBookmarks(auth.token, { page: 1, page_size: 12 });
      bookmarks.value = saved.items;
    }
    await loadFollowPreviews();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

async function toggleFollow() {
  if (!auth.token || !profile.value || auth.nickname === profile.value.nickname || followBusy.value) return;
  followBusy.value = true;
  err.value = "";
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
    await loadFollowPreviews();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  } finally {
    followBusy.value = false;
  }
}

onMounted(load);
watch(nick, load);
</script>

<template>
  <section v-if="profile" class="cosmos-profile">
    <p v-if="err" class="error">{{ err }}</p>

    <div class="profile-grid">
      <aside class="profile-side card">
        <img
          v-if="profile.avatar_url && !avatarBroken"
          class="profile-avatar"
          :src="profile.avatar_url"
          alt=""
          @error="avatarBroken = true"
        />
        <div v-else class="profile-avatar profile-avatar-fallback">{{ profile.nickname.slice(0, 2).toUpperCase() }}</div>

        <h1>{{ displayName }}</h1>
        <p class="muted">@{{ profile.nickname }}</p>
        <p class="muted">{{ onlineLabel }}</p>
        <p class="bio">{{ profile.bio || "Add a bio..." }}</p>

        <div class="profile-actions">
          <RouterLink
            v-if="auth.token && auth.nickname === profile.nickname"
            to="/me/edit"
            class="btn secondary"
          >
            Edit profile
          </RouterLink>
          <button
            v-if="auth.token && auth.nickname !== profile.nickname"
            class="secondary"
            type="button"
            :disabled="followBusy"
            @click="toggleFollow"
          >
            {{ following ? "Unfollow" : "Follow" }}
          </button>
        </div>

        <a v-if="profile.website_url" :href="profile.website_url" target="_blank" rel="noopener noreferrer">
          {{ profile.website_url }}
        </a>
      </aside>

      <main class="profile-main card">
        <div class="main-top-meta">
          <div class="meta-row">
            <div class="follow-avatars">
              <template v-for="f in followersPreview.slice(0, 3)" :key="`f-${f.id}`">
                <img v-if="f.avatar_url" :src="f.avatar_url" :alt="f.nickname" class="follow-avatar" />
                <span v-else class="follow-avatar follow-avatar-fallback">{{ f.nickname.slice(0, 1).toUpperCase() }}</span>
              </template>
            </div>
            <div><strong>{{ profile.followers_count }}</strong> Follower</div>
          </div>
          <div class="meta-row">
            <div class="follow-avatars">
              <template v-for="f in followingPreview.slice(0, 3)" :key="`g-${f.id}`">
                <img v-if="f.avatar_url" :src="f.avatar_url" :alt="f.nickname" class="follow-avatar" />
                <span v-else class="follow-avatar follow-avatar-fallback">{{ f.nickname.slice(0, 1).toUpperCase() }}</span>
              </template>
            </div>
            <div><strong>{{ profile.following_count }}</strong> Following</div>
          </div>
        </div>

        <div class="center-tabs">
          <button
            type="button"
            :class="{ secondary: tab !== 'elements' }"
            @click="tab = 'elements'"
          >
            Elements <span class="badge">{{ posts.length }}</span>
          </button>
          <button
            type="button"
            :class="{ secondary: tab !== 'collections' }"
            @click="tab = 'collections'"
          >
            Collections <span class="badge">{{ collectionsCount }}</span>
          </button>
        </div>

        <template v-if="tab === 'elements'">
          <div v-if="posts.length" class="post-list">
            <article v-for="p in posts" :key="p.id" class="post-item">
              <RouterLink :to="`/blog/${p.id}`">{{ p.title }}</RouterLink>
              <div class="muted">{{ (p.published_at || p.created_at).slice(0, 10) }}</div>
            </article>
          </div>
          <div v-else class="center-empty">
            <h2>Your taste, on display</h2>
            <p class="muted">Save elements to shape your profile</p>
          </div>
        </template>

        <template v-else>
          <div v-if="auth.token && auth.nickname === profile.nickname && bookmarks.length" class="post-list">
            <article v-for="b in bookmarks" :key="b.id" class="post-item">
              <RouterLink :to="`/blog/${b.id}`">{{ b.title }}</RouterLink>
              <div class="muted">{{ b.author_nickname }} · {{ (b.published_at || b.created_at).slice(0, 10) }}</div>
            </article>
          </div>
          <ul v-else-if="profile.favorite_courses.length" class="course-list">
            <li v-for="c in profile.favorite_courses" :key="c.id">{{ c.title }}</li>
          </ul>
          <div v-else class="center-empty">
            <h2>No collections yet</h2>
            <p class="muted">Saved items and favorites will be shown here</p>
          </div>
        </template>
      </main>
    </div>
  </section>
  <p v-else-if="err" class="error">{{ err }}</p>
  <p v-else class="muted">Loading…</p>
</template>

<style scoped>
.cosmos-profile {
  display: grid;
  gap: 1rem;
}

.profile-grid {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

.profile-side,
.profile-main {
  min-height: 420px;
}

.profile-avatar {
  width: 74px;
  height: 74px;
  border-radius: 999px;
  border: 1px solid var(--border);
  object-fit: cover;
  background: var(--surface2);
}

.profile-avatar-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
}

.bio {
  margin-top: 0.7rem;
  color: var(--muted);
}

.profile-actions {
  margin-top: 0.8rem;
  display: flex;
  gap: 0.5rem;
}

.center-tabs {
  display: inline-flex;
  gap: 0.45rem;
  margin-bottom: 1rem;
}

.main-top-meta {
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  gap: 1.25rem;
  margin-bottom: 0.7rem;
}

.post-list {
  display: grid;
  gap: 0.55rem;
}

.post-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.65rem;
  background: rgba(10, 10, 10, 0.82);
}

.course-list {
  margin: 0;
  padding-left: 1.1rem;
  color: var(--text);
}

.center-empty {
  min-height: 260px;
  display: grid;
  place-content: center;
  text-align: center;
  gap: 0.3rem;
}

.meta-row {
  margin-bottom: 0;
}

.follow-avatars {
  display: flex;
  align-items: center;
  margin-bottom: 0.35rem;
}

.follow-avatar {
  width: 26px;
  height: 26px;
  border-radius: 999px;
  border: 1px solid var(--border);
  object-fit: cover;
  background: var(--surface2);
  margin-left: -7px;
}

.follow-avatars .follow-avatar:first-child {
  margin-left: 0;
}

.follow-avatar-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 700;
}

@media (max-width: 1100px) {
  .profile-grid {
    grid-template-columns: 1fr;
  }

  .profile-side,
  .profile-main {
    min-height: 0;
  }

  .main-top-meta {
    justify-content: flex-start;
  }
}
</style>
