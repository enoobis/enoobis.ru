<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api/http";
import { useAuthStore } from "../stores/auth";

type Profile = {
  nickname: string;
  role: string;
  bio: string;
  wallpaper_url: string;
  avatar_url: string;
  favorite_courses: { id: string; title: string }[];
  achievements: {
    slug: string;
    name: string;
    description: string;
    icon_url: string;
    earned_at: string;
  }[];
};

const route = useRoute();
const auth = useAuthStore();
const profile = ref<Profile | null>(null);
const err = ref("");
const avatarBroken = ref(false);

const nick = computed(() => route.params.nickname as string);

async function load() {
  err.value = "";
  avatarBroken.value = false;
  profile.value = null;
  try {
    profile.value = await api<Profile>(`/api/profile/${nick.value}`);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

onMounted(load);
watch(nick, load);

const bgStyle = computed(() => {
  const w = profile.value?.wallpaper_url;
  if (!w) return {};
  return {
    backgroundImage: `linear-gradient(120deg, rgba(12,14,20,0.92), rgba(12,14,20,0.75)), url(${w})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
});
</script>

<template>
  <section v-if="profile">
    <div class="card profile-hero" :style="bgStyle">
      <div class="profile-head">
        <img
          v-if="profile.avatar_url && !avatarBroken"
          class="avatar avatar-img"
          :src="profile.avatar_url"
          alt=""
          @error="avatarBroken = true"
        />
        <div v-else class="avatar">{{ profile.nickname.slice(0, 2).toUpperCase() }}</div>
        <div>
          <h1>{{ profile.nickname }}</h1>
          <span class="badge">{{ profile.role }}</span>
          <p style="margin-top: 0.75rem; max-width: 52ch">{{ profile.bio || "Нет описания." }}</p>
          <RouterLink
            v-if="auth.token && auth.nickname === profile.nickname"
            to="/me/edit"
            style="display: inline-block; margin-top: 0.5rem"
          >
            Редактировать профиль
          </RouterLink>
        </div>
      </div>
    </div>

    <div class="grid-2" style="margin-top: 1rem">
      <div class="card">
        <h2>Достижения</h2>
        <ul style="list-style: none; padding: 0; margin: 0">
          <li
            v-for="a in profile.achievements"
            :key="a.slug + a.earned_at"
            style="display: flex; gap: 0.75rem; margin-bottom: 0.75rem"
          >
            <span style="font-size: 1.5rem">{{ a.icon_url || "🏅" }}</span>
            <div>
              <strong>{{ a.name }}</strong>
              <div class="muted">{{ a.description }}</div>
            </div>
          </li>
          <li v-if="!profile.achievements.length" class="muted">Пока нет.</li>
        </ul>
      </div>
      <div class="card">
        <h2>Избранные курсы</h2>
        <ul>
          <li v-for="c in profile.favorite_courses" :key="c.id">{{ c.title }}</li>
          <li v-if="!profile.favorite_courses.length" class="muted">Не выбраны.</li>
        </ul>
      </div>
    </div>
  </section>
  <p v-else-if="err" class="error">{{ err }}</p>
  <p v-else class="muted">Загрузка…</p>
</template>

<style scoped>
.profile-hero {
  min-height: 200px;
}
.profile-head {
  display: flex;
  gap: 1.25rem;
  align-items: flex-start;
}
.avatar {
  width: 88px;
  height: 88px;
  border-radius: 16px;
  background: var(--surface2);
  border: 2px solid var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 1.5rem;
  flex-shrink: 0;
}
.avatar-img {
  object-fit: cover;
  display: block;
  padding: 0;
}
</style>
