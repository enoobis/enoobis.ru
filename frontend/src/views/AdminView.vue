<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { api } from "../api/http";
import {
  deleteBlogReport,
  hideCommentByAdmin,
  hidePostByAdmin,
  listBlogReports,
  resolveBlogReport,
  restoreCommentByAdmin,
  type BlogReport,
} from "../api/blog";
import {
  deleteAdminUserInvite,
  getAdminUserDetail,
  listAdminUserInvites,
  patchAdminPublishLimits,
  patchAdminUserProfile,
  postAdminUserCoins,
  uploadAdminUserAvatar,
  type AdminInviteRow,
  type AdminUserDetail,
  type PublishChannelLimits,
  type PublishLimitsPatchBody,
  type PublishPeriod,
} from "../api/adminUsers";
import { useAuthStore } from "../stores/auth";
import {
  adminDeleteShopItem,
  adminUploadShopItem,
  listShopItems,
  type ShopItem,
  type ShopItemKind,
} from "../api/shop";

const README_MAX = 4000;

type SocialRow = { name: string; url: string };

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
  coins?: number;
};
type Tab = "pending" | "users" | "reports" | "shop";

const auth = useAuthStore();
const tab = ref<Tab>("pending");
const pending = ref<Pending[]>([]);
const users = ref<AdminUser[]>([]);
const reports = ref<BlogReport[]>([]);
const err = ref("");
const usersQuery = ref("");
const moderateUserId = ref<string | null>(null);
const moderateDetail = ref<AdminUserDetail | null>(null);
const moderateNick = ref("");
const moderateFullName = ref("");
const moderateWebsite = ref("");
const moderateBio = ref("");
const moderateReadme = ref("");
const moderateSocial = ref<SocialRow[]>([]);
const moderatePassword = ref("");
const moderateGemInput = ref("");
const modInvites = ref<AdminInviteRow[]>([]);
const modMsg = ref("");
const modBusy = ref(false);

const shopItems = ref<ShopItem[]>([]);
const shopLoading = ref(false);
const shopUploadName = ref("");
const shopUploadPrice = ref(0);
const shopUploadStock = ref("");
const shopUploadKind = ref<ShopItemKind>("avatar");
const shopUploadBusy = ref(false);
const shopMsg = ref("");

const ADMIN_POLL_MS = 12000;
let adminModeratePoll: ReturnType<typeof setInterval> | null = null;

function normAdminSocialJson(links: SocialRow[] | AdminUserDetail["social_links"]) {
  const arr = Array.isArray(links) ? links : [];
  return JSON.stringify(
    arr.map((s) => ({ name: String(s.name ?? "").trim(), url: String(s.url ?? "").trim() })),
  );
}

function applyModerateMerge(old: AdminUserDetail, fresh: AdminUserDetail) {
  if (moderateNick.value === old.nickname) moderateNick.value = fresh.nickname;
  if (moderateFullName.value === (old.full_name ?? "")) moderateFullName.value = fresh.full_name ?? "";
  if (moderateWebsite.value === (old.website_url ?? "")) moderateWebsite.value = fresh.website_url ?? "";
  if (moderateBio.value === (old.bio ?? "")) moderateBio.value = fresh.bio ?? "";
  if (moderateReadme.value === (old.readme_md ?? "")) moderateReadme.value = fresh.readme_md ?? "";
  if (normAdminSocialJson(moderateSocial.value) === normAdminSocialJson(old.social_links)) {
    moderateSocial.value = Array.isArray(fresh.social_links)
      ? fresh.social_links.map((s) => ({ name: s.name ?? "", url: s.url ?? "" }))
      : [];
  }
  moderateDetail.value = fresh;
  syncLimitsFromDetail(fresh.publish_limits);
}

async function refreshModerateOpen() {
  if (!auth.token || document.visibilityState === "hidden") return;
  const id = moderateUserId.value;
  const oldDetail = moderateDetail.value;
  if (!id || !oldDetail || modBusy.value) return;
  try {
    const fresh = await getAdminUserDetail(auth.token, id);
    applyModerateMerge(oldDetail, fresh);
    modInvites.value = await listAdminUserInvites(auth.token, id);
  } catch {
  }
}

