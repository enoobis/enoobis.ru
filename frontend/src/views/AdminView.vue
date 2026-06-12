<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type Ref } from "vue";
import { RouterLink } from "vue-router";
import FilterSearch from "../components/FilterSearch.vue";
import PageHeader from "../components/PageHeader.vue";
import AdminWorkTab from "../components/AdminWorkTab.vue";
import AppIcon from "../components/AppIcon.vue";
import { api } from "../api/http";
import {
  approveBlogPost,
  deleteBlogReport,
  hideCommentByAdmin,
  hidePostByAdmin,
  listBlogReports,
  listPendingBlogPosts,
  resolveBlogReport,
  restoreCommentByAdmin,
  type BlogReport,
  type PendingBlogPost,
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
  adminCreateShopCategory,
  adminDeleteShopCategory,
  adminDeleteShopItem,
  adminListShopCategories,
  adminPatchShopItem,
  adminUpdateShopCategory,
  adminUploadShopItem,
  listShopItems,
  type ImageShopKind,
  type ShopCategory,
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
type Tab = "pending" | "users" | "reports" | "shop" | "blogs" | "work";

const auth = useAuthStore();
const isFullAdmin = computed(() => auth.isAdmin);
const tab = ref<Tab>("pending");
const pending = ref<Pending[]>([]);
const blogPending = ref<PendingBlogPost[]>([]);
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
const shopCategories = ref<ShopCategory[]>([]);
const shopCatNames = ref<Record<string, string>>({});
const shopNewCatId = ref("");
const shopNewCatName = ref("");
const shopCatBusy = ref(false);
const shopUploadCategoryIds = ref<string[]>([]);
const shopAddOpen = ref(false);
const shopPendingFile = ref<File | null>(null);
const shopUploadKind = ref<ImageShopKind>("avatar");
const shopUploadBusy = ref(false);
const shopKindOptions: { value: ImageShopKind; label: string }[] = [
  { value: "avatar", label: "аватар" },
  { value: "frame", label: "рамка" },
  { value: "wallpaper", label: "фон" },
  { value: "cover", label: "обложка" },
];
const shopEditOpen = ref(false);
const shopEditTarget = ref<ShopItem | null>(null);
const shopEditKind = ref<ImageShopKind>("avatar");
const shopEditCategoryIds = ref<string[]>([]);
const shopEditName = ref("");
const shopEditPrice = ref(0);
const shopEditStock = ref("");
const shopEditBusy = ref(false);
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

function syncShopCatNames() {
  const m: Record<string, string> = {};
  for (const c of shopCategories.value) m[c.id] = c.name;
  shopCatNames.value = m;
}

async function loadShopCategories() {
  if (!auth.token) return;
  try {
    shopCategories.value = await adminListShopCategories(auth.token);
    syncShopCatNames();
  } catch {
    /* ignore */
  }
}

function toggleCatIn(ids: Ref<string[]>, id: string) {
  const cur = ids.value;
  ids.value = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
}

function toggleUploadCat(id: string) {
  toggleCatIn(shopUploadCategoryIds, id);
}

function toggleEditCat(id: string) {
  toggleCatIn(shopEditCategoryIds, id);
}

async function saveShopCategoryName(id: string) {
  if (!auth.token) return;
  const name = (shopCatNames.value[id] ?? "").trim();
  if (!name) {
    shopMsg.value = "нужно название";
    return;
  }
  shopCatBusy.value = true;
  shopMsg.value = "";
  try {
    await adminUpdateShopCategory(auth.token, id, name);
    shopMsg.value = "сохранено";
    await loadShopCategories();
  } catch (ex) {
    shopMsg.value = ex instanceof Error ? ex.message : "ошибка";
  } finally {
    shopCatBusy.value = false;
  }
}

async function addShopCategory() {
  if (!auth.token) return;
  const id = shopNewCatId.value.trim().toLowerCase();
  const name = shopNewCatName.value.trim().toLowerCase();
  if (!id || !name) {
    shopMsg.value = "id и название";
    return;
  }
  shopCatBusy.value = true;
  shopMsg.value = "";
  try {
    await adminCreateShopCategory(auth.token, id, name);
    shopNewCatId.value = "";
    shopNewCatName.value = "";
    shopMsg.value = "категория добавлена";
    await loadShopCategories();
  } catch (ex) {
    shopMsg.value = ex instanceof Error ? ex.message : "ошибка";
  } finally {
    shopCatBusy.value = false;
  }
}

async function removeShopCategory(id: string) {
  if (!auth.token) return;
  shopCatBusy.value = true;
  shopMsg.value = "";
  try {
    await adminDeleteShopCategory(auth.token, id);
    shopUploadCategoryIds.value = shopUploadCategoryIds.value.filter((x) => x !== id);
    shopEditCategoryIds.value = shopEditCategoryIds.value.filter((x) => x !== id);
    await loadShopCategories();
    await loadShopItems();
    shopMsg.value = "удалено";
  } catch (ex) {
    shopMsg.value = ex instanceof Error ? ex.message : "ошибка";
  } finally {
    shopCatBusy.value = false;
  }
}

function shopItemCatsLine(item: ShopItem): string {
  return (item.categories ?? []).map((c) => c.name).join(" · ");
}

async function loadShopItems() {
  if (!auth.token) return;
  shopLoading.value = true;
  try {
    await loadShopCategories();
    shopItems.value = await listShopItems(auth.token);
  } catch {
    /* ignore */
  } finally {
    shopLoading.value = false;
  }
}

function shopStockToInput(limit: number | null) {
  if (limit == null) return "";
  const n = Math.floor(Number(limit));
  return n > 0 ? String(n) : "";
}

function openShopEdit(item: ShopItem) {
  shopEditTarget.value = item;
  shopEditKind.value = item.kind;
  shopEditCategoryIds.value = (item.categories ?? []).map((c) => c.id);
  shopEditName.value = item.name;
  shopEditPrice.value = item.price;
  shopEditStock.value = shopStockToInput(item.stock_limit);
  shopEditOpen.value = true;
}

function closeShopEdit() {
  shopEditOpen.value = false;
  shopEditTarget.value = null;
}

function parseShopEditStock(): number | null | false {
  const raw = shopEditStock.value.trim();
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return false;
  return n;
}

async function saveShopEdit() {
  const item = shopEditTarget.value;
  if (!item || !auth.token) return;
  const name = shopEditName.value.trim();
  if (!name) {
    shopMsg.value = "нужно название";
    return;
  }
  const stock = parseShopEditStock();
  if (stock === false) {
    shopMsg.value = "тираж: целое от 1 или пусто";
    return;
  }
  shopEditBusy.value = true;
  shopMsg.value = "";
  try {
    await adminPatchShopItem(auth.token, item.id, {
      kind: shopEditKind.value,
      categories: [...shopEditCategoryIds.value],
      name,
      price: Math.max(0, Math.floor(Number(shopEditPrice.value) || 0)),
      stock_limit: stock,
    });
    shopMsg.value = "сохранено";
    closeShopEdit();
    await loadShopItems();
  } catch (ex) {
    shopMsg.value = ex instanceof Error ? ex.message : "ошибка";
  } finally {
    shopEditBusy.value = false;
  }
}

function closeShopAdd() {
  shopAddOpen.value = false;
  shopPendingFile.value = null;
  shopUploadCategoryIds.value = [];
}

function onShopEditEscape(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  if (shopAddOpen.value) closeShopAdd();
  else if (shopEditOpen.value) closeShopEdit();
  else if (moderateUserId.value) closeModerate();
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

function onShopItemFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = "";
  if (!file || !auth.token) return;
  shopPendingFile.value = file;
  if (!shopUploadName.value.trim()) shopUploadName.value = file.name.replace(/\.[^.]+$/, "");
  shopUploadCategoryIds.value = [];
  shopAddOpen.value = true;
}

async function confirmShopUpload() {
  const file = shopPendingFile.value;
  if (!file || !auth.token) return;
  if ((file.type === "video/mp4" || file.type === "video/webm") && shopUploadKind.value !== "wallpaper") {
    shopMsg.value = "видео только для фона";
    return;
  }
  if ((file.type === "video/mp4" || file.type === "video/webm") && file.size > 10 * 1024 * 1024) {
    shopMsg.value = "видео до 10 мб";
    return;
  }
  const name = shopUploadName.value.trim();
  if (!name) {
    shopMsg.value = "нужно название";
    return;
  }
  const price = Math.max(0, Math.floor(Number(shopUploadPrice.value) || 0));
  const rawStock = shopUploadStock.value.trim();
  let stockLimit: number | null = null;
  if (rawStock !== "") {
    const n = parseInt(rawStock, 10);
    if (!Number.isFinite(n) || n < 1) {
      shopMsg.value = "тираж: целое от 1";
      return;
    }
    stockLimit = n;
  }
  shopUploadBusy.value = true;
  shopMsg.value = "";
  try {
    await adminUploadShopItem(
      auth.token,
      file,
      shopUploadKind.value,
      name,
      price,
      stockLimit,
      [...shopUploadCategoryIds.value],
    );
    shopUploadName.value = "";
    shopUploadPrice.value = 0;
    shopUploadStock.value = "";
    closeShopAdd();
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
    if (auth.token) {
      blogPending.value = await listPendingBlogPosts(auth.token);
    }
    reports.value = await listBlogReports(auth.token ?? "");
    if (isFullAdmin.value) {
      users.value = await api<AdminUser[]>("/api/admin/users", { token: auth.token });
      if (moderateUserId.value && auth.token) {
        try {
          moderateDetail.value = await getAdminUserDetail(auth.token, moderateUserId.value);
          syncModerateFromDetail();
          modInvites.value = await listAdminUserInvites(auth.token, moderateUserId.value);
        } catch {
          /* панель закроется при ошибке */
        }
      }
    }
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

watch(tab, (t) => {
  if (!isFullAdmin.value && (t === "users" || t === "work")) tab.value = "reports";
});

onMounted(() => {
  if (!isFullAdmin.value) tab.value = "reports";
  void load();
  void loadShopItems();
  document.addEventListener("visibilitychange", onAdminModerateVisibility);
  document.addEventListener("keydown", onShopEditEscape);
  adminModeratePoll = setInterval(() => void refreshModerateOpen(), ADMIN_POLL_MS);
});

onUnmounted(() => {
  document.removeEventListener("visibilitychange", onAdminModerateVisibility);
  document.removeEventListener("keydown", onShopEditEscape);
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

async function setRole(id: string, role: "student" | "teacher" | "master" | "moderator") {
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

const moderateRole = computed(
  () => users.value.find((x) => x.id === moderateUserId.value)?.role ?? "",
);

function roleRu(r: string) {
  if (r === "admin") return "админ";
  if (r === "moderator") return "модератор";
  if (r === "teacher") return "ментор";
  if (r === "master") return "мастер";
  return "ученик";
}

const coinsRowId = ref<string | null>(null);
const coinsRowInput = ref("");
const coinsRowBusy = ref(false);

function toggleCoinsRow(id: string) {
  coinsRowId.value = coinsRowId.value === id ? null : id;
  coinsRowInput.value = "";
}

async function giveCoinsRow(u: AdminUser) {
  if (!auth.token || coinsRowBusy.value) return;
  const n = Math.floor(Number(coinsRowInput.value.trim()));
  if (!Number.isFinite(n) || n < 1 || n > 100_000) {
    err.value = "монеты: число от 1 до 100000";
    return;
  }
  coinsRowBusy.value = true;
  err.value = "";
  try {
    const r = await postAdminUserCoins(auth.token, u.id, n);
    u.coins = r.coins;
    coinsRowId.value = null;
    coinsRowInput.value = "";
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    coinsRowBusy.value = false;
  }
}

async function setModerateRole(role: "student" | "teacher" | "master" | "moderator") {
  if (!moderateUserId.value || modBusy.value) return;
  modBusy.value = true;
  modMsg.value = "";
  try {
    await setRole(moderateUserId.value, role);
    modMsg.value = "роль обновлена";
  } catch (e) {
    modMsg.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    modBusy.value = false;
  }
}

async function removeModerateUser() {
  const u = users.value.find((x) => x.id === moderateUserId.value);
  if (!u) return;
  await removeUser(u.id, u.nickname);
  if (!users.value.some((x) => x.id === u.id)) closeModerate();
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

async function approveBlog(id: string) {
  if (!auth.token) return;
  try {
    await approveBlogPost(id, auth.token);
    blogPending.value = blogPending.value.filter((p) => p.id !== id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}
</script>

<template>
  <section class="admin page-shell">
    <PageHeader :title="isFullAdmin ? 'админ' : 'модерация'" />
    <nav class="filter-tabs admin-tabs">
      <button class="filter-tab" :class="{ on: tab === 'pending' }" type="button" @click="tab = 'pending'">
        заявки <span v-if="pending.length" class="muted small">{{ pending.length }}</span>
      </button>
      <button
        v-if="isFullAdmin"
        class="filter-tab"
        :class="{ on: tab === 'users' }"
        type="button"
        @click="tab = 'users'"
      >
        люди
      </button>
      <button class="filter-tab" :class="{ on: tab === 'shop' }" type="button" @click="tab = 'shop'">
        магазин
      </button>
      <button class="filter-tab" :class="{ on: tab === 'blogs' }" type="button" @click="tab = 'blogs'">
        блоги <span v-if="blogPending.length" class="muted small">{{ blogPending.length }}</span>
      </button>
      <button
        v-if="isFullAdmin"
        class="filter-tab"
        :class="{ on: tab === 'work' }"
        type="button"
        @click="tab = 'work'"
      >
        работа
      </button>
      <button class="filter-tab" :class="{ on: tab === 'reports' }" type="button" @click="tab = 'reports'">
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
            <button
              v-if="isFullAdmin"
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

    <template v-else-if="tab === 'blogs'">
      <p v-if="!blogPending.length" class="muted">пусто</p>
      <ul v-else class="list">
        <li v-for="p in blogPending" :key="p.id">
          <div>
            <strong>{{ p.title }}</strong>
            <span class="muted small">
              · {{ p.author_nickname }} · {{ (p.updated_at || p.created_at).slice(0, 10) }}
              · {{ p.status === "recalled" ? "отозван" : "новый" }}
            </span>
          </div>
          <div class="row-actions">
            <RouterLink :to="`/blogs/${p.id}/edit`" class="secondary">редактировать</RouterLink>
            <RouterLink :to="`/blogs/${p.id}`" class="secondary">просмотр</RouterLink>
            <button type="button" @click="approveBlog(p.id)">одобрить</button>
          </div>
        </li>
      </ul>
    </template>

    <template v-else-if="tab === 'users' && isFullAdmin">
      <FilterSearch v-model="usersQuery" class="admin-users-search" />
      <p v-if="!filteredUsers.length" class="muted">не найдено</p>
      <ul v-else class="list user-list">
        <li v-for="u in filteredUsers" :key="u.id" class="user-row">
          <span class="user-ava">
            <img v-if="u.avatar_url" :src="u.avatar_url" alt="" loading="lazy" />
          </span>
          <div class="user-info">
            <strong>{{ u.nickname }}</strong>
            <span class="muted small">{{ roleRu(u.role) }} · {{ u.status }} · {{ u.email }}</span>
          </div>
          <div class="user-side">
            <template v-if="coinsRowId === u.id">
              <input
                v-model="coinsRowInput"
                class="gem-in"
                type="number"
                min="1"
                max="100000"
                step="1"
                placeholder="сколько"
                @keydown.enter.prevent="giveCoinsRow(u)"
              />
              <button type="button" :disabled="coinsRowBusy" @click="giveCoinsRow(u)">выдать</button>
              <button class="secondary user-coins-cancel" type="button" aria-label="отмена" @click="toggleCoinsRow(u.id)">
                <AppIcon name="close" :size="14" />
              </button>
            </template>
            <template v-else>
              <button class="user-coins" type="button" title="начислить монеты" @click="toggleCoinsRow(u.id)">
                <img src="/coin-gem.png" alt="" width="16" height="16" />
                <span>{{ u.coins ?? 0 }}</span>
                <span class="user-coins-plus">+</span>
              </button>
              <button class="secondary" type="button" :disabled="modBusy" @click="openModerate(u)">открыть</button>
            </template>
          </div>
        </li>
      </ul>

      <Teleport to="body">
      <div v-if="moderateUserId" class="shop-edit-root" role="presentation">
        <button type="button" class="shop-edit-backdrop" aria-label="закрыть" @click="closeModerate" />
        <div class="shop-edit-dialog card mod-modal" role="dialog" aria-modal="true" aria-label="пользователь">
        <template v-if="moderateDetail">
          <header class="mod-head">
            <span class="mod-avatar">
              <img v-if="moderateDetail.avatar_url" :src="moderateDetail.avatar_url" alt="" />
            </span>
            <div class="mod-head-info">
              <strong>{{ moderateDetail.nickname }}</strong>
              <span class="muted small">{{ moderateDetail.email }}</span>
            </div>
            <button class="mod-close" type="button" aria-label="закрыть" @click="closeModerate">
              <AppIcon name="close" :size="18" />
            </button>
          </header>

          <div class="mod-coins">
            <img src="/coin-gem.png" alt="" width="18" height="18" />
            <strong>{{ moderateDetail.coins ?? 0 }}</strong>
            <input
              v-model="moderateGemInput"
              type="number"
              min="1"
              max="100000"
              step="1"
              class="gem-in"
              placeholder="сколько"
              @keydown.enter.prevent="giveModerateGems"
            />
            <button type="button" class="secondary" :disabled="modBusy" @click="giveModerateGems">начислить</button>
          </div>

          <div
            v-if="moderateRole !== 'admin' && moderateRole !== 'moderator'"
            class="filter-tabs mod-role"
          >
            <button class="filter-tab" type="button" :class="{ on: moderateRole === 'student' }" :disabled="modBusy" @click="setModerateRole('student')">ученик</button>
            <button class="filter-tab" type="button" :class="{ on: moderateRole === 'teacher' }" :disabled="modBusy" @click="setModerateRole('teacher')">ментор</button>
            <button class="filter-tab" type="button" :class="{ on: moderateRole === 'master' }" :disabled="modBusy" @click="setModerateRole('master')">мастер</button>
            <button
              v-if="isFullAdmin"
              class="filter-tab"
              type="button"
              :class="{ on: moderateRole === 'moderator' }"
              :disabled="modBusy"
              @click="setModerateRole('moderator')"
            >
              модератор
            </button>
          </div>

          <details class="mod-sec">
            <summary>профиль</summary>
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
          </div>
          </details>

          <details class="mod-sec">
            <summary>лимиты</summary>
          <div class="mod-limits">
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
          </details>

          <details class="mod-sec">
            <summary>инвайты</summary>
          <div class="mod-invites">
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
          </details>

          <button
            v-if="isFullAdmin && moderateRole !== 'admin' && moderateRole !== 'moderator'"
            class="secondary danger mod-delete"
            type="button"
            :disabled="modBusy"
            @click="removeModerateUser"
          >
            удалить пользователя
          </button>
        </template>
        <p v-if="!moderateDetail" class="muted small">загрузка…</p>
        <p v-if="modMsg" class="muted small">{{ modMsg }}</p>
        </div>
      </div>
      </Teleport>
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

      <label class="btn-file shop-upload-btn" :class="{ disabled: shopUploadBusy }">
        <input type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm" :disabled="shopUploadBusy" @change="onShopItemFile" />
        {{ shopUploadBusy ? "загрузка…" : "загрузить" }}
      </label>
      <p v-if="shopLoading" class="muted small">загрузка…</p>
      <ul v-else-if="shopItems.length" class="shop-grid">
        <li v-for="a in shopItems" :key="a.id" class="shop-item">
          <img v-if="a.url" :src="a.url" :alt="a.name" class="shop-avatar-img" loading="lazy" />
          <span class="shop-avatar-meta">
            <span>{{ a.name }}</span>
            <span class="muted small">
              {{ shopKindRu(a.kind) }}<template v-if="shopItemCatsLine(a)"> · {{ shopItemCatsLine(a) }}</template> ·
              {{ a.price }}{{ a.is_animated ? " · gif" : "" }}{{ shopStockLine(a) }}
            </span>
          </span>
          <div class="shop-item-actions">
            <button type="button" class="secondary" @click="openShopEdit(a)">изменить</button>
            <button type="button" class="secondary danger" @click="removeShopItem(a.id)">удалить</button>
          </div>
        </li>
      </ul>
      <p v-else class="muted small">пусто</p>

      <Teleport to="body">
        <div
          v-if="shopEditOpen && shopEditTarget"
          class="shop-edit-root"
          role="presentation"
        >
          <button type="button" class="shop-edit-backdrop" aria-label="закрыть" @click="closeShopEdit" />
          <div class="shop-edit-dialog card shop-modal" role="dialog" aria-modal="true" aria-label="редактирование товара">
            <h3 class="shop-edit-title">товар</h3>
            <div class="shop-modal-form">
              <label class="shop-edit-field">
                <span class="muted small">тип</span>
                <select v-model="shopEditKind" class="shop-input">
                  <option v-for="k in shopKindOptions" :key="k.value" :value="k.value">{{ k.label }}</option>
                </select>
              </label>
              <label class="shop-edit-field">
                <span class="muted small">название</span>
                <input v-model="shopEditName" class="shop-input" placeholder="название" />
              </label>
              <div class="shop-modal-row">
                <label class="shop-edit-field">
                  <span class="muted small">цена</span>
                  <input
                    v-model.number="shopEditPrice"
                    type="number"
                    min="0"
                    step="1"
                    class="shop-input"
                    placeholder="0"
                  />
                </label>
                <label class="shop-edit-field">
                  <span class="muted small">тираж</span>
                  <input
                    v-model="shopEditStock"
                    inputmode="numeric"
                    class="shop-input"
                    placeholder="пусто"
                  />
                </label>
              </div>
              <div v-if="shopCategories.length" class="shop-edit-field">
                <span class="muted small">категории</span>
                <div class="cat-chips" role="group">
                  <button
                    v-for="c in shopCategories"
                    :key="c.id"
                    type="button"
                    class="cat-chip"
                    :class="{ on: shopEditCategoryIds.includes(c.id) }"
                    :aria-pressed="shopEditCategoryIds.includes(c.id)"
                    @click="toggleEditCat(c.id)"
                  >
                    {{ c.name }}
                  </button>
                </div>
              </div>
            </div>
            <p v-if="shopEditTarget.stock_limit != null" class="muted small">
              продано {{ shopEditTarget.sold_count ?? 0 }} из {{ shopEditTarget.stock_limit }}
            </p>
            <details class="shop-cats-manage">
              <summary>список категорий</summary>
              <ul v-if="shopCategories.length" class="shop-cats-list">
                <li v-for="c in shopCategories" :key="c.id" class="shop-cats-row">
                  <input v-model="shopCatNames[c.id]" class="shop-input shop-cat-name" :aria-label="c.id" />
                  <button type="button" class="secondary" :disabled="shopCatBusy" @click="saveShopCategoryName(c.id)">
                    ок
                  </button>
                  <button type="button" class="secondary danger" :disabled="shopCatBusy" @click="removeShopCategory(c.id)">
                    ×
                  </button>
                </li>
              </ul>
              <div class="shop-cats-add">
                <input v-model="shopNewCatId" class="shop-input shop-cat-id" placeholder="id" />
                <input v-model="shopNewCatName" class="shop-input shop-cat-name" placeholder="название" />
                <button type="button" class="secondary" :disabled="shopCatBusy" @click="addShopCategory">добавить</button>
              </div>
            </details>
            <div class="shop-edit-actions">
              <button type="button" class="secondary" :disabled="shopEditBusy" @click="closeShopEdit">
                отмена
              </button>
              <button type="button" :disabled="shopEditBusy" @click="saveShopEdit">
                {{ shopEditBusy ? "сохранение…" : "сохранить" }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <Teleport to="body">
        <div v-if="shopAddOpen && shopPendingFile" class="shop-edit-root" role="presentation">
          <button type="button" class="shop-edit-backdrop" aria-label="закрыть" @click="closeShopAdd" />
          <div class="shop-edit-dialog card shop-modal" role="dialog" aria-modal="true" aria-label="новый товар">
            <h3 class="shop-edit-title">новый товар</h3>
            <div class="shop-modal-form">
              <label class="shop-edit-field">
                <span class="muted small">тип</span>
                <select v-model="shopUploadKind" class="shop-input">
                  <option v-for="k in shopKindOptions" :key="k.value" :value="k.value">{{ k.label }}</option>
                </select>
              </label>
              <label class="shop-edit-field">
                <span class="muted small">название</span>
                <input v-model="shopUploadName" class="shop-input" placeholder="название" />
              </label>
              <div class="shop-modal-row">
                <label class="shop-edit-field">
                  <span class="muted small">цена</span>
                  <input
                    v-model.number="shopUploadPrice"
                    type="number"
                    min="0"
                    step="1"
                    class="shop-input"
                    placeholder="0"
                  />
                </label>
                <label class="shop-edit-field">
                  <span class="muted small">тираж</span>
                  <input v-model="shopUploadStock" inputmode="numeric" class="shop-input" placeholder="пусто" />
                </label>
              </div>
              <div v-if="shopCategories.length" class="shop-edit-field">
                <span class="muted small">категории</span>
                <div class="cat-chips" role="group">
                  <button
                    v-for="c in shopCategories"
                    :key="c.id"
                    type="button"
                    class="cat-chip"
                    :class="{ on: shopUploadCategoryIds.includes(c.id) }"
                    :aria-pressed="shopUploadCategoryIds.includes(c.id)"
                    @click="toggleUploadCat(c.id)"
                  >
                    {{ c.name }}
                  </button>
                </div>
              </div>
            </div>
            <div class="shop-edit-actions">
              <button type="button" class="secondary" :disabled="shopUploadBusy" @click="closeShopAdd">отмена</button>
              <button type="button" :disabled="shopUploadBusy" @click="confirmShopUpload">
                {{ shopUploadBusy ? "загрузка…" : "загрузить" }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>
    </template>

    <AdminWorkTab v-else-if="tab === 'work' && isFullAdmin" />
  </section>
</template>

<style scoped>
.admin :deep(.page-head) {
  margin-bottom: 0.8rem;
}
.admin-tabs {
  margin-bottom: 1rem;
}
.admin-users-search {
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
.user-list .user-row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}
.user-ava {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: var(--avatar-radius);
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--surface);
}
.user-ava img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.user-info {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 0.1rem;
}
.user-info strong,
.user-info .small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-side {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}
.user-coins {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.55rem;
  min-height: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: transparent;
  color: var(--text);
  font-size: 0.875rem;
}
.user-coins:hover {
  background: var(--surface);
  transform: none;
}
.user-coins-plus {
  color: var(--muted);
}
.user-coins-cancel {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.3rem;
  min-height: 0;
}
.shop-edit-dialog.mod-modal {
  width: min(100%, 32rem);
  max-height: 86vh;
  overflow-y: auto;
}
.mod-head {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}
.mod-head-info {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 0.1rem;
}
.mod-head-info strong,
.mod-head-info .small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mod-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.3rem;
  min-height: 0;
  border: none;
  background: transparent;
  color: var(--muted);
}
.mod-close:hover {
  color: var(--text);
  background: transparent;
  transform: none;
}
.mod-coins {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}
.mod-role {
  display: flex;
  gap: 0.35rem;
}
.mod-sec summary {
  cursor: pointer;
  color: var(--muted);
  font-size: 0.875rem;
  padding: 0.35rem 0;
  user-select: none;
}
.mod-sec summary:hover {
  color: var(--text);
}
.mod-sec[open] summary {
  color: var(--text);
}
.mod-sec > :not(summary) {
  margin-top: 0.5rem;
}
.mod-delete {
  justify-self: start;
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
.mod-avatar {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: var(--avatar-radius);
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--surface);
}
.mod-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: var(--avatar-radius);
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
  display: grid;
  gap: 0.5rem;
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
  padding: 0.25rem 1.6rem 0.25rem 0.35rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background-color: var(--bg);
  color: var(--text);
}
.shop-upload-btn {
  margin-bottom: 0.5rem;
}
.shop-preset-row {
  margin-top: 0.35rem;
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
.shop-cats-manage {
  margin-top: 0.35rem;
}
.shop-cats-manage summary {
  cursor: pointer;
  font-size: 0.82rem;
  color: var(--muted);
}
.shop-cats-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.35rem;
}
.shop-cats-row,
.shop-cats-add {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}
.shop-cat-id {
  max-width: 100px;
  flex: none;
  min-width: 0;
}
.shop-cat-name {
  flex: 1;
  min-width: 120px;
  max-width: 200px;
}
.shop-modal-form {
  display: grid;
  gap: 0.55rem;
}
.shop-modal-form .shop-input,
.shop-modal-form select {
  width: 100%;
  min-width: 0;
  max-width: none;
  flex: none;
}
.shop-modal-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}
.cat-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.cat-chip {
  font: inherit;
  font-size: 0.82rem;
  padding: 0.32rem 0.65rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--muted);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;
}
.cat-chip:hover {
  border-color: var(--hover-border);
  color: var(--text);
}
.cat-chip.on,
.cat-chip[aria-pressed="true"] {
  border-color: var(--text);
  background: var(--text);
  color: var(--bg);
}
.shop-stock {
  max-width: 88px;
  flex: none;
}
.shop-hex {
  max-width: 108px;
  flex: none;
}
.shop-preset-field {
  max-width: 140px;
  flex: none;
  min-width: 0;
}
.shop-preset-ph {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0.15rem;
  word-break: break-all;
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
  border-radius: var(--avatar-radius);
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
.shop-item-actions {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex-shrink: 0;
}
.shop-edit-root {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.shop-edit-backdrop {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 0;
  border: none;
  background: rgba(0, 0, 0, 0.6);
  cursor: pointer;
}
.shop-edit-dialog {
  position: relative;
  z-index: 1;
  width: min(100%, 20rem);
  display: grid;
  gap: 0.7rem;
  padding: 1rem;
}
.shop-edit-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
  text-transform: lowercase;
}
.shop-edit-field {
  display: grid;
  gap: 0.25rem;
}
.shop-edit-actions {
  display: flex;
  gap: 0.4rem;
  justify-content: flex-end;
  margin-top: 0.15rem;
}
.ok-msg {
  color: var(--text);
  margin-bottom: 0.4rem;
}

@media (max-width: 640px) {
  .mod-grid,
  .shop-modal-row {
    grid-template-columns: 1fr;
  }
  .mod-social-row {
    grid-template-columns: 1fr;
  }
  .mod-social-row > button {
    justify-self: end;
  }
}
</style>
