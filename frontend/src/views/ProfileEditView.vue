<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api/http";
import { uploadAvatar } from "../api/uploadAvatar";
import { changeMyPassword } from "../api/profile";
import AppIcon from "../components/AppIcon.vue";
import AppLoading from "../components/AppLoading.vue";
import { useAuthStore } from "../stores/auth";
import { useSessionStore } from "../stores/session";
import { setViewerPreferences } from "../utils/preferences";
import { renderMarkdown } from "../utils/markdown";
import { THEMES, normalizeThemeId, type ThemeId } from "../utils/themes";
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
  avatar_url: string;
  wallpaper_url: string;
  readme_md: string;
  language_preference: "ru" | "en";
  theme_preference: string;
  full_name: string;
  website_url: string;
  social_links: SocialLink[];
  birthday: string;
  country: string;
  nickname_change_count: number;
  moderation_notices?: string[];
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
const session = useSessionStore();
const router = useRouter();
const me = ref<Me | null>(null);
const tab = ref<SettingsTab>("profile");

const bio = ref("");
const readmeMd = ref("");
const readmePreview = computed(() => renderMarkdown(readmeMd.value));
const languagePreference = ref<"ru" | "en">("ru");
const themePreference = ref<ThemeId>("black");
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

function normStr(s: string | undefined | null) {
  return s ?? "";
}

function normSocialJson(links: SocialLink[]) {
  return JSON.stringify(
    links.map((s) => ({ name: String(s.name ?? "").trim(), url: String(s.url ?? "").trim() })),
  );
}

function applyMeMerge(oldMe: Me, fresh: Me) {
  if (bio.value === normStr(oldMe.bio)) bio.value = normStr(fresh.bio);
  if (readmeMd.value === normStr(oldMe.readme_md)) readmeMd.value = normStr(fresh.readme_md);
  if (languagePreference.value === oldMe.language_preference) {
    languagePreference.value = fresh.language_preference;
  }
  if (themePreference.value === normalizeThemeId(oldMe.theme_preference)) {
    themePreference.value = normalizeThemeId(fresh.theme_preference);
  }
  if (fullName.value === normStr(oldMe.full_name)) fullName.value = normStr(fresh.full_name);
  if (websiteUrl.value === normStr(oldMe.website_url)) websiteUrl.value = normStr(fresh.website_url);
  if (birthday.value === normStr(oldMe.birthday)) birthday.value = normStr(fresh.birthday);
  if (country.value === normStr(oldMe.country)) country.value = normStr(fresh.country);
  if (normSocialJson(socialLinks.value) === normSocialJson(Array.isArray(oldMe.social_links) ? oldMe.social_links : [])) {
    socialLinks.value = Array.isArray(fresh.social_links) ? [...fresh.social_links] : [];
  }
  me.value = fresh;
  setViewerPreferences({
    language_preference: fresh.language_preference,
    theme_preference: fresh.theme_preference,
  });
  if (auth.token && auth.user && fresh.nickname !== auth.user.nickname) {
    auth.applySession(auth.token, { ...auth.user, nickname: fresh.nickname });
  }
}

async function refreshMeFromServer() {
  if (!auth.token || document.visibilityState === "hidden") return;
  if (saving.value || uploadingAvatar.value || changingNick.value || changingPassword.value) return;
  try {
    const fresh = await api<Me>("/api/me", { token: auth.token });
    const old = me.value;
    if (!old) {
      me.value = fresh;
      bio.value = fresh.bio;
      readmeMd.value = fresh.readme_md ?? "";
      languagePreference.value = fresh.language_preference;
      themePreference.value = normalizeThemeId(fresh.theme_preference);
      fullName.value = fresh.full_name ?? "";
      websiteUrl.value = fresh.website_url ?? "";
      socialLinks.value = Array.isArray(fresh.social_links) ? [...fresh.social_links] : [];
      birthday.value = fresh.birthday ?? "";
      country.value = fresh.country ?? "";
      setViewerPreferences({
        language_preference: fresh.language_preference,
        theme_preference: fresh.theme_preference,
      });
      return;
    }
    applyMeMerge(old, fresh);
  } catch {
  }
}

