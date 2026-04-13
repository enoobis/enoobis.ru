<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "../api/http";
import { useAuthStore } from "../stores/auth";

type Course = {
  id: string;
  title: string;
  description: string;
  is_open: boolean;
  teacher_id: string;
  teacher_nickname: string;
  created_at: string;
  enrolled: boolean;
};

const auth = useAuthStore();
const courses = ref<Course[]>([]);
const err = ref("");
const title = ref("");
const description = ref("");
const isOpen = ref(true);
const studentsDraft = ref("");
const activeClosedId = ref<string | null>(null);

const canTeach = computed(() => auth.role === "teacher" || auth.role === "admin");

async function load() {
  err.value = "";
  try {
    courses.value = await api<Course[]>("/api/courses", { token: auth.token });
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

onMounted(load);

async function createCourse() {
  err.value = "";
  try {
    await api("/api/courses", {
      method: "POST",
      token: auth.token,
      body: JSON.stringify({
        title: title.value,
        description: description.value,
        is_open: isOpen.value,
      }),
    });
    title.value = "";
    description.value = "";
    await load();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

async function enroll(id: string) {
  err.value = "";
  try {
    await api(`/api/courses/${id}/enroll`, { method: "POST", token: auth.token });
    await load();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

async function unenroll(id: string) {
  err.value = "";
  try {
    await api(`/api/courses/${id}/enroll`, { method: "DELETE", token: auth.token });
    await load();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

function openClosedEditor(c: Course) {
  if (!canTeach.value || c.teacher_id !== auth.user?.id) return;
  activeClosedId.value = c.id;
  studentsDraft.value = "";
}

async function saveClosedStudents() {
  if (!activeClosedId.value) return;
  const ids = studentsDraft.value
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  err.value = "";
  try {
    await api(`/api/courses/${activeClosedId.value}/students`, {
      method: "POST",
      token: auth.token,
      body: JSON.stringify({ student_ids: ids }),
    });
    activeClosedId.value = null;
    await load();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}
</script>

<template>
  <section>
    <h1>Курсы</h1>
    <p class="muted">Открытые видны всем; закрытые — только добавленным ученикам (и автору).</p>
    <p v-if="err" class="error">{{ err }}</p>

    <div v-if="canTeach" class="card" style="margin-bottom: 1.5rem">
      <h2>Новый курс</h2>
      <input v-model="title" placeholder="Название" />
      <textarea v-model="description" placeholder="Описание" rows="3" style="margin-top: 0.5rem" />
      <label style="display: flex; gap: 0.5rem; align-items: center; margin-top: 0.5rem">
        <input v-model="isOpen" type="checkbox" style="width: auto" />
        Открытый курс
      </label>
      <button type="button" style="margin-top: 0.75rem" @click="createCourse">Создать</button>
    </div>

    <div v-for="c in courses" :key="c.id" class="card" style="margin-bottom: 1rem">
      <div style="display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap">
        <div>
          <h2 style="font-size: 1.1rem">{{ c.title }}</h2>
          <div class="muted">
            {{ c.teacher_nickname }}
            <span class="badge">{{ c.is_open ? "открытый" : "закрытый" }}</span>
          </div>
          <p style="margin: 0.5rem 0 0">{{ c.description }}</p>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.35rem; align-items: flex-end">
          <template v-if="c.is_open">
            <button v-if="!c.enrolled" type="button" @click="enroll(c.id)">Записаться</button>
            <button v-else class="secondary" type="button" @click="unenroll(c.id)">Покинуть</button>
          </template>
          <template v-else>
            <span v-if="c.enrolled" class="badge">доступ есть</span>
            <span v-else class="muted">нет доступа</span>
            <button
              v-if="canTeach && c.teacher_id === auth.user?.id"
              class="secondary"
              type="button"
              @click="openClosedEditor(c)"
            >
              Ученики (UUID)
            </button>
          </template>
        </div>
      </div>
    </div>

    <div v-if="activeClosedId" class="card" style="margin-top: 1rem">
      <h3>Доступ к закрытому курсу</h3>
      <p class="muted">Введите UUID учеников через пробел или с новой строки (из профиля / админки).</p>
      <textarea v-model="studentsDraft" rows="4" placeholder="uuid..." />
      <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem">
        <button type="button" @click="saveClosedStudents">Сохранить</button>
        <button class="secondary" type="button" @click="activeClosedId = null">Отмена</button>
      </div>
    </div>
  </section>
</template>
