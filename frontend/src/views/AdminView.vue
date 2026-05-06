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
import { patchAdminUserProfile, uploadAdminUserAvatar } from "../api/adminUsers";
import { useAuthStore } from "../stores/auth";

type Pending = { id: string; email: string; nickname: string; role: string; created_at: string };
type AdminUser = {
  id: string;
  email: string;
  nickname: string;
  role: string;
  status: string;
  created_at: string;
  bio: string;
  avatar_url: string;
  wallpaper_url: string;
};
type Tab = "pending" | "users" | "reports";

const auth = useAuthStore();
const tab = ref<Tab>("pending");
const pending = ref<Pending[]>([]);
const users = ref<AdminUser[]>([]);
const reports = ref<BlogReport[]>([]);
const err = ref("");
const usersQuery = ref("");
const moderateUserId = ref<string | null>(null);
const moderateBio = ref("");
const modMsg = ref("");
const modBusy = ref(false);

const moderateUser = computed(() => {
  if (!moderateUserId.value) return null;
  return users.value.find((u) => u.id === moderateUserId.value) ?? null;
});

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
    err.value = e instanceof Error ? e.message : "ошибка";
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

async function setRole(id: string, role: "student" | "teacher") {
  if (!auth.token) return;
  await api(`/api/admin/users/${id}/role`, {
    method: "POST",
    token: auth.token,
    body: JSON.stringify({ role }),
  });
  await load();
}

async function removeUser(id: string, nickname: string) {
  if (!auth.token) return;
  if (!window.confirm(`удалить пользователя ${nickname}? это действие необратимо`)) return;
  err.value = "";
  try {
    await api(`/api/admin/users/${id}`, {
      method: "DELETE",
      token: auth.token,
    });
    await load();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

async function addInvite(id: string, role: "student" | "teacher") {
  if (!auth.token) return;
  await api(`/api/admin/users/${id}/invites`, {
    method: "POST",
    token: auth.token,
    body: JSON.stringify({ count: 1, target_role: role }),
  });
  await load();
}

function openModerate(u: AdminUser) {
  moderateUserId.value = u.id;
  moderateBio.value = u.bio ?? "";
  modMsg.value = "";
}

function closeModerate() {
  moderateUserId.value = null;
  modMsg.value = "";
}

async function saveModerateBio() {
  if (!auth.token || !moderateUserId.value) return;
  modBusy.value = true;
  modMsg.value = "";
  try {
    await patchAdminUserProfile(auth.token, moderateUserId.value, { bio: moderateBio.value });
    await load();
    modMsg.value = "сохранено";
  } catch (e) {
    modMsg.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    modBusy.value = false;
  }
}

async function onModerateAvatarFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !auth.token || !moderateUserId.value) return;
  modBusy.value = true;
  modMsg.value = "";
  try {
    await uploadAdminUserAvatar(auth.token, moderateUserId.value, file);
    await load();
    modMsg.value = "аватар обновлён";
  } catch (e) {
    modMsg.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    modBusy.value = false;
  }
}

async function resetModerateAvatar() {
  if (!auth.token || !moderateUserId.value) return;
  modBusy.value = true;
  modMsg.value = "";
  try {
    await patchAdminUserProfile(auth.token, moderateUserId.value, { avatar_url: "" });
    await load();
    modMsg.value = "аватар сброшен";
  } catch (e) {
    modMsg.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    modBusy.value = false;
  }
}