function onMeVisibility() {
  if (document.visibilityState === "visible") void refreshMeFromServer();
}

const nickChangesLeft = computed(() => {
  if (!me.value) return MAX_NICK_CHANGES;
  return Math.max(0, MAX_NICK_CHANGES - (me.value.nickname_change_count ?? 0));
});

const roleLabel = computed(() => {
  const r = me.value?.role ?? auth.role ?? "student";
  if (r === "admin") return "админ";
  if (r === "teacher") return "ментор";
  if (r === "master") return "мастер";
  return "ученик";
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
    if (newNick.value.trim() !== v) return;
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
    const r = await changeMyPassword(auth.token, currentPassword.value, newPassword.value);
    if (r.token && auth.user) auth.applySession(r.token, auth.user);
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
    themePreference.value = normalizeThemeId(me.value.theme_preference);
    fullName.value = me.value.full_name ?? "";
    websiteUrl.value = me.value.website_url ?? "";
    socialLinks.value = Array.isArray(me.value.social_links) ? [...me.value.social_links] : [];
    birthday.value = me.value.birthday ?? "";
    country.value = me.value.country ?? "";
    setViewerPreferences({
      language_preference: me.value.language_preference,
      theme_preference: me.value.theme_preference,
    });
    avatarMsg.value = "";
    await loadInvites();
    document.addEventListener("visibilitychange", onMeVisibility);
    void session.ensureMe(true);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
});

onUnmounted(() => {
  document.removeEventListener("visibilitychange", onMeVisibility);
  if (nickTimer) clearTimeout(nickTimer);
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
    void session.ensureMe(true);
    window.dispatchEvent(new CustomEvent("enoobis:profile-cosmetics-updated"));
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
    void session.ensureMe(true);
    window.dispatchEvent(new CustomEvent("enoobis:profile-cosmetics-updated"));
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
        theme_preference: themePreference.value,
        full_name: fullName.value,
        website_url: websiteUrl.value,
        social_links: socialLinks.value,
        birthday: birthday.value,
        country: country.value,
      }),
    });
    setViewerPreferences({
      language_preference: languagePreference.value,
      theme_preference: themePreference.value,
    });
    void session.ensureMe(true);
    toastSuccess("сохранено");
    await router.push(`/u/${auth.nickname}`);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
    toastError(e);
  } finally {
    saving.value = false;
  }
}

