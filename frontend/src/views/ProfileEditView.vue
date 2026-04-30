<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api/http";
import { uploadAvatar } from "../api/uploadAvatar";
import { uploadWallpaper } from "../api/uploadWallpaper";
import {
  getProfileActivity,
  getMyPrivacy,
  getMyNotifications,
  patchMyPrivacy,
  patchMyNotifications,
  changeMyPassword,
  type ActivitySummary,
  type PrivacySettings,
  type NotificationSettings,
} from "../api/profile";
import AppIcon from "../components/AppIcon.vue";
import { useAuthStore } from "../stores/auth";
import { applyUserPreferences } from "../utils/preferences";

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
  theme_preference: "black" | "graphite" | "contrast";
  language_preference: "ru" | "en";
  font_preference: "compact" | "normal" | "large";
  full_name: string;
  website_url: string;
  social_links: SocialLink[];
  birthday: string;
  country: string;
  favorite_course_ids: string[];
};

type Course = { id: string; title: string; is_open: boolean; teacher_nickname: string };
type SettingsTab = "profile" | "account" | "activity" | "privacy" | "security" | "notifications";

const auth = useAuthStore();
const router = useRouter();
const me = ref<Me | null>(null);
const courses = ref<Course[]>([]);
const tab = ref<SettingsTab>("profile");

const bio = ref("");
const themePreference = ref<"black" | "graphite" | "contrast">("black");
const languagePreference = ref<"ru" | "en">("ru");
const fontPreference = ref<"compact" | "normal" | "large">("normal");
const fullName = ref("");
const websiteUrl = ref("");
const socialLinks = ref<SocialLink[]>([]);
const birthday = ref("");
const country = ref("");
const favorites = ref<string[]>([]);

const err = ref("");
const avatarMsg = ref("");
const uploadingAvatar = ref(false);
const uploadingWallpaper = ref(false);
const saving = ref(false);

const myActivity = ref<ActivitySummary | null>(null);
const activityYear = ref(new Date().getFullYear());
const activityLoading = ref(false);

const privacy = ref<PrivacySettings | null>(null);
const savingPrivacy = ref(false);
const notif = ref<NotificationSettings | null>(null);
const savingNotif = ref(false);

const currentPassword = ref("");
const newPassword = ref("");
const changingPassword = ref(false);

const yearOptions = computed(() => {
  const cur = new Date().getFullYear();
  const from = myActivity.value?.registration_year ?? cur - 5;
  const to = myActivity.value?.current_year ?? cur;
  const out: number[] = [];
  for (let y = from; y <= to; y++) out.push(y);
  return out.length ? out : [cur];
});

async function loadMyActivity() {
  if (!auth.token || !me.value) return;
  activityLoading.value = true;
  err.value = "";
  try {
    myActivity.value = await getProfileActivity(me.value.nickname, auth.token, activityYear.value);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  } finally {
    activityLoading.value = false;
  }
}

