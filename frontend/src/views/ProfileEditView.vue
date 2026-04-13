<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api/http";
import { uploadAvatar } from "../api/uploadAvatar";
import { useAuthStore } from "../stores/auth";

type Me = {
  id: string;
  email: string;
  nickname: string;
  role: string;
  status: string;
  bio: string;
  wallpaper_url: string;
  avatar_url: string;
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
const avatarMsg = ref("");
const uploading = ref(false);

onMounted(async () => {
  try {
    me.value = await api<Me>("/api/me", { token: auth.token });
    bio.value = me.value.bio;
    wallpaper.value = me.value.wallpaper_url;
    avatarMsg.value = "";
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

async function onAvatarFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !auth.token) return;
  err.value = "";
  avatarMsg.value = "";
  uploading.value = true;
  try {
    const r = await uploadAvatar(auth.token, file);
    if (me.value) me.value.avatar_url = r.avatar_url;
    avatarMsg.value = "Аватар обновлён.";
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка загрузки";
  } finally {
    uploading.value = false;
  }
}

async function clearAvatar() {
  if (!auth.token) return;
  err.value = "";
  avatarMsg.value = "";
  try {
    await api("/api/me", {
      method: "PATCH",
      token: auth.token,
      body: JSON.stringify({ avatar_url: "" }),
    });
    if (me.value) me.value.avatar_url = "";
    avatarMsg.value = "Аватар сброшен.";
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
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
    <p v-if="avatarMsg" style="color: var(--accent)">{{ avatarMsg }}</p>

    <h2 style="margin-top: 0">Аватар</h2>
    <div class="avatar-row">
      <div v-if="me.avatar_url" class="avatar-preview-wrap">
        <img :src="me.avatar_url" alt="" class="avatar-preview" />
      </div>
      <div v-else class="avatar-placeholder">{{ me.nickname.slice(0, 2).toUpperCase() }}</div>
      <div class="avatar-actions">
        <label class="btn-file">
          <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" :disabled="uploading" @change="onAvatarFile" />
          {{ uploading ? "Загрузка…" : "Выбрать изображение" }}
        </label>
        <button v-if="me.avatar_url" class="secondary" type="button" @click="clearAvatar">Сбросить</button>
        <p class="muted" style="margin: 0.35rem 0 0">JPEG, PNG, GIF, WebP, до 2 МБ.</p>
      </div>
    </div>

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

<style scoped>
.avatar-row {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}
.avatar-preview-wrap {
  width: 88px;
  height: 88px;
  border-radius: 16px;
  overflow: hidden;
  border: 2px solid var(--accent);
  flex-shrink: 0;
}
.avatar-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.avatar-placeholder {
  width: 88px;
  height: 88px;
  border-radius: 16px;
  background: var(--surface2);
  border: 2px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 1.5rem;
  flex-shrink: 0;
}
.avatar-actions {
  flex: 1;
  min-width: 200px;
}
.btn-file {
  display: inline-block;
  cursor: pointer;
  padding: 0.55rem 1rem;
  border-radius: var(--radius, 12px);
  font-weight: 600;
  background: linear-gradient(135deg, var(--accent, #5eead4), #2dd4bf);
  color: #04120f;
}
.btn-file input {
  display: none;
}
</style>