function pickTheme(id: ThemeId) {
  themePreference.value = id;
  setViewerPreferences({
    language_preference: languagePreference.value,
    theme_preference: id,
  });
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
        <div class="profile-edit">
          <ul v-if="me.moderation_notices?.length" class="mod-notes">
            <li v-for="(line, i) in me.moderation_notices" :key="i">{{ line }}</li>
          </ul>

          <div class="profile-hero">
            <div class="avatar-edit">
              <img v-if="me.avatar_url" :src="me.avatar_url" alt="" class="avatar-edit-img" />
              <div v-else class="avatar-edit-placeholder">{{ me.nickname.slice(0, 2) }}</div>
              <label class="avatar-edit-btn" :class="{ busy: uploadingAvatar }">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  :disabled="uploadingAvatar"
                  @change="onAvatarFile"
                />
                <AppIcon name="edit" :size="16" />
              </label>
            </div>
            <button
              v-if="me.avatar_url"
              class="avatar-clear"
              type="button"
              :disabled="uploadingAvatar"
              @click="clearAvatar"
            >
              убрать фото
            </button>
          </div>

          <div class="field-stack">
            <div class="field-row">
              <label class="field">
                <span class="field-label">ник</span>
                <input class="field-input" :value="`@${me.nickname}`" disabled />
              </label>
              <label class="field">
                <span class="field-label">имя</span>
                <input v-model="fullName" class="field-input" maxlength="120" />
              </label>
            </div>

            <label class="field">
              <span class="field-head">
                <span class="field-label">био</span>
                <span class="field-count muted">{{ bio.length }} / 680</span>
              </span>
              <textarea
                v-model="bio"
                class="field-input field-textarea"
                rows="3"
                maxlength="680"
                placeholder="расскажи о себе"
              />
            </label>

            <label class="field">
              <span class="field-label">сайт</span>
              <span class="field-icon-wrap">
                <AppIcon name="link" :size="16" class="field-icon" />
                <input v-model="websiteUrl" class="field-input field-input--icon" placeholder="https://" />
              </span>
            </label>

            <label class="field">
              <span class="field-head">
                <span class="field-label">readme · markdown</span>
                <span class="field-count muted">{{ readmeMd.length }} / {{ README_MAX }}</span>
              </span>
              <textarea
                v-model="readmeMd"
                class="field-input field-textarea readme-input"
                rows="8"
                :maxlength="README_MAX"
                placeholder="# привет&#10;![img](url.png)"
              />
              <details v-if="readmeMd.trim()" class="readme-preview-wrap">
                <summary class="muted small">превью</summary>
                <article class="readme-preview" v-html="readmePreview" />
              </details>
            </label>
          </div>

          <section class="socials-card">
            <div class="socials-card-head">
              <span class="field-label">соцсети</span>
              <button class="secondary socials-add" type="button" @click="addSocialLink">+ ссылка</button>
            </div>
            <p v-if="!socialLinks.length" class="socials-empty muted small">пусто</p>
            <div v-for="(s, i) in socialLinks" :key="`social-${i}`" class="socials-row">
              <input v-model="s.name" class="field-input" placeholder="название" />
              <input v-model="s.url" class="field-input" placeholder="https://" />
              <button class="icon-btn-sm socials-remove" type="button" aria-label="удалить" @click="removeSocialLink(i)">
                <AppIcon name="delete" :size="16" />
              </button>
            </div>
          </section>
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

        <section class="theme-block">
          <span class="theme-label muted">тема</span>
          <div class="theme-picker">
            <button
              v-for="t in THEMES"
              :key="t.id"
              type="button"
              class="theme-opt"
              :data-preview="t.id"
              :class="{ on: themePreference === t.id }"
              :aria-label="t.label"
              :title="t.label"
              @click="pickTheme(t.id)"
            />
          </div>
        </section>

        <div class="form-grid">
          <label class="col-2">
            <span>email</span>
            <input :value="me.email" disabled />
          </label>
          <label>
            <span>роль</span>
            <input :value="roleLabel" disabled />
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
        <AppLoading v-if="invitesLoading" />
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

      <div v-if="tab === 'profile' || tab === 'account'" class="actions" :class="{ 'actions--profile': tab === 'profile' }">
        <button class="secondary" type="button" @click="closeSettings">отмена</button>
        <button type="button" :disabled="saving" @click="save">{{ saving ? "…" : "сохранить" }}</button>
      </div>
    </div>
  </section>
  <p v-else-if="err" class="error">{{ err }}</p>
  <AppLoading v-else />
</template>

<style scoped>
.mod-notes {
  list-style: none;
  padding: 0;
  margin: 0 0 1rem;
  color: var(--danger);
  font-size: 0.82rem;
  line-height: 1.35;
}
.mod-notes li + li {
  margin-top: 0.35rem;
}
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
  padding: 1.25rem;
}

.profile-edit {
  max-width: 560px;
  margin: 0 auto;
  display: grid;
  gap: 1.25rem;
  width: 100%;
}

.profile-hero {
  display: grid;
  justify-items: center;
  gap: 0.45rem;
  padding-top: 0.25rem;
}

