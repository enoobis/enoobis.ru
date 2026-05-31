<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import AppIcon from "../components/AppIcon.vue";
import { api } from "../api/http";
import { useAuthStore } from "../stores/auth";
import { useProfileOwnerThemeFromApi } from "../composables/useProfileOwnerTheme";

type Tab = "followers" | "following";
type FollowItem = {
  id: string;
  nickname: string;
  avatar_url: string;
  full_name: string;
  is_following: boolean;
  is_me: boolean;
};

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const nick = computed(() => route.params.nickname as string);
const tab = ref<Tab>(route.query.tab === "following" ? "following" : "followers");
const followers = ref<FollowItem[]>([]);
const following = ref<FollowItem[]>([]);
const loading = ref(false);
const err = ref("");
const busy = ref<Record<string, boolean>>({});

const list = computed(() => (tab.value === "followers" ? followers.value : following.value));

async function load() {
  err.value = "";
  loading.value = true;
  try {
    const [a, b] = await Promise.all([
      api<FollowItem[]>(`/api/profile/${nick.value}/followers`, { token: auth.token }),
      api<FollowItem[]>(`/api/profile/${nick.value}/following`, { token: auth.token }),
    ]);
    followers.value = a;
    following.value = b;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    loading.value = false;
  }
}

function setTab(t: Tab) {
  tab.value = t;
  router.replace({ query: { ...route.query, tab: t } }).catch(() => undefined);
}

async function toggleFollow(u: FollowItem) {
  if (!auth.token || u.is_me || busy.value[u.id]) return;
  busy.value[u.id] = true;
  try {
    const path = `/api/profile/${u.nickname}/follow`;
    if (u.is_following) {
      await api(path, { method: "DELETE", token: auth.token });
      u.is_following = false;
    } else {
      await api(path, { method: "POST", token: auth.token });
      u.is_following = true;
    }
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    busy.value[u.id] = false;
  }
}

function back() {
  if (window.history.state?.back) {
    router.back();
  } else {
    router.push(`/u/${nick.value}`);
  }
}

onMounted(load);
watch(nick, load);

useProfileOwnerThemeFromApi(nick);
</script>

<template>
  <section class="follows">
    <header class="head">
      <button type="button" class="back" aria-label="назад" @click="back">
        <AppIcon name="back" :size="18" />
      </button>
      <RouterLink :to="`/u/${nick}`" class="who muted">@{{ nick }}</RouterLink>
    </header>

    <nav class="tabs">
      <button
        type="button"
        class="tab"
        :class="{ on: tab === 'followers' }"
        @click="setTab('followers')"
      >
        <span>подписчики</span>
        <span class="count">{{ followers.length }}</span>
      </button>
      <button
        type="button"
        class="tab"
        :class="{ on: tab === 'following' }"
        @click="setTab('following')"
      >
        <span>подписки</span>
        <span class="count">{{ following.length }}</span>
      </button>
    </nav>

    <p v-if="err" class="error">{{ err }}</p>
    <p v-else-if="loading" class="muted center">загрузка</p>
    <p v-else-if="!list.length" class="muted center">пусто</p>
    <ul v-else class="list">
      <li v-for="u in list" :key="u.id" class="row">
        <RouterLink :to="`/u/${u.nickname}`" class="user">
          <img v-if="u.avatar_url" :src="u.avatar_url" alt="" />
          <span v-else class="ava-fb">{{ u.nickname.slice(0, 2) }}</span>
          <span class="names">
            <strong>{{ u.nickname }}</strong>
            <span v-if="u.full_name" class="muted small">{{ u.full_name }}</span>
          </span>
        </RouterLink>
        <button
          v-if="auth.token && !u.is_me"
          type="button"
          class="follow-btn"
          :class="{ following: u.is_following }"
          :disabled="busy[u.id]"
          @click="toggleFollow(u)"
        >
          {{ u.is_following ? "отписаться" : "подписаться" }}
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.follows {
  max-width: 640px;
  margin: 0 auto;
}
.head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.2rem 0 0.8rem;
}
.back {
  width: 32px;
  height: 32px;
  min-height: 0;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.back:hover {
  background: var(--surface2);
}
.who {
  font-size: 0.9rem;
}
.tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid var(--border);
  margin-bottom: 0.6rem;
}
.tab {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  padding: 0.55rem 0.5rem;
  min-height: 0;
  color: var(--muted);
  cursor: pointer;
}
.tab:hover {
  background: transparent;
  color: var(--text);
}
.tab.on {
  color: var(--text);
  border-bottom-color: var(--text);
}
.count {
  font-size: 0.85rem;
  color: var(--muted);
}
.tab.on .count {
  color: var(--text);
}

.center {
  text-align: center;
  margin-top: 1.2rem;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.2rem;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.5rem 0.4rem;
  border-radius: var(--radius);
}
.row:hover {
  background: var(--surface2);
}
.user {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
  color: var(--text);
  flex: 1;
}
.user:hover {
  text-decoration: none;
}
.user img,
.user .ava-fb {
  width: 38px;
  height: 38px;
  border-radius: var(--avatar-radius);
  border: 1px solid var(--border);
  object-fit: cover;
  background: var(--surface);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 500;
  flex-shrink: 0;
}
.names {
  display: grid;
  gap: 0.05rem;
  min-width: 0;
}
.names strong {
  font-weight: 500;
  font-size: 0.92rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.small {
  font-size: 0.78rem;
}
.follow-btn {
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  font-size: 0.82rem;
  border: 1px solid var(--text);
  background: var(--text);
  color: var(--bg);
  min-height: 0;
  flex-shrink: 0;
}
.follow-btn:hover {
  background: var(--text);
  opacity: 0.85;
}
.follow-btn.following {
  background: transparent;
  color: var(--text);
  border-color: var(--border);
}
.follow-btn.following:hover {
  background: var(--surface2);
  opacity: 1;
}
.follow-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
