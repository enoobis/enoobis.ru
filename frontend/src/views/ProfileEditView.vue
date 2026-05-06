<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api/http";
import { uploadAvatar } from "../api/uploadAvatar";
import { changeMyPassword } from "../api/profile";
import AppIcon from "../components/AppIcon.vue";
import { useAuthStore } from "../stores/auth";
import { applyUserPreferences } from "../utils/preferences";
import { toastError, toastSuccess } from "../utils/toast";

const README_MAX = 4000;

type SocialLink = {
  name: string;
  url: string;
};

type Me = {
  id: string;
  email: string;
  nickname: string;
  role: string;
  status: string;
  bio: string;
  wallpaper_url: string;
  avatar_url: string;
  readme_md: string;
  language_preference: "ru" | "en";
  full_name: string;
  website_url: string;
  social_links: SocialLink[];
  birthday: string;
  country: string;
  nickname_change_count: number;
};

const MAX_NICK_CHANGES = 3;

type InviteLink = {
  id: string;
  code: string;
  target_role: string;
  max_uses: number;
  used_count: number;
  remaining: number;
  unlimited?: boolean;
  created_at: string;
};
type SettingsTab = "profile" | "account" | "security" | "invites";

const auth = useAuthStore();
const router = useRouter();
const me = ref<Me | null>(null);
const tab = ref<SettingsTab>("profile");

const bio = ref("");
const readmeMd = ref("");
const languagePreference = ref<"ru" | "en">("ru");
const fullName = ref("");
const websiteUrl = ref("");
const socialLinks = ref<SocialLink[]>([]);
const birthday = ref("");
const country = ref("");

const err = ref("");
const avatarMsg = ref("");
const uploadingAvatar = ref(false);
const saving = ref(false);

const invites = ref<InviteLink[]>([]);
const invitesLoading = ref(false);

const currentPassword = ref("");
const newPassword = ref("");
const changingPassword = ref(false);

const newNick = ref("");
const nickStatus = ref<"idle" | "checking" | "ok" | "err">("idle");
const nickMessage = ref("");
const changingNick = ref(false);
let nickTimer: ReturnType<typeof setTimeout> | null = null;

const nickChangesLeft = computed(() => {
  if (!me.value) return MAX_NICK_CHANGES;
  return Math.max(0, MAX_NICK_CHANGES - (me.value.nickname_change_count ?? 0));
});

function onNickInput() {
  nickStatus.value = "idle";
  nickMessage.value = "";
  if (nickTimer) clearTimeout(nickTimer);
  const v = newNick.value.trim();
  if (!v) return;
  nickStatus.value = "checking";
  nickTimer = setTimeout(checkNick, 350);
}

async function checkNick() {
  if (!auth.token) return;
  const v = newNick.value.trim();
  if (!v) {
    nickStatus.value = "idle";
    return;
  }
  try {
    const r = await api<{ available: boolean; reason?: string }>(
      `/api/me/nickname/check?nickname=${encodeURIComponent(v)}`,
      { token: auth.token },
    );
    if (r.available) {
      nickStatus.value = "ok";
      nickMessage.value = "ник свободен";
    } else {
      nickStatus.value = "err";
      nickMessage.value = r.reason ?? "недоступен";
    }
  } catch (e) {
    nickStatus.value = "err";
    nickMessage.value = e instanceof Error ? e.message : "ошибка";
  }
}

async function changeNickname() {
  if (!auth.token || !me.value || changingNick.value) return;
  if (nickChangesLeft.value <= 0) return;
  if (nickStatus.value !== "ok") return;
  err.value = "";
  changingNick.value = true;
  try {
    const r = await api<{ nickname: string; changes_used: number; changes_left: number }>(
      "/api/me/nickname",
      {
        method: "POST",
        token: auth.token,
        body: JSON.stringify({ nickname: newNick.value.trim() }),
      },
    );
    if (me.value) {
      me.value.nickname = r.nickname;
      me.value.nickname_change_count = r.changes_used;
    }
    if (auth.user) {
      auth.applySession(auth.token, { ...auth.user, nickname: r.nickname });
    }
    newNick.value = "";
    nickStatus.value = "idle";
    nickMessage.value = "";
    toastSuccess("ник обновлён");
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
    toastError(e);
  } finally {
    changingNick.value = false;
  }
}