.avatar-edit {
  position: relative;
  width: 96px;
  height: 96px;
}

.avatar-edit-img,
.avatar-edit-placeholder {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface2);
}

.avatar-edit-img {
  object-fit: cover;
  display: block;
}

.avatar-edit-placeholder {
  display: grid;
  place-items: center;
  font-weight: 600;
  font-size: 1.1rem;
  text-transform: lowercase;
}

.avatar-edit-btn {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.avatar-edit-btn.busy {
  opacity: 0.6;
  pointer-events: none;
}

.avatar-edit-btn input {
  display: none;
}

.avatar-clear {
  border: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
  padding: 0.15rem 0.35rem;
}

.avatar-clear:hover {
  color: var(--text);
}

.field-stack {
  display: grid;
  gap: 0.85rem;
}

.field-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
  gap: 0.65rem;
}

.field {
  display: grid;
  gap: 0.35rem;
}

.field-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.field-label {
  font-size: 0.78rem;
  color: var(--muted);
}

.field-count {
  font-size: 0.74rem;
  font-variant-numeric: tabular-nums;
}

.field-input {
  width: 100%;
  min-height: var(--control-h);
  padding: var(--input-pad-y) var(--input-pad-x);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface2);
  color: var(--text);
  font: inherit;
}

.field-input:focus {
  outline: none;
  border-color: var(--focus-border);
}

.field-input:disabled {
  opacity: 0.7;
}

.field-textarea {
  min-height: 0;
  resize: vertical;
  line-height: 1.45;
}

.field-icon-wrap {
  position: relative;
  display: block;
}

.field-icon {
  position: absolute;
  left: 0.85rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
  pointer-events: none;
}

.field-input--icon {
  padding-left: 2.35rem;
}

.socials-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface2);
  padding: 0.75rem;
  display: grid;
  gap: 0.55rem;
}

.socials-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.socials-add {
  min-height: 0;
  padding: 0.3rem 0.65rem;
  font-size: 0.78rem;
}

.socials-empty {
  margin: 0;
}

.socials-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) auto;
  gap: 0.45rem;
  align-items: center;
}

.socials-row + .socials-row {
  padding-top: 0.45rem;
  border-top: 1px solid var(--border);
}

.socials-remove {
  flex-shrink: 0;
}

.actions--profile {
  max-width: 560px;
  margin-left: auto;
  margin-right: auto;
  width: 100%;
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
  font-size: 0.86rem;
  line-height: 1.5;
}

.readme-preview-wrap {
  margin-top: 0.5rem;
}

.readme-preview {
  margin-top: 0.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.85rem 1rem;
  line-height: 1.6;
  font-size: 0.92rem;
}

.readme-preview :deep(img),
.readme-preview :deep(video) {
  display: block;
  max-width: 100%;
  border-radius: var(--radius);
  margin: 0.5rem 0;
}

.readme-preview :deep(video) {
  background: #000;
}

.col-2 {
  grid-column: span 2;
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
.theme-block {
  margin-bottom: 1rem;
}
.theme-label {
  display: block;
  font-size: 0.82rem;
  margin-bottom: 0.45rem;
}
.theme-picker {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.theme-opt {
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 2px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
}
.theme-opt.on {
  border-color: var(--text);
}
.theme-opt[data-preview="black"] {
  background: #0a0a0a;
}
.theme-opt[data-preview="white"] {
  background: #f6f6f6;
}
.theme-opt[data-preview="contrast"] {
  background: #000;
  box-shadow: inset 0 0 0 1px #fff;
}
.theme-opt[data-preview="contrast-white"] {
  background: #fff;
  box-shadow: inset 0 0 0 1px #000;
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
  background: var(--surface2);
  border-radius: var(--radius);
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
  .field-row {
    grid-template-columns: 1fr;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .col-2 {
    grid-column: span 1;
  }

  .socials-row {
    grid-template-columns: 1fr;
  }
}

</style>