async function loadPrivacyAndNotif() {
  if (!auth.token) return;
  try {
    const [p, n] = await Promise.all([getMyPrivacy(auth.token), getMyNotifications(auth.token)]);
    privacy.value = p;
    notif.value = n;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

async function savePrivacySettings() {
  if (!auth.token || !privacy.value) return;
  savingPrivacy.value = true;
  err.value = "";
  try {
    privacy.value = await patchMyPrivacy(auth.token, {
      profile_visibility: privacy.value.profile_visibility,
      activity_visibility: privacy.value.activity_visibility,
      media_visibility: privacy.value.media_visibility,
      show_birthday: privacy.value.show_birthday,
      show_country: privacy.value.show_country,
    });
    avatarMsg.value = "Настройки приватности сохранены.";
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  } finally {
    savingPrivacy.value = false;
  }
}

async function saveNotificationSettings() {
  if (!auth.token || !notif.value) return;
  savingNotif.value = true;
  err.value = "";
  try {
    notif.value = await patchMyNotifications(auth.token, { ...notif.value });
    avatarMsg.value = "Настройки уведомлений сохранены.";
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  } finally {
    savingNotif.value = false;
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
    avatarMsg.value = "Пароль обновлён.";
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  } finally {
    changingPassword.value = false;
  }
}

onMounted(async () => {
  try {
    me.value = await api<Me>("/api/me", { token: auth.token });
    bio.value = me.value.bio;
    themePreference.value = me.value.theme_preference;
    languagePreference.value = me.value.language_preference;
    fontPreference.value = me.value.font_preference;
    fullName.value = me.value.full_name ?? "";
    websiteUrl.value = me.value.website_url ?? "";
    socialLinks.value = Array.isArray(me.value.social_links) ? [...me.value.social_links] : [];
    birthday.value = me.value.birthday ?? "";
    country.value = me.value.country ?? "";
    applyUserPreferences(me.value);
    avatarMsg.value = "";
    favorites.value = [...me.value.favorite_course_ids];
    const all = await api<Course[]>("/api/courses", { token: auth.token });
    courses.value = all;
    await Promise.all([loadPrivacyAndNotif(), loadMyActivity()]);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
});

watch(activityYear, () => {
  void loadMyActivity();
});

function toggleFav(id: string) {
  const i = favorites.value.indexOf(id);
  if (i >= 0) favorites.value.splice(i, 1);
  else if (favorites.value.length < 12) favorites.value.push(id);
}

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
    avatarMsg.value = "Аватар обновлён.";
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка загрузки";
  } finally {
    uploadingAvatar.value = false;
  }
}

async function onWallpaperFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !auth.token) return;
  err.value = "";
  avatarMsg.value = "";
  uploadingWallpaper.value = true;
  try {
    const r = await uploadWallpaper(auth.token, file);
    if (me.value) me.value.wallpaper_url = r.wallpaper_url;
    avatarMsg.value = "Обои обновлены.";
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка загрузки обоев";
  } finally {
    uploadingWallpaper.value = false;
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

async function clearWallpaper() {
  if (!auth.token) return;
  err.value = "";
  avatarMsg.value = "";
  try {
    await api("/api/me", {
      method: "PATCH",
      token: auth.token,
      body: JSON.stringify({ wallpaper_url: "" }),
    });
    if (me.value) me.value.wallpaper_url = "";
    avatarMsg.value = "Обои сброшены.";
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
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
        theme_preference: themePreference.value,
        language_preference: languagePreference.value,
        font_preference: fontPreference.value,
        full_name: fullName.value,
        website_url: websiteUrl.value,
        social_links: socialLinks.value,
        birthday: birthday.value,
        country: country.value,
        favorite_course_ids: favorites.value,
      }),
    });
    applyUserPreferences({
      theme_preference: themePreference.value,
      language_preference: languagePreference.value,
      font_preference: fontPreference.value,
    });
    await router.push(`/u/${auth.nickname}`);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
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
        <AppIcon name="profile" />
        <span>Profile</span>
      </button>
      <button class="nav-item" :class="{ active: tab === 'account' }" type="button" @click="tab = 'account'">
        <AppIcon name="settings" />
        <span>Account</span>
      </button>
      <button class="nav-item" :class="{ active: tab === 'activity' }" type="button" @click="tab = 'activity'">
        <AppIcon name="play" />
        <span>Activity</span>
      </button>
      <button class="nav-item" :class="{ active: tab === 'privacy' }" type="button" @click="tab = 'privacy'">
        <AppIcon name="block" />
        <span>Privacy</span>
      </button>
      <button class="nav-item" :class="{ active: tab === 'security' }" type="button" @click="tab = 'security'">
        <AppIcon name="edit" />
        <span>Security</span>
      </button>
      <button
        class="nav-item"
        :class="{ active: tab === 'notifications' }"
        type="button"
        @click="tab = 'notifications'"
      >
        <AppIcon name="comment" />
        <span>Notifications</span>
      </button>
    </aside>

    <div class="settings-main card">
      <p v-if="err" class="error">{{ err }}</p>
      <p v-if="avatarMsg" class="ok">{{ avatarMsg }}</p>

      <template v-if="tab === 'profile'">
        <h1>Profile</h1>
        <div class="avatar-header">
          <div v-if="me.avatar_url" class="avatar-preview-wrap">
            <img :src="me.avatar_url" alt="" class="avatar-preview" />
          </div>
          <div v-else class="avatar-placeholder">{{ me.nickname.slice(0, 2).toUpperCase() }}</div>
          <div class="avatar-actions">
            <label class="btn-file">
              <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" :disabled="uploadingAvatar" @change="onAvatarFile" />
              {{ uploadingAvatar ? "Uploading…" : "Upload photo" }}
            </label>
            <button v-if="me.avatar_url" class="secondary" type="button" @click="clearAvatar">Remove</button>
          </div>
        </div>

        <div class="wallpaper-box">
          <img v-if="me.wallpaper_url" :src="me.wallpaper_url" alt="" class="wallpaper-preview" />
          <div v-else class="muted">Обои не загружены.</div>
          <div class="avatar-actions">
            <label class="btn-file">
              <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" :disabled="uploadingWallpaper" @change="onWallpaperFile" />
              {{ uploadingWallpaper ? "Uploading…" : "Upload wallpaper" }}
            </label>
            <button v-if="me.wallpaper_url" class="secondary" type="button" @click="clearWallpaper">Remove</button>
          </div>
        </div>

        <div class="form-grid">
          <label>
            <span>Username</span>
            <input :value="`@${me.nickname}`" disabled />
          </label>
          <label>
            <span>Full name</span>
            <input v-model="fullName" />
          </label>
          <label class="col-2">
            <span>Bio</span>
            <textarea v-model="bio" rows="3" maxlength="680" />
          </label>
          <label class="col-2">
            <span>Website</span>
            <input v-model="websiteUrl" />
          </label>
        </div>

        <div class="socials">
          <div class="socials-head">
            <h2>Social links</h2>
            <button class="secondary" type="button" @click="addSocialLink">Add link</button>
          </div>
          <div v-for="(s, i) in socialLinks" :key="`social-${i}`" class="social-row">
            <input v-model="s.name" placeholder="Name (e.g. YouTube)" />
            <input v-model="s.url" placeholder="Link (https://...)" />
            <button class="secondary social-remove" type="button" @click="removeSocialLink(i)">
              <AppIcon name="delete" />
            </button>
          </div>
        </div>

        <div class="favorites">
          <h2>Favorite courses</h2>
          <p class="muted">Up to 12 courses.</p>
          <ul>
            <li v-for="c in courses" :key="c.id">
              <label>
                <input type="checkbox" :checked="favorites.includes(c.id)" @change="toggleFav(c.id)" />
                {{ c.title }} — {{ c.teacher_nickname }}
              </label>
            </li>
          </ul>
        </div>
      </template>

      <template v-else-if="tab === 'account'">
        <h1>Account details</h1>
        <div class="form-grid">
          <label class="col-2">
            <span>Email</span>
            <input :value="me.email" disabled />
          </label>
          <label>
            <span>Birthday</span>
            <input v-model="birthday" />
          </label>
          <label>
            <span>Country</span>
            <input v-model="country" />
          </label>
          <label>
            <span>Theme</span>
            <select v-model="themePreference">
              <option value="black">Black</option>
              <option value="graphite">Graphite</option>
              <option value="contrast">Contrast</option>
            </select>
          </label>
          <label>
            <span>Language</span>
            <select v-model="languagePreference">
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            <span>Font</span>
            <select v-model="fontPreference">
              <option value="compact">Compact</option>
              <option value="normal">Normal</option>
              <option value="large">Large</option>
            </select>
          </label>
        </div>
      </template>

      <template v-else-if="tab === 'activity'">
        <h1>Activity</h1>
        <p class="muted">Time on the site (collected in the app).</p>
        <div class="form-grid">
          <label>
            <span>Year</span>
            <select v-model.number="activityYear">
              <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}</option>
            </select>
          </label>
        </div>
        <p v-if="activityLoading" class="muted">Loading…</p>
        <template v-else-if="myActivity">
          <p class="muted">Total: {{ Math.round(myActivity.total_seconds / 60) }} min · {{ myActivity.days.length }} active days</p>
          <div v-if="myActivity.days.length" class="activity-grid">
            <div v-for="d in myActivity.days.slice(-14)" :key="d.day" class="activity-cell">
              <span class="activity-day-label">{{ d.day.slice(5) }}</span>
              <span>{{ Math.round(d.seconds_spent / 60) }}m</span>
            </div>
          </div>
          <p v-else class="muted">No data for this year.</p>
        </template>
      </template>

      <template v-else-if="tab === 'privacy' && privacy">
        <h1>Privacy</h1>
        <p class="muted">Кто видит профиль, активность и аватар/обои.</p>
        <div class="form-grid">
          <label>
            <span>Profile</span>
            <select v-model="privacy.profile_visibility">
              <option value="public">Public</option>
              <option value="followers">Followers only</option>
              <option value="private">Only me</option>
            </select>
          </label>
          <label>
            <span>Activity &amp; location fields</span>
            <select v-model="privacy.activity_visibility">
              <option value="public">Public</option>
              <option value="followers">Followers only</option>
              <option value="private">Only me</option>
            </select>
          </label>
          <label>
            <span>Media (avatar, wallpaper, favorites)</span>
            <select v-model="privacy.media_visibility">
              <option value="public">Public</option>
              <option value="followers">Followers only</option>
              <option value="private">Only me</option>
            </select>
          </label>
          <label class="inline-check">
            <input v-model="privacy.show_birthday" type="checkbox" />
            <span>Show birthday when activity is visible</span>
          </label>
          <label class="inline-check">
            <input v-model="privacy.show_country" type="checkbox" />
            <span>Show country when activity is visible</span>
          </label>
        </div>
        <div class="actions" style="margin-top: 1rem">
          <button type="button" :disabled="savingPrivacy" @click="savePrivacySettings">
            {{ savingPrivacy ? "Saving…" : "Save privacy" }}
          </button>
        </div>
      </template>

      <template v-else-if="tab === 'security'">
        <h1>Security</h1>
        <p class="muted">Change password. Minimum 8 characters for the new one.</p>
        <div class="form-grid col-one">
          <label class="col-2">
            <span>Current password</span>
            <input v-model="currentPassword" type="password" autocomplete="current-password" />
          </label>
          <label class="col-2">
            <span>New password</span>
            <input v-model="newPassword" type="password" autocomplete="new-password" />
          </label>
        </div>
        <div class="actions" style="margin-top: 1rem">
          <button type="button" :disabled="changingPassword || !currentPassword || !newPassword" @click="onChangePassword">
            {{ changingPassword ? "Updating…" : "Update password" }}
          </button>
        </div>
      </template>

      <template v-else-if="tab === 'notifications' && notif">
        <h1>Notifications</h1>
        <p class="muted">Preferences (delivery will follow product updates).</p>
        <div class="form-grid col-one">
          <label class="inline-check">
            <input v-model="notif.email_enabled" type="checkbox" />
            <span>Email</span>
          </label>
          <label class="inline-check">
            <input v-model="notif.push_enabled" type="checkbox" />
            <span>Push (coming soon)</span>
          </label>
          <label class="inline-check">
            <input v-model="notif.course_updates" type="checkbox" />
            <span>Course updates</span>
          </label>
          <label class="inline-check">
            <input v-model="notif.assignment_deadlines" type="checkbox" />
            <span>Assignment deadlines</span>
          </label>
          <label class="inline-check">
            <input v-model="notif.grades_released" type="checkbox" />
            <span>Grades released</span>
          </label>
          <label class="inline-check">
            <input v-model="notif.new_followers" type="checkbox" />
            <span>New followers</span>
          </label>
          <label class="inline-check">
            <input v-model="notif.marketing_news" type="checkbox" />
            <span>News &amp; tips</span>
          </label>
        </div>
        <div class="actions" style="margin-top: 1rem">
          <button type="button" :disabled="savingNotif" @click="saveNotificationSettings">
            {{ savingNotif ? "Saving…" : "Save notifications" }}
          </button>
        </div>
      </template>

      <div v-if="tab === 'profile' || tab === 'account'" class="actions">
        <button class="secondary" type="button" @click="closeSettings">Cancel</button>
        <button type="button" :disabled="saving" @click="save">{{ saving ? "Saving..." : "Save" }}</button>
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
  justify-content: flex-start;
  margin-bottom: 0.45rem;
  border-radius: 12px;
  background: transparent;
  color: var(--text);
  border: 1px solid transparent;
  padding: 0.7rem 0.8rem;
}

.nav-item.active {
  background: var(--surface2);
  border-color: var(--border);
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

.wallpaper-box {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.75rem;
  margin-bottom: 0.95rem;
}

.wallpaper-preview {
  width: 100%;
  max-height: 170px;
  object-fit: cover;
  border-radius: 10px;
  margin-bottom: 0.65rem;
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

.favorites {
  margin-top: 1rem;
  border-top: 1px solid var(--border);
  padding-top: 0.85rem;
}

.favorites ul {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 180px;
  overflow: auto;
}

.favorites li {
  margin-bottom: 0.35rem;
}

.favorites label {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.favorites input[type="checkbox"] {
  width: auto;
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

.activity-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 0.5rem;
  margin-top: 0.6rem;
}

.activity-cell {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.4rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: 0.9rem;
}

.activity-day-label {
  color: var(--muted);
  font-size: 0.8rem;
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