function fullInviteUrl(code: string) {
  const base = `${window.location.origin}/register`;
  return `${base}?invite=${encodeURIComponent(code)}`;
}

async function loadInvites() {
  if (!auth.token) return;
  invitesLoading.value = true;
  try {
    invites.value = await api<InviteLink[]>("/api/me/invites", { token: auth.token });
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    invitesLoading.value = false;
  }
}

async function onChangePassword() {
  if (!auth.token) return;
  err.value = "";
  changingPassword.value = true;
  try {
    await changeMyPassword(auth.token, currentPassword.value, newPassword.value);
    currentPassword.value = "";
    newPassword.value = "";
    avatarMsg.value = "пароль обновлён";
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    changingPassword.value = false;
  }
}

onMounted(async () => {
  try {
    me.value = await api<Me>("/api/me", { token: auth.token });
    bio.value = me.value.bio;
    readmeMd.value = me.value.readme_md ?? "";
    languagePreference.value = me.value.language_preference;
    fullName.value = me.value.full_name ?? "";
    websiteUrl.value = me.value.website_url ?? "";
    socialLinks.value = Array.isArray(me.value.social_links) ? [...me.value.social_links] : [];
    birthday.value = me.value.birthday ?? "";
    country.value = me.value.country ?? "";
    applyUserPreferences({ language_preference: me.value.language_preference });
    avatarMsg.value = "";
    await loadInvites();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
});

function addSocialLink() {
  if (socialLinks.value.length >= 12) return;
  socialLinks.value.push({ name: "", url: "" });
}

function removeSocialLink(idx: number) {
  socialLinks.value.splice(idx, 1);
}

async function onAvatarFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !auth.token) return;
  err.value = "";
  avatarMsg.value = "";
  uploadingAvatar.value = true;
  try {
    const r = await uploadAvatar(auth.token, file);
    if (me.value) me.value.avatar_url = r.avatar_url;
    avatarMsg.value = "аватар обновлён";
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    uploadingAvatar.value = false;
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
    avatarMsg.value = "аватар убран";
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

async function save() {
  if (!auth.token || saving.value) return;
  err.value = "";
  saving.value = true;
  try {
    await api("/api/me", {
      method: "PATCH",
      token: auth.token,
      body: JSON.stringify({
        bio: bio.value,
        readme_md: readmeMd.value,
        language_preference: languagePreference.value,
        full_name: fullName.value,
        website_url: websiteUrl.value,
        social_links: socialLinks.value,
        birthday: birthday.value,
        country: country.value,
      }),
    });
    applyUserPreferences({ language_preference: languagePreference.value });
    toastSuccess("сохранено");
    await router.push(`/u/${auth.nickname}`);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
    toastError(e);
  } finally {
    saving.value = false;
  }
}

function closeSettings() {
  router.push(`/u/${auth.nickname}`);
}
</script>

<template>
  <section v-if="me" class="settings-shell">
    <aside class="settings-nav card">
      <button class="close-btn secondary" type="button" @click="closeSettings">
        <AppIcon name="close" />
      </button>
      <button class="nav-item" :class="{ active: tab === 'profile' }" type="button" @click="tab = 'profile'">
        <AppIcon name="profile" :size="18" /><span>профиль</span>
      </button>
      <button class="nav-item" :class="{ active: tab === 'account' }" type="button" @click="tab = 'account'">
        <AppIcon name="settings" :size="18" /><span>аккаунт</span>
      </button>
      <button class="nav-item" :class="{ active: tab === 'security' }" type="button" @click="tab = 'security'">
        <AppIcon name="admin" :size="18" /><span>безопасность</span>
      </button>
      <button class="nav-item" :class="{ active: tab === 'invites' }" type="button" @click="tab = 'invites'">
        <AppIcon name="invites" :size="18" /><span>инвайты</span>
      </button>
    </aside>

    <div class="settings-main card">
      <p v-if="err" class="error">{{ err }}</p>
      <p v-if="avatarMsg" class="ok">{{ avatarMsg }}</p>

      <template v-if="tab === 'profile'">
        <h1>профиль</h1>
        <div class="avatar-header">
          <div v-if="me.avatar_url" class="avatar-preview-wrap">
            <img :src="me.avatar_url" alt="" class="avatar-preview" />
          </div>
          <div v-else class="avatar-placeholder">{{ me.nickname.slice(0, 2) }}</div>
          <div class="avatar-actions">
            <label class="btn-file">
              <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" :disabled="uploadingAvatar" @change="onAvatarFile" />
              {{ uploadingAvatar ? "загрузка…" : "загрузить фото" }}
            </label>
            <button v-if="me.avatar_url" class="secondary" type="button" @click="clearAvatar">убрать</button>
          </div>
        </div>

        <div class="form-grid">
          <label>
            <span>ник</span>
            <input :value="`@${me.nickname}`" disabled />
          </label>
          <label>
            <span>имя</span>
            <input v-model="fullName" />
          </label>
          <label class="col-2">
            <span>био</span>
            <textarea v-model="bio" rows="3" maxlength="680" />
          </label>
          <label class="col-2">
            <span>сайт</span>
            <input v-model="websiteUrl" />
          </label>
          <label class="col-2">
            <span>readme · markdown, отображается в профиле</span>
            <textarea
              v-model="readmeMd"
              rows="10"
              :maxlength="README_MAX"
              placeholder="# привет&#10;немного о себе, проекты, ссылки…"
              class="readme-input"
            />
            <span class="readme-counter muted">{{ readmeMd.length }} / {{ README_MAX }}</span>
          </label>
        </div>

        <div class="socials">
          <div class="socials-head">
            <h2>соцсети</h2>
            <button class="secondary" type="button" @click="addSocialLink">+ ссылка</button>
          </div>
          <div v-for="(s, i) in socialLinks" :key="`social-${i}`" class="social-row">
            <input v-model="s.name" placeholder="название" />
            <input v-model="s.url" placeholder="https://" />
            <button class="secondary social-remove" type="button" @click="removeSocialLink(i)">
              <AppIcon name="delete" />
            </button>
          </div>
        </div>

      </template>

      <template v-else-if="tab === 'account'">
        <h1>аккаунт</h1>

        <section class="nick-block">
          <h2>ник</h2>
          <p class="muted small">текущий: <strong>@{{ me.nickname }}</strong></p>
          <p class="muted small">осталось смен: {{ nickChangesLeft }} из {{ MAX_NICK_CHANGES }}</p>
          <template v-if="nickChangesLeft > 0">
            <div class="nick-row">
              <input
                v-model="newNick"
                placeholder="новый ник"
                maxlength="24"
                :disabled="changingNick"
                @input="onNickInput"
              />
              <button
                type="button"
                :disabled="changingNick || nickStatus !== 'ok'"
                @click="changeNickname"
              >
                {{ changingNick ? "…" : "сменить" }}
              </button>
            </div>
            <p
              v-if="nickMessage"
              class="small"
              :class="{
                'ok-msg': nickStatus === 'ok',
                error: nickStatus === 'err',
                muted: nickStatus === 'checking' || nickStatus === 'idle',
              }"
            >
              {{ nickStatus === "checking" ? "проверка…" : nickMessage }}
            </p>
          </template>
          <p v-else class="muted small">лимит смен исчерпан</p>
        </section>

        <div class="form-grid">
          <label class="col-2">
            <span>email</span>
            <input :value="me.email" disabled />
          </label>
          <label>
            <span>день рождения</span>
            <input v-model="birthday" />
          </label>
          <label>
            <span>страна</span>
            <input v-model="country" />
          </label>
          <label>
            <span>язык</span>
            <select v-model="languagePreference">
              <option value="ru">русский</option>
              <option value="en">english</option>
            </select>
          </label>
        </div>
      </template>

      <template v-else-if="tab === 'security'">
        <h1>безопасность</h1>
        <p class="muted">смена пароля · минимум 8 символов</p>
        <div class="form-grid col-one">
          <label class="col-2">
            <span>текущий пароль</span>
            <input v-model="currentPassword" type="password" autocomplete="current-password" />
          </label>
          <label class="col-2">
            <span>новый пароль</span>
            <input v-model="newPassword" type="password" autocomplete="new-password" />
          </label>
        </div>
        <div class="actions" style="margin-top: 1rem">
          <button type="button" :disabled="changingPassword || !currentPassword || !newPassword" @click="onChangePassword">
            {{ changingPassword ? "…" : "сменить" }}
          </button>
        </div>
      </template>

      <template v-else-if="tab === 'invites'">
        <h1>инвайты</h1>
        <p v-if="invitesLoading" class="muted">загрузка</p>
        <p v-else-if="!invites.length" class="muted">пусто</p>
        <div v-else class="invite-list">
          <div v-for="l in invites" :key="l.id" class="invite-card">
            <div class="invite-code">{{ l.code }}</div>
            <div class="muted">
              {{ l.target_role === "teacher" ? "ментор" : "ученик" }} ·
              {{ l.unlimited ? "без ограничений" : `осталось ${l.remaining} / ${l.max_uses}` }}
            </div>
            <div class="muted invite-url">{{ fullInviteUrl(l.code) }}</div>
          </div>
        </div>
      </template>

      <div v-if="tab === 'profile' || tab === 'account'" class="actions">
        <button class="secondary" type="button" @click="closeSettings">отмена</button>
        <button type="button" :disabled="saving" @click="save">{{ saving ? "…" : "сохранить" }}</button>
      </div>
    </div>
  </section>
  <p v-else-if="err" class="error">{{ err }}</p>
  <p v-else class="muted">Loading…</p>