function onAdminModerateVisibility() {
  if (document.visibilityState === "visible") void refreshModerateOpen();
}

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

function syncModerateFromDetail() {
  const d = moderateDetail.value;
  if (!d) return;
  moderateNick.value = d.nickname;
  moderateFullName.value = d.full_name ?? "";
  moderateWebsite.value = d.website_url ?? "";
  moderateBio.value = d.bio ?? "";
  moderateReadme.value = d.readme_md ?? "";
  moderateSocial.value = Array.isArray(d.social_links)
    ? d.social_links.map((s) => ({ name: s.name ?? "", url: s.url ?? "" }))
    : [];
  syncLimitsFromDetail(d.publish_limits);
}

type ModLimForm = {
  ban_forever: boolean;
  ban_until: string;
  max_per_period: string;
  period: PublishPeriod;
  min_interval_hours: string;
};

const modLimBlog = ref<ModLimForm>({
  ban_forever: false,
  ban_until: "",
  max_per_period: "",
  period: "day",
  min_interval_hours: "",
});
const modLimMicro = ref<ModLimForm>({
  ban_forever: false,
  ban_until: "",
  max_per_period: "",
  period: "day",
  min_interval_hours: "",
});
const modLimComment = ref<ModLimForm>({
  ban_forever: false,
  ban_until: "",
  max_per_period: "",
  period: "day",
  min_interval_hours: "",
});
const modLimChat = ref<ModLimForm>({
  ban_forever: false,
  ban_until: "",
  max_per_period: "",
  period: "day",
  min_interval_hours: "",
});

function hoursFromSeconds(sec: number | null): string {
  if (sec == null) return "";
  const h = sec / 3600;
  if (Number.isInteger(h)) return String(h);
  return h.toFixed(1).replace(/\.0$/, "");
}

function syncLimitsFromDetail(pl: AdminUserDetail["publish_limits"] | undefined) {
  if (!pl) return;
  const row = (c: PublishChannelLimits): ModLimForm => ({
    ban_forever: !!c.ban_forever,
    ban_until: c.ban_until ? c.ban_until.slice(0, 16) : "",
    max_per_period: c.max_per_period != null ? String(c.max_per_period) : "",
    period: c.period ?? "day",
    min_interval_hours: hoursFromSeconds(c.min_interval_seconds),
  });
  modLimBlog.value = row(pl.blog);
  modLimMicro.value = row(pl.micro);
  modLimComment.value = row(pl.blog_comment);
  modLimChat.value = row(pl.chat);
}

function limToPayload(l: ModLimForm): PublishLimitsPatchBody["blog"] {
  const max = l.max_per_period.trim();
  const hrs = l.min_interval_hours.trim().replace(",", ".");
  return {
    ban_forever: l.ban_forever,
    ban_until: l.ban_forever ? "" : l.ban_until.trim() ? new Date(l.ban_until).toISOString() : "",
    max_per_period: max ? Number(max) : "",
    period: l.period,
    min_interval_hours: hrs ? Number(hrs) : "",
  };
}

async function saveModerateLimits() {
  const id = moderateUserId.value;
  if (!auth.token || !id) return;
  modBusy.value = true;
  modMsg.value = "";
  try {
    const r = await patchAdminPublishLimits(auth.token, id, {
      blog: limToPayload(modLimBlog.value),
      micro: limToPayload(modLimMicro.value),
      blog_comment: limToPayload(modLimComment.value),
      chat: limToPayload(modLimChat.value),
    });
    if (moderateDetail.value) moderateDetail.value.publish_limits = r.publish_limits;
    modMsg.value = "лимиты сохранены";
  } catch (e) {
    modMsg.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    modBusy.value = false;
  }
}

function presetBan(target: "blog" | "micro" | "comment" | "chat", unit: "day" | "month" | "year") {
  const box =
    target === "blog"
      ? modLimBlog
      : target === "micro"
        ? modLimMicro
        : target === "comment"
          ? modLimComment
          : modLimChat;
  const d = new Date();
  if (unit === "day") d.setUTCDate(d.getUTCDate() + 1);
  else if (unit === "month") d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  box.value = { ...box.value, ban_forever: false, ban_until: d.toISOString().slice(0, 16) };
}