async function clearModerateWallpaper() {
  if (!auth.token || !moderateUserId.value) return;
  modBusy.value = true;
  modMsg.value = "";
  try {
    await patchAdminUserProfile(auth.token, moderateUserId.value, { wallpaper_url: "" });
    await load();
    modMsg.value = "обои убраны";
  } catch (e) {
    modMsg.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    modBusy.value = false;
  }
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
  <section class="admin">
    <nav class="tabs">
      <button class="link" :class="{ active: tab === 'pending' }" type="button" @click="tab = 'pending'">
        заявки <span v-if="pending.length" class="muted small">{{ pending.length }}</span>
      </button>
      <button class="link" :class="{ active: tab === 'users' }" type="button" @click="tab = 'users'">
        пользователи
      </button>
      <button class="link" :class="{ active: tab === 'reports' }" type="button" @click="tab = 'reports'">
        жалобы <span v-if="reports.length" class="muted small">{{ reports.length }}</span>
      </button>
    </nav>

    <p v-if="err" class="error">{{ err }}</p>

    <template v-if="tab === 'pending'">
      <p v-if="!pending.length" class="muted">пусто</p>
      <ul v-else class="list">
        <li v-for="u in pending" :key="u.id">
          <div>
            <strong>{{ u.nickname }}</strong>
            <span class="muted small"> · {{ u.role }} · {{ u.email }}</span>
          </div>
          <div class="row-actions">
            <button type="button" @click="approve(u.id)">одобрить</button>
            <button class="secondary" type="button" @click="reject(u.id)">отклонить</button>
            <button class="secondary danger" type="button" @click="removeUser(u.id, u.nickname)">
              удалить
            </button>
          </div>
        </li>
      </ul>
    </template>

    <template v-else-if="tab === 'users'">
      <input v-model="usersQuery" placeholder="поиск" class="search" />
      <div v-if="moderateUser" class="mod-panel">
        <p class="mod-title">
          <strong>{{ moderateUser.nickname }}</strong>
          <span class="muted small"> · модерация профиля</span>
        </p>
        <div v-if="moderateUser.avatar_url" class="mod-avatar">
          <img :src="moderateUser.avatar_url" alt="" />
        </div>
        <textarea v-model="moderateBio" class="mod-bio" rows="3" placeholder="описание в профиле" />
        <div class="mod-actions">
          <button type="button" :disabled="modBusy" @click="saveModerateBio">сохранить описание</button>
          <label class="file-label secondary">
            новый аватар
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              :disabled="modBusy"
              hidden
              @change="onModerateAvatarFile"
            />
          </label>
          <button class="secondary" type="button" :disabled="modBusy" @click="resetModerateAvatar">
            сбросить аватар
          </button>
          <button class="secondary" type="button" :disabled="modBusy" @click="clearModerateWallpaper">
            убрать обои
          </button>
          <button class="secondary" type="button" :disabled="modBusy" @click="closeModerate">закрыть</button>
        </div>
        <p v-if="modMsg" class="muted small">{{ modMsg }}</p>
      </div>
      <p v-if="!filteredUsers.length" class="muted">не найдено</p>
      <ul v-else class="list">
        <li v-for="u in filteredUsers" :key="u.id">
          <div>
            <strong>{{ u.nickname }}</strong>
            <span class="muted small"> · {{ u.role }} · {{ u.status }} · {{ u.email }}</span>
          </div>
          <div class="row-actions">
            <button class="secondary" type="button" :disabled="modBusy" @click="openModerate(u)">модерация</button>
            <button class="secondary" type="button" :disabled="u.role === 'student'" @click="setRole(u.id, 'student')">
              ученик
            </button>
            <button class="secondary" type="button" :disabled="u.role === 'teacher' || u.role === 'admin'" @click="setRole(u.id, 'teacher')">
              ментор
            </button>
            <button class="secondary" type="button" @click="addInvite(u.id, 'student')">+ инвайт</button>
            <button
              v-if="u.role !== 'admin'"
              class="secondary danger"
              type="button"
              @click="removeUser(u.id, u.nickname)"
            >
              удалить
            </button>
          </div>
        </li>
      </ul>
    </template>

    <template v-else-if="tab === 'reports'">
      <p v-if="!reports.length" class="muted">пусто</p>
      <ul v-else class="list">
        <li v-for="r in reports" :key="r.id">
          <div>
            <span class="badge">{{ r.target_type === "post" ? "пост" : "коммент" }}</span>
            <span class="muted small"> · {{ r.status }}</span>
          </div>
          <p class="reason">{{ r.reason }}</p>
          <div class="row-actions">
            <button class="secondary" type="button" @click="resolveReport(r.id, 'resolved')">решено</button>
            <button class="secondary" type="button" @click="resolveReport(r.id, 'dismissed')">отклонить</button>
            <button v-if="r.target_type === 'post'" class="secondary" type="button" @click="hidePost(r.target_post_id)">
              скрыть
            </button>
            <button v-if="r.target_type === 'comment'" class="secondary" type="button" @click="hideComment(r.target_comment_id)">
              скрыть
            </button>
            <button v-if="r.target_type === 'comment'" class="secondary" type="button" @click="restoreComment(r.target_comment_id)">
              вернуть
            </button>
          </div>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.admin {
  max-width: 720px;
  margin: 0 auto;
}
.tabs {
  display: flex;
  gap: 0.4rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.5rem;
  margin-bottom: 1.5rem;
}
.link {
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 0.3rem 0.5rem;
  min-height: 0;
  font-size: 0.9rem;
}
.link:hover {
  background: transparent;
  color: var(--text);
}
.link.active {
  color: var(--text);
}
.search {
  margin-bottom: 1rem;
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 1.2rem;
}
.list li {
  display: grid;
  gap: 0.4rem;
  padding-bottom: 1.2rem;
  border-bottom: 1px solid var(--border);
}
.list li:last-child {
  border-bottom: none;
}
.row-actions {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.row-actions .danger {
  color: var(--danger, #c44);
  border-color: var(--danger, #c44);
}
.row-actions .danger:hover {
  background: var(--danger, #c44);
  color: var(--bg);
}
.reason {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}
.small {
  font-size: 0.8rem;
}
strong {
  font-weight: 500;
}
.mod-panel {
  margin-bottom: 1.25rem;
  padding: 1rem 0;
  border-bottom: 1px solid var(--border);
  display: grid;
  gap: 0.6rem;
}
.mod-title {
  margin: 0;
}
.mod-avatar img {
  width: 48px;
  height: 48px;
  border-radius: var(--radius);
  object-fit: cover;
}
.mod-bio {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  font: inherit;
  padding: 0.5rem;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  border-radius: var(--radius);
}
.mod-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}
.file-label.secondary {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 0.9rem;
}
.file-label.secondary:hover {
  background: var(--surface);
}
</style>
