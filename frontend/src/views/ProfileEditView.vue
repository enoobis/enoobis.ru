<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api/http";
import { useAuthStore } from "../stores/auth";

type Me = {
  id: string;
  email: string;
  nickname: string;
  role: string;
  status: string;
  bio: string;
  wallpaper_url: string;
  favorite_course_ids: string[];
};

type Course = { id: string; title: string; is_open: boolean; teacher_nickname: string };

const auth = useAuthStore();
const router = useRouter();
const me = ref<Me | null>(null);
const courses = ref<Course[]>([]);
const bio = ref("");
const wallpaper = ref("");
const favorites = ref<string[]>([]);
const err = ref("");

onMounted(async () => {
  try {
    me.value = await api<Me>("/api/me", { token: auth.token });
    bio.value = me.value.bio;
    wallpaper.value = me.value.wallpaper_url;
    favorites.value = [...me.value.favorite_course_ids];
    const all = await api<
      {
        id: string;
        title: string;
        is_open: boolean;
        teacher_nickname: string;
      }[]
    >("/api/courses", { token: auth.token });
    courses.value = all.map((c) => ({
      id: c.id,
      title: c.title,
      is_open: c.is_open,
      teacher_nickname: c.teacher_nickname,
    }));
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
});

function toggleFav(id: string) {
  const i = favorites.value.indexOf(id);
  if (i >= 0) favorites.value.splice(i, 1);
  else if (favorites.value.length < 12) favorites.value.push(id);
}

async function save() {
  err.value = "";
  try {
    await api("/api/me", {
      method: "PATCH",
      token: auth.token,
      body: JSON.stringify({
        bio: bio.value,
        wallpaper_url: wallpaper.value,
        favorite_course_ids: favorites.value,
      }),
    });
    await router.push(`/u/${auth.nickname}`);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}
</script>

<template>
  <div v-if="me" class="card" style="max-width: 640px">
    <h1>Профиль</h1>
    <p class="muted">
      Ник: <strong>{{ me.nickname }}</strong> · ID:
      <code style="font-family: var(--mono); font-size: 0.85rem">{{ me.id }}</code>
    </p>
    <p v-if="err" class="error">{{ err }}</p>
    <label>О себе</label>
    <textarea v-model="bio" rows="5" />
    <label style="display: block; margin-top: 0.75rem">URL обоев (картинка)</label>
    <input v-model="wallpaper" placeholder="https://..." />
    <h2 style="margin-top: 1.25rem">Избранные курсы</h2>
    <p class="muted">До 12, только из тех, к которым у вас есть доступ в каталоге.</p>
    <ul style="list-style: none; padding: 0">
      <li v-for="c in courses" :key="c.id" style="margin-bottom: 0.35rem">
        <label style="display: flex; gap: 0.5rem; align-items: center; cursor: pointer">
          <input
            type="checkbox"
            style="width: auto"
            :checked="favorites.includes(c.id)"
            @change="toggleFav(c.id)"
          />
          {{ c.title }} — {{ c.teacher_nickname }}
        </label>
      </li>
    </ul>
    <button type="button" style="margin-top: 1rem" @click="save">Сохранить</button>
  </div>
  <p v-else-if="err" class="error">{{ err }}</p>
  <p v-else class="muted">Загрузка…</p>
</template>