async function loadShopItems() {
  if (!auth.token) return;
  shopLoading.value = true;
  try {
    shopItems.value = await listShopItems(auth.token);
  } catch {
    /* ignore */
  } finally {
    shopLoading.value = false;
  }
}

function shopKindRu(k: ShopItemKind): string {
  if (k === "avatar") return "аватар";
  if (k === "frame") return "рамка";
  if (k === "wallpaper") return "фон";
  return "обложка";
}

function shopStockLine(a: ShopItem): string {
  const cap = a.stock_limit;
  if (cap == null) return "";
  const lim = Math.max(0, Math.floor(Number(cap)));
  if (lim <= 0) return "";
  const sold = Math.max(0, Math.floor(Number(a.sold_count ?? 0)));
  return ` · ${sold}/${lim}`;
}

async function onShopItemFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file || !auth.token) return;
  const name = shopUploadName.value.trim() || file.name;
  const price = Math.max(0, Math.floor(Number(shopUploadPrice.value) || 0));
  const rawStock = shopUploadStock.value.trim();
  let stockLimit: number | null = null;
  if (rawStock !== "") {
    const n = parseInt(rawStock, 10);
    if (!Number.isFinite(n) || n < 1) {
      shopMsg.value = "тираж: целое число от 1";
      return;
    }
    stockLimit = n;
  }
  shopUploadBusy.value = true;
  shopMsg.value = "";
  try {
    await adminUploadShopItem(auth.token, file, shopUploadKind.value, name, price, stockLimit);
    shopUploadName.value = "";
    shopUploadPrice.value = 0;
    shopUploadStock.value = "";
    (e.target as HTMLInputElement).value = "";
    shopMsg.value = "добавлено";
    await loadShopItems();
  } catch (ex) {
    shopMsg.value = ex instanceof Error ? ex.message : "ошибка";
  } finally {
    shopUploadBusy.value = false;
  }
}

async function removeShopItem(id: string) {
  if (!auth.token) return;
  try {
    await adminDeleteShopItem(auth.token, id);
    shopItems.value = shopItems.value.filter((a) => a.id !== id);
  } catch (ex) {
    shopMsg.value = ex instanceof Error ? ex.message : "ошибка";
  }
}