</template>

<style scoped>
.settings-shell {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 1rem;
  min-height: calc(100vh - 140px);
}

.settings-nav {
  padding: 0.75rem;
  border-radius: 20px;
  max-height: min(70vh, 520px);
  overflow-y: auto;
}

.close-btn {
  margin-bottom: 0.7rem;
}

.nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  justify-content: flex-start;
  margin-bottom: 0.45rem;
  border-radius: 12px;
  background: transparent;
  color: var(--muted);
  border: 1px solid transparent;
  padding: 0.65rem 0.75rem;
  text-align: left;
}

.nav-item :deep(.app-icon) {
  flex-shrink: 0;
  opacity: 0.8;
}

.nav-item:hover {
  color: var(--text);
}

.nav-item.active {
  background: var(--surface2);
  border-color: var(--border);
  color: var(--text);
}

.nav-item.active :deep(.app-icon) {
  opacity: 1;
}

.settings-main {
  border-radius: 20px;
}

.avatar-header {
  display: flex;
  gap: 0.9rem;
  align-items: center;
  margin-bottom: 0.95rem;
}

.avatar-preview-wrap,
.avatar-placeholder {
  width: 78px;
  height: 78px;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--surface2);
}

.avatar-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  display: grid;
  place-items: center;
  font-weight: 700;
}

