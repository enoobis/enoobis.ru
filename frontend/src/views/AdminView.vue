<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "../api/http";
import {
  hideCommentByAdmin,
  hidePostByAdmin,
  listBlogReports,
  resolveBlogReport,
  restoreCommentByAdmin,
  type BlogReport,
} from "../api/blog";
import { useAuthStore } from "../stores/auth";

type Pending = {
  id: string;
  email: string;
  nickname: string;
  role: string;
  created_at: string;
};

type AdminUser = {
  id: string;
  email: string;
  nickname: string;
  role: string;
  status: string;
  created_at: string;
};

const auth = useAuthStore();
const pending = ref<Pending[]>([]);
const users = ref<AdminUser[]>([]);
const err = ref("");
const inviteUserId = ref("");
const inviteCount = ref(2);
const inviteRole = ref<"student" | "teacher">("student");
const roleUserId = ref("");
const roleValue = ref<"student" | "teacher">("student");
const usersQuery = ref("");
const reports = ref<BlogReport[]>([]);

const filteredUsers = computed(() => {
  const q = usersQuery.value.trim().toLowerCase();
  if (!q) return users.value;
  return users.value.filter(
    (u) =>
      u.nickname.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q),
  );
});

async function load() {
  err.value = "";
  try {
    pending.value = await api<Pending[]>("/api/admin/pending", { token: auth.token });
    users.value = await api<AdminUser[]>("/api/admin/users", { token: auth.token });
    reports.value = await listBlogReports(auth.token ?? "");
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

onMounted(load);

async function approve(id: string) {
  await api(`/api/admin/users/${id}/approve`, { method: "POST", token: auth.token });
  await load();
}

async function reject(id: string) {
  await api(`/api/admin/users/${id}/reject`, { method: "POST", token: auth.token });
  await load();
}

async function addInvites() {
  err.value = "";
  try {
    await api(`/api/admin/users/${inviteUserId.value.trim()}/invites`, {
      method: "POST",
      token: auth.token,
      body: JSON.stringify({ count: inviteCount.value, target_role: inviteRole.value }),
    });
    inviteUserId.value = "";
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

async function setUserRole() {
  err.value = "";
  try {
    await api(`/api/admin/users/${roleUserId.value.trim()}/role`, {
      method: "POST",
      token: auth.token,
      body: JSON.stringify({ role: roleValue.value }),
    });
    roleUserId.value = "";
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

async function setUserRoleQuick(id: string, role: "student" | "teacher") {
  if (!auth.token) return;
  await api(`/api/admin/users/${id}/role`, {
    method: "POST",
    token: auth.token,
    body: JSON.stringify({ role }),
  });
  await load();
}

async function addInviteQuick(id: string, targetRole: "student" | "teacher") {
  if (!auth.token) return;
  await api(`/api/admin/users/${id}/invites`, {
    method: "POST",
    token: auth.token,
    body: JSON.stringify({ count: 1, target_role: targetRole }),
  });
  await load();
}

async function resolveReport(id: string, status: "resolved" | "dismissed") {
  if (!auth.token) return;
  await resolveBlogReport(id, status, auth.token);
  reports.value = await listBlogReports(auth.token);
}

async function hidePost(id: string | null) {
  if (!auth.token || !id) return;
  await hidePostByAdmin(id, auth.token);
  reports.value = await listBlogReports(auth.token);
}

async function hideComment(id: string | null) {
  if (!auth.token || !id) return;
  await hideCommentByAdmin(id, auth.token);
  reports.value = await listBlogReports(auth.token);
}

async function restoreComment(id: string | null) {
  if (!auth.token || !id) return;
  await restoreCommentByAdmin(id, auth.token);
  reports.value = await listBlogReports(auth.token);
}
</script>

<template>
  <section>
    <h1>Администрирование</h1>
    <p v-if="err" class="error">{{ err }}</p>

    <div class="card" style="margin-bottom: 1.5rem">
      <h2>Выдать инвайты</h2>
      <input v-model="inviteUserId" placeholder="user uuid" />
      <select v-model="inviteRole" style="margin-top: 0.5rem; max-width: 220px">
        <option value="student">Инвайт на ученика</option>
        <option value="teacher">Инвайт на ментора</option>
      </select>
      <input
        v-model.number="inviteCount"
        type="number"
        min="1"
        max="50"
        style="margin-top: 0.5rem; max-width: 120px"
      />
      <button type="button" style="margin-top: 0.5rem; display: block" @click="addInvites">
        Выдать
      </button>
    </div>

    <div class="card" style="margin-bottom: 1.5rem">
      <h2>Назначить роль пользователю</h2>
      <input v-model="roleUserId" placeholder="user uuid" />
      <select v-model="roleValue" style="margin-top: 0.5rem; max-width: 220px">
        <option value="student">Сделать учеником</option>
        <option value="teacher">Сделать ментором</option>
      </select>
      <button type="button" style="margin-top: 0.5rem; display: block" @click="setUserRole">
        Применить
      </button>
    </div>

    <h2>Ожидают одобрения</h2>
    <p v-if="!pending.length" class="muted">Пусто</p>
    <div v-for="u in pending" :key="u.id" class="card" style="margin-bottom: 0.75rem">
      <strong>{{ u.nickname }}</strong> ({{ u.role }}) — {{ u.email }}
      <div class="muted" style="font-family: var(--mono); font-size: 0.8rem">{{ u.id }}</div>
      <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem">
        <button type="button" @click="approve(u.id)">Одобрить</button>
        <button class="secondary" type="button" @click="reject(u.id)">Отклонить</button>
      </div>
    </div>

    <h2 style="margin-top: 2rem">Все пользователи</h2>
    <input
      v-model="usersQuery"
      placeholder="поиск: ник, email, uuid"
      style="margin-bottom: 0.75rem; max-width: 420px"
    />
    <p v-if="!filteredUsers.length" class="muted">Пользователи не найдены.</p>
    <div v-for="u in filteredUsers" :key="`all-${u.id}`" class="card" style="margin-bottom: 0.75rem">
      <strong>{{ u.nickname }}</strong> — {{ u.email }}
      <div class="muted">роль: {{ u.role }} · статус: {{ u.status }}</div>
      <div class="muted" style="font-family: var(--mono); font-size: 0.8rem">{{ u.id }}</div>
      <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap">
        <button
          class="secondary"
          type="button"
          :disabled="u.role === 'student'"
          @click="setUserRoleQuick(u.id, 'student')"
        >
          Сделать учеником
        </button>
        <button
          class="secondary"
          type="button"
          :disabled="u.role === 'teacher' || u.role === 'admin'"
          @click="setUserRoleQuick(u.id, 'teacher')"
        >
          Сделать ментором
        </button>
        <button class="secondary" type="button" @click="addInviteQuick(u.id, 'student')">
          + Инвайт ученика
        </button>
        <button class="secondary" type="button" @click="addInviteQuick(u.id, 'teacher')">
          + Инвайт ментора
        </button>
      </div>
    </div>

    <h2 style="margin-top: 2rem">Модерация блога</h2>
    <p v-if="!reports.length" class="muted">Жалоб пока нет.</p>
    <div v-for="r in reports" :key="r.id" class="card" style="margin-bottom: 0.75rem">
      <div>
        <strong>{{ r.target_type === "post" ? "Пост" : "Комментарий" }}</strong>
        · <span class="badge">{{ r.status }}</span>
      </div>
      <div class="muted" style="margin-top: 0.35rem">{{ r.reason }}</div>
      <div class="muted" style="margin-top: 0.35rem">
        post: {{ r.target_post_id || "-" }} · comment: {{ r.target_comment_id || "-" }}
      </div>
      <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap">
        <button class="secondary" type="button" @click="resolveReport(r.id, 'resolved')">Решено</button>
        <button class="secondary" type="button" @click="resolveReport(r.id, 'dismissed')">Отклонить</button>
        <button
          v-if="r.target_type === 'post'"
          class="secondary"
          type="button"
          @click="hidePost(r.target_post_id)"
        >
          Скрыть пост
        </button>
        <button
          v-if="r.target_type === 'comment'"
          class="secondary"
          type="button"
          @click="hideComment(r.target_comment_id)"
        >
          Скрыть комментарий
        </button>
        <button
          v-if="r.target_type === 'comment'"
          class="secondary"
          type="button"
          @click="restoreComment(r.target_comment_id)"
        >
          Восстановить комментарий
        </button>
      </div>
    </div>
  </section>
</template>