async function load() {
  err.value = "";
  try {
    pending.value = await api<Pending[]>("/api/admin/pending", { token: auth.token });
    users.value = await api<AdminUser[]>("/api/admin/users", { token: auth.token });
    reports.value = await listBlogReports(auth.token ?? "");
    if (moderateUserId.value && auth.token) {
      try {
        moderateDetail.value = await getAdminUserDetail(auth.token, moderateUserId.value);
        syncModerateFromDetail();
        modInvites.value = await listAdminUserInvites(auth.token, moderateUserId.value);
      } catch {
        /* панель закроется при ошибке */
      }
    }
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

onMounted(() => {
  void load();
  void loadShopItems();
  document.addEventListener("visibilitychange", onAdminModerateVisibility);
  adminModeratePoll = setInterval(() => void refreshModerateOpen(), ADMIN_POLL_MS);
});

onUnmounted(() => {
  document.removeEventListener("visibilitychange", onAdminModerateVisibility);
  if (adminModeratePoll) {
    clearInterval(adminModeratePoll);
    adminModeratePoll = null;
  }
});

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

async function addModerateInvite(role: "student" | "teacher") {
  const id = moderateUserId.value;
  if (!id) return;
  await addInvite(id, role);
}

async function openModerate(u: AdminUser) {
  if (!auth.token) return;
  moderateUserId.value = u.id;
  modMsg.value = "";
  modBusy.value = true;
  moderatePassword.value = "";
  moderateGemInput.value = "";
  try {
    moderateDetail.value = await getAdminUserDetail(auth.token, u.id);
    syncModerateFromDetail();
    modInvites.value = await listAdminUserInvites(auth.token, u.id);
  } catch (e) {
    modMsg.value = e instanceof Error ? e.message : "ошибка";
    moderateDetail.value = null;
  } finally {
    modBusy.value = false;
  }
}

function closeModerate() {
  moderateUserId.value = null;
  moderateDetail.value = null;
  modInvites.value = [];
  modMsg.value = "";
  moderatePassword.value = "";
  moderateGemInput.value = "";
}

async function giveModerateGems() {
  const id = moderateUserId.value;
  if (!auth.token || !id || !moderateDetail.value) return;
  const n = Math.floor(Number(String(moderateGemInput.value).trim()));
  if (!Number.isFinite(n) || n < 1 || n > 100_000) {
    modMsg.value = "число от 1 до 100000";
    return;
  }
  modBusy.value = true;
  modMsg.value = "";
  try {
    const r = await postAdminUserCoins(auth.token, id, n);
    moderateDetail.value.coins = r.coins;
    moderateGemInput.value = "";
    await load();
    modMsg.value = "начислено";
  } catch (e) {
    modMsg.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    modBusy.value = false;
  }
}

async function saveModerateProfile() {
  if (!auth.token || !moderateUserId.value) return;
  modBusy.value = true;
  modMsg.value = "";
  try {
    const id = moderateUserId.value;
    const body: Parameters<typeof patchAdminUserProfile>[2] = {
      nickname: moderateNick.value.trim(),
      full_name: moderateFullName.value,
      website_url: moderateWebsite.value,
      bio: moderateBio.value,
      readme_md: moderateReadme.value,
      social_links: moderateSocial.value
        .filter((s) => s.url.trim().length > 0)
        .map((s) => ({ name: s.name.trim(), url: s.url.trim() })),
    };
    const pw = moderatePassword.value.trim();
    if (pw.length > 0) body.new_password = pw;
    await patchAdminUserProfile(auth.token, id, body);
    moderatePassword.value = "";
    await load();
    modMsg.value = "сохранено";
  } catch (e) {
    modMsg.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    modBusy.value = false;
  }
}

function addModerateSocial() {
  if (moderateSocial.value.length >= 12) return;
  moderateSocial.value.push({ name: "", url: "" });
}

function removeModerateSocial(idx: number) {
  moderateSocial.value.splice(idx, 1);
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

function fullInviteUrl(code: string) {
  return `${window.location.origin}/register?invite=${encodeURIComponent(code)}`;
}

async function removeModerateInvite(inviteId: string) {
  if (!auth.token || !moderateUserId.value) return;
  modBusy.value = true;
  modMsg.value = "";
  try {
    await deleteAdminUserInvite(auth.token, moderateUserId.value, inviteId);
    modInvites.value = await listAdminUserInvites(auth.token, moderateUserId.value);
    modMsg.value = "инвайт удалён";
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

async function deleteReport(id: string) {
  if (!auth.token) return;
  if (!window.confirm("удалить жалобу?")) return;
  try {
    await deleteBlogReport(id, auth.token);
    reports.value = await listBlogReports(auth.token);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

function reportPostId(r: BlogReport): string | null {
  return r.related_post_id ?? r.target_post_id;
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
      <button class="link" :class="{ active: tab === 'shop' }" type="button" @click="tab = 'shop'">
        магазин
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
      <div v-if="moderateUserId" class="mod-panel">
        <template v-if="moderateDetail">
          <p class="mod-title">
            <strong>{{ moderateDetail.nickname }}</strong>
            <span class="muted small"> · {{ moderateDetail.email }}</span>
          </p>
          <div class="mod-gems">
            <span class="muted small">монеты · {{ moderateDetail.coins ?? 0 }}</span>
            <input
              v-model="moderateGemInput"
              type="number"
              min="1"
              max="100000"
              step="1"
              class="gem-in"
              placeholder="сколько"
            />
            <button type="button" class="secondary" :disabled="modBusy" @click="giveModerateGems">выдать</button>
          </div>
          <div v-if="moderateDetail.avatar_url" class="mod-avatar">
            <img :src="moderateDetail.avatar_url" alt="" />
          </div>
          <div class="mod-grid">
            <label class="mod-field">
              <span class="muted small">ник</span>
              <input v-model="moderateNick" type="text" autocomplete="off" />
            </label>
            <label class="mod-field">
              <span class="muted small">имя</span>
              <input v-model="moderateFullName" type="text" autocomplete="name" />
            </label>
            <label class="mod-field mod-field-wide">
              <span class="muted small">сайт</span>
              <input v-model="moderateWebsite" type="url" autocomplete="url" />
            </label>
            <label class="mod-field mod-field-wide">
              <span class="muted small">описание (bio)</span>
              <textarea v-model="moderateBio" rows="2" />
            </label>
            <label class="mod-field mod-field-wide">
              <span class="muted small">readme · markdown (макс. {{ README_MAX }})</span>
              <textarea v-model="moderateReadme" rows="4" :maxlength="README_MAX" />
            </label>
            <label class="mod-field mod-field-wide">
              <span class="muted small">новый пароль</span>
              <input v-model="moderatePassword" type="password" autocomplete="new-password" />
            </label>
          </div>
          <div class="mod-social">
            <p class="muted small">соцсети</p>
            <ul class="mod-social-list">
              <li v-for="(s, idx) in moderateSocial" :key="idx" class="mod-social-row">
                <input v-model="s.name" type="text" placeholder="название" />
                <input v-model="s.url" type="url" placeholder="url" />
                <button class="secondary" type="button" @click="removeModerateSocial(idx)">×</button>
              </li>
            </ul>
            <button class="secondary small" type="button" :disabled="moderateSocial.length >= 12" @click="addModerateSocial">
              + ссылка
            </button>
          </div>
          <div class="mod-actions">
            <button type="button" :disabled="modBusy || moderateReadme.length > README_MAX" @click="saveModerateProfile">
              сохранить профиль
            </button>
            <label class="file-label secondary">
              аватар
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                :disabled="modBusy"
                hidden
                @change="onModerateAvatarFile"
              />
            </label>
            <button class="secondary" type="button" :disabled="modBusy" @click="resetModerateAvatar">сбросить аватар</button>
            <button class="secondary" type="button" :disabled="modBusy" @click="closeModerate">закрыть</button>
          </div>
          <div class="mod-limits">
            <p class="muted small">лимиты</p>
            <div class="lim-block">
              <span class="lim-title">блог</span>
              <label class="lim-row">
                <input v-model="modLimBlog.ban_forever" type="checkbox" />
                <span>навсегда</span>
              </label>
              <label class="lim-row lim-grow">
                <span class="muted small">до</span>
                <input v-model="modLimBlog.ban_until" type="datetime-local" :disabled="modLimBlog.ban_forever" />
              </label>
              <div class="lim-presets">
                <button class="secondary small" type="button" :disabled="modBusy || modLimBlog.ban_forever" @click="presetBan('blog', 'day')">+день</button>
                <button class="secondary small" type="button" :disabled="modBusy || modLimBlog.ban_forever" @click="presetBan('blog', 'month')">+месяц</button>
                <button class="secondary small" type="button" :disabled="modBusy || modLimBlog.ban_forever" @click="presetBan('blog', 'year')">+год</button>
              </div>
              <label class="lim-row">
                <span class="muted small">макс</span>
                <input v-model="modLimBlog.max_per_period" class="lim-num" type="number" min="1" step="1" />
              </label>
              <select v-model="modLimBlog.period" class="lim-select">
                <option value="day">день</option>
                <option value="month">месяц</option>
                <option value="year">год</option>
                <option value="all">всё время</option>
              </select>
              <label class="lim-row">
                <span class="muted small">ч между</span>
                <input v-model="modLimBlog.min_interval_hours" class="lim-num" type="text" inputmode="decimal" />
              </label>
            </div>
            <div class="lim-block">
              <span class="lim-title">микро</span>
              <label class="lim-row">
                <input v-model="modLimMicro.ban_forever" type="checkbox" />
                <span>навсегда</span>
              </label>
              <label class="lim-row lim-grow">
                <span class="muted small">до</span>
                <input v-model="modLimMicro.ban_until" type="datetime-local" :disabled="modLimMicro.ban_forever" />
              </label>
              <div class="lim-presets">
                <button class="secondary small" type="button" :disabled="modBusy || modLimMicro.ban_forever" @click="presetBan('micro', 'day')">+день</button>
                <button class="secondary small" type="button" :disabled="modBusy || modLimMicro.ban_forever" @click="presetBan('micro', 'month')">+месяц</button>
                <button class="secondary small" type="button" :disabled="modBusy || modLimMicro.ban_forever" @click="presetBan('micro', 'year')">+год</button>
              </div>
              <label class="lim-row">
                <span class="muted small">макс</span>
                <input v-model="modLimMicro.max_per_period" class="lim-num" type="number" min="1" step="1" />
              </label>
              <select v-model="modLimMicro.period" class="lim-select">
                <option value="day">день</option>
                <option value="month">месяц</option>
                <option value="year">год</option>
                <option value="all">всё время</option>
              </select>
              <label class="lim-row">
                <span class="muted small">ч между</span>
                <input v-model="modLimMicro.min_interval_hours" class="lim-num" type="text" inputmode="decimal" />
              </label>
            </div>
            <div class="lim-block">
              <span class="lim-title">комменты</span>
              <label class="lim-row">
                <input v-model="modLimComment.ban_forever" type="checkbox" />
                <span>навсегда</span>
              </label>
              <label class="lim-row lim-grow">
                <span class="muted small">до</span>
                <input v-model="modLimComment.ban_until" type="datetime-local" :disabled="modLimComment.ban_forever" />
              </label>
              <div class="lim-presets">
                <button class="secondary small" type="button" :disabled="modBusy || modLimComment.ban_forever" @click="presetBan('comment', 'day')">+день</button>
                <button class="secondary small" type="button" :disabled="modBusy || modLimComment.ban_forever" @click="presetBan('comment', 'month')">+месяц</button>
                <button class="secondary small" type="button" :disabled="modBusy || modLimComment.ban_forever" @click="presetBan('comment', 'year')">+год</button>
              </div>
              <label class="lim-row">
                <span class="muted small">макс</span>
                <input v-model="modLimComment.max_per_period" class="lim-num" type="number" min="1" step="1" />
              </label>
              <select v-model="modLimComment.period" class="lim-select">
                <option value="day">день</option>
                <option value="month">месяц</option>
                <option value="year">год</option>
                <option value="all">всё время</option>
              </select>
              <label class="lim-row">
                <span class="muted small">ч между</span>
                <input v-model="modLimComment.min_interval_hours" class="lim-num" type="text" inputmode="decimal" />
              </label>
            </div>
            <div class="lim-block">
              <span class="lim-title">чаты</span>
              <label class="lim-row">
                <input v-model="modLimChat.ban_forever" type="checkbox" />
                <span>навсегда</span>
              </label>
              <label class="lim-row lim-grow">
                <span class="muted small">до</span>
                <input v-model="modLimChat.ban_until" type="datetime-local" :disabled="modLimChat.ban_forever" />
              </label>
              <div class="lim-presets">
                <button class="secondary small" type="button" :disabled="modBusy || modLimChat.ban_forever" @click="presetBan('chat', 'day')">+день</button>
                <button class="secondary small" type="button" :disabled="modBusy || modLimChat.ban_forever" @click="presetBan('chat', 'month')">+месяц</button>
                <button class="secondary small" type="button" :disabled="modBusy || modLimChat.ban_forever" @click="presetBan('chat', 'year')">+год</button>
              </div>
              <label class="lim-row">
                <span class="muted small">макс</span>
                <input v-model="modLimChat.max_per_period" class="lim-num" type="number" min="1" step="1" />
              </label>
              <select v-model="modLimChat.period" class="lim-select">
                <option value="day">день</option>
                <option value="month">месяц</option>
                <option value="year">год</option>
                <option value="all">всё время</option>
              </select>
              <label class="lim-row">
                <span class="muted small">ч между</span>
                <input v-model="modLimChat.min_interval_hours" class="lim-num" type="text" inputmode="decimal" />
              </label>
            </div>
            <button type="button" :disabled="modBusy" @click="saveModerateLimits">сохранить лимиты</button>
          </div>
          <div class="mod-invites">
            <p class="muted small">инвайты пользователя</p>
            <ul v-if="modInvites.length" class="invite-list">
              <li v-for="inv in modInvites" :key="inv.id">
                <code class="invite-code">{{ fullInviteUrl(inv.code) }}</code>
                <span class="muted small">{{ inv.target_role }} · осталось {{ inv.remaining }}</span>
                <button class="secondary small" type="button" :disabled="modBusy" @click="removeModerateInvite(inv.id)">
                  удалить
                </button>
              </li>
            </ul>
            <p v-else class="muted small">нет активных</p>
            <div class="row-actions">
              <button class="secondary" type="button" :disabled="modBusy" @click="addModerateInvite('student')">
                + инвайт ученик
              </button>
              <button class="secondary" type="button" :disabled="modBusy" @click="addModerateInvite('teacher')">
                + инвайт ментор
              </button>
            </div>
          </div>
        </template>
        <p v-if="modMsg" class="muted small">{{ modMsg }}</p>
        <button v-if="!moderateDetail" class="secondary" type="button" @click="closeModerate">закрыть</button>
      </div>
      <p v-if="!filteredUsers.length" class="muted">не найдено</p>
      <ul v-else class="list">
        <li v-for="u in filteredUsers" :key="u.id">
          <div>
            <strong>{{ u.nickname }}</strong>
            <span class="muted small"> · {{ u.role }} · {{ u.status }} · {{ u.coins ?? 0 }} · {{ u.email }}</span>
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
            <span class="muted small">
              · {{ r.status }} · {{ r.created_at.slice(0, 16).replace("T", " ") }}
            </span>
          </div>
          <p class="muted small report-meta">
            от <strong>{{ r.reporter_nickname || r.reporter_user_id }}</strong>
          </p>
          <p v-if="reportPostId(r) && r.post_title" class="report-target">
            <RouterLink :to="`/blogs/${reportPostId(r)}`">{{ r.post_title }}</RouterLink>
            <span v-if="r.post_author_nickname" class="muted small"> · {{ r.post_author_nickname }}</span>
          </p>
          <p v-else-if="r.target_type === 'post'" class="muted small">пост не найден</p>
          <p v-else-if="r.target_type === 'comment' && !reportPostId(r)" class="muted small">пост не найден</p>
          <p v-if="r.target_type === 'comment' && r.comment_preview" class="reason comment-excerpt">
            «{{ r.comment_preview }}»
            <span v-if="r.comment_author_nickname" class="muted small"> · {{ r.comment_author_nickname }}</span>
          </p>
          <p v-if="r.reason.trim()" class="reason"><strong>текст жалобы:</strong> {{ r.reason }}</p>
          <div class="row-actions">
            <button class="secondary" type="button" @click="resolveReport(r.id, 'resolved')">решено</button>
            <button class="secondary" type="button" @click="resolveReport(r.id, 'dismissed')">отклонить</button>
            <button
              v-if="r.target_type === 'post' && reportPostId(r)"
              class="secondary"
              type="button"
              @click="hidePost(reportPostId(r))"
            >
              скрыть пост
            </button>
            <button v-if="r.target_type === 'comment'" class="secondary" type="button" @click="hideComment(r.target_comment_id)">
              скрыть коммент
            </button>
            <button v-if="r.target_type === 'comment'" class="secondary" type="button" @click="restoreComment(r.target_comment_id)">
              вернуть коммент
            </button>
            <button class="secondary danger" type="button" @click="deleteReport(r.id)">удалить</button>
          </div>
        </li>
      </ul>
    </template>

    <template v-else-if="tab === 'shop'">
      <h2>товары магазина</h2>
      <p v-if="shopMsg" class="ok-msg small">{{ shopMsg }}</p>
      <div class="shop-add">
        <select v-model="shopUploadKind" class="shop-input shop-kind" aria-label="тип">
          <option value="avatar">аватар</option>
          <option value="frame">рамка</option>
          <option value="wallpaper">фон</option>
          <option value="cover">обложка</option>
        </select>
        <input v-model="shopUploadName" placeholder="название" class="shop-input" />
        <input v-model.number="shopUploadPrice" type="number" min="0" step="1" placeholder="цена" class="shop-input shop-price" />
        <input v-model="shopUploadStock" inputmode="numeric" placeholder="тираж" class="shop-input shop-stock" aria-label="тираж" />
        <label class="btn-file" :class="{ disabled: shopUploadBusy }">
          <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" :disabled="shopUploadBusy" @change="onShopItemFile" />
          {{ shopUploadBusy ? "загрузка…" : "загрузить" }}
        </label>
      </div>
      <p class="muted small gif">тираж пустой — без лимита. gif — без сжатия.</p>
      <p v-if="shopLoading" class="muted small">загрузка…</p>
      <ul v-else-if="shopItems.length" class="shop-grid">
        <li v-for="a in shopItems" :key="a.id" class="shop-item">
          <img :src="a.url" :alt="a.name" class="shop-avatar-img" loading="lazy" />
          <span class="shop-avatar-meta">
            <span>{{ a.name }}</span>
            <span class="muted small">{{ shopKindRu(a.kind) }} · {{ a.price }} · {{ a.is_animated ? "gif" : "" }}{{ shopStockLine(a) }}</span>
          </span>
          <button class="secondary danger shop-del" type="button" @click="removeShopItem(a.id)">удалить</button>
        </li>
      </ul>
      <p v-else class="muted small">пусто</p>
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
.report-target {
  margin: 0;
  font-size: 0.9rem;
}
.comment-excerpt {
  font-size: 0.85rem;
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
.mod-gems {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}
.gem-in {
  width: 5.5rem;
  min-height: 2rem;
  box-sizing: border-box;
  font: inherit;
  padding: 0.35rem 0.45rem;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  border-radius: var(--radius);
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
.mod-grid {
  display: grid;
  gap: 0.65rem;
  grid-template-columns: 1fr 1fr;
}
.mod-field {
  display: grid;
  gap: 0.25rem;
}
.mod-field-wide {
  grid-column: 1 / -1;
}
.mod-field input,
.mod-field textarea {
  font: inherit;
  padding: 0.45rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
}
.mod-social {
  margin-top: 0.5rem;
}
.mod-social-list {
  list-style: none;
  padding: 0;
  margin: 0.35rem 0;
  display: grid;
  gap: 0.35rem;
}
.mod-social-row {
  display: grid;
  grid-template-columns: 1fr 2fr auto;
  gap: 0.35rem;
  align-items: center;
}
.mod-social-row input {
  font: inherit;
  padding: 0.35rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
}
.invite-list {
  list-style: none;
  padding: 0;
  margin: 0 0 0.5rem;
  display: grid;
  gap: 0.5rem;
}
.invite-list li {
  display: grid;
  gap: 0.25rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border);
}
.invite-code {
  font-size: 0.75rem;
  word-break: break-all;
}
.mod-invites {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
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
.mod-limits {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
  display: grid;
  gap: 0.65rem;
}
.lim-block {
  display: grid;
  gap: 0.35rem;
  grid-template-columns: auto 1fr;
  align-items: center;
}
.lim-title {
  grid-column: 1 / -1;
  font-size: 0.85rem;
  color: var(--muted);
}
.lim-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
}
.lim-grow {
  grid-column: 1 / -1;
}
.lim-grow input[type="datetime-local"] {
  flex: 1;
  min-width: 0;
  font: inherit;
  padding: 0.3rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
}
.lim-presets {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.lim-num {
  width: 4rem;
  font: inherit;
  padding: 0.25rem 0.35rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
}
.lim-select {
  font: inherit;
  padding: 0.25rem 0.35rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
}
.shop-add {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
  align-items: center;
}
.shop-input {
  font: inherit;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
  flex: 1;
  min-width: 140px;
}
.shop-price {
  max-width: 120px;
  flex: none;
}
.shop-stock {
  max-width: 88px;
  flex: none;
}
.shop-kind {
  flex: 0 0 auto;
  min-width: 6.5rem;
  max-width: 9rem;
}
.btn-file {
  display: inline-block;
  cursor: pointer;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.4rem 0.7rem;
  background: var(--surface2);
  font-size: 0.9rem;
}
.btn-file.disabled {
  opacity: 0.5;
  pointer-events: none;
}
.btn-file input {
  display: none;
}
.shop-grid {
  list-style: none;
  padding: 0;
  margin: 0.8rem 0 0;
  display: grid;
  gap: 0.5rem;
}
.shop-item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.shop-avatar-img {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  object-fit: cover;
  border: 1px solid var(--border);
  flex-shrink: 0;
}
.shop-avatar-meta {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  flex: 1;
  min-width: 0;
  font-size: 0.88rem;
  overflow: hidden;
}
.shop-del {
  margin-left: auto;
}
.ok-msg {
  color: var(--text);
  margin-bottom: 0.4rem;
}
</style>