.avatar-actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.btn-file {
  display: inline-block;
  cursor: pointer;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.55rem 1rem;
  background: var(--surface2);
}

.btn-file input {
  display: none;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.7rem;
}

.form-grid label {
  display: grid;
  gap: 0.35rem;
}

.readme-input {
  font-family: var(--mono, ui-monospace, monospace);
  font-size: 0.88rem;
  line-height: 1.5;
}

.readme-counter {
  font-size: 0.78rem;
  text-align: right;
}

.col-2 {
  grid-column: span 2;
}

.socials {
  margin-top: 1rem;
}

.socials-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.5rem;
}

.social-row {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr) auto;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.social-remove {
  min-height: 0;
  width: 40px;
  padding: 0;
  display: grid;
  place-items: center;
}

.col-one {
  grid-template-columns: 1fr;
}

.inline-check {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.6rem;
}

.inline-check input[type="checkbox"] {
  width: auto;
  flex-shrink: 0;
}

.actions {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.ok {
  color: var(--accent);
}

.nick-block {
  display: grid;
  gap: 0.4rem;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  margin-bottom: 1rem;
}
.nick-block h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
}
.nick-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.nick-row input {
  flex: 1;
  min-width: 0;
}
.ok-msg {
  color: var(--text);
}
.small {
  font-size: 0.82rem;
}

.invite-list {
  display: grid;
  gap: 0.7rem;
}

.invite-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.7rem;
}

.invite-code {
  font-family: var(--mono);
  font-size: 0.92rem;
}

.invite-url {
  margin-top: 0.35rem;
  word-break: break-all;
}

@media (max-width: 980px) {
  .settings-shell {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .col-2 {
    grid-column: span 1;
  }

  .social-row {
    grid-template-columns: 1fr;
  }
}
</style>
