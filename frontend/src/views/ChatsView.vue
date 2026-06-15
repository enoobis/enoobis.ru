<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import {
  addGroupMember,
  clearThreadMessages,
  createGroupChat,
  deleteChatThread,
  deleteMessage,
  editMessage,
  listChats,
  listMessages,
  listOutgoingReadFlags,
  markChatRead,
  openChatWith,
  removeGroupMember,
  sendMessage,
  uploadChatImage,
  uploadGroupAvatar,
  type ChatGroupInfo,
  type ChatGroupMember,
  type ChatMessage,
  type ChatReplyRef,
  type ChatThread,
} from "../api/chat";
import { search, type SearchUser } from "../api/search";
import AppIcon from "../components/AppIcon.vue";
import { useAuthStore } from "../stores/auth";
import { useChatStore } from "../stores/chat";
import { toastError } from "../utils/toast";

const auth = useAuthStore();
const chatStore = useChatStore();
const route = useRoute();
const router = useRouter();

const chats = ref<ChatThread[]>([]);
const activeId = ref<string>("");
const otherNickname = ref("");
const otherAvatar = ref("");
const groupInfo = ref<ChatGroupInfo | null>(null);
const composeOpen = ref(false);
const composeMode = ref<"user" | "group">("user");
const composeQuery = ref("");
const composeSuggestions = ref<SearchUser[]>([]);
const composePickIdx = ref(0);
const composeSearching = ref(false);
const addMemberOpen = ref(false);
const membersOpen = ref(false);
const groupTitle = ref("");
const groupAvatarFile = ref<File | null>(null);
const groupAvatarPreview = ref("");
const selectedMembers = ref<SearchUser[]>([]);
const memberQuery = ref("");
const memberSuggestions = ref<SearchUser[]>([]);
const memberPickIdx = ref(0);
const memberSearching = ref(false);
const creatingGroup = ref(false);
const groupAvatarInput = ref<HTMLInputElement | null>(null);
const memberInput = ref<HTMLInputElement | null>(null);
const composeInput = ref<HTMLInputElement | null>(null);
let memberSearchTimer: ReturnType<typeof setTimeout> | null = null;

const pickedNicknames = computed(() => new Set(selectedMembers.value.map((u) => u.nickname)));

function resetGroupForm() {
  groupTitle.value = "";
  memberQuery.value = "";
  memberSuggestions.value = [];
  memberPickIdx.value = 0;
  selectedMembers.value = [];
  if (groupAvatarPreview.value) {
    URL.revokeObjectURL(groupAvatarPreview.value);
    groupAvatarPreview.value = "";
  }
  groupAvatarFile.value = null;
}

function focusMemberInput() {
  memberInput.value?.focus();
}

function openCompose() {
  composeMode.value = "user";
  composeQuery.value = "";
  composeSuggestions.value = [];
  composePickIdx.value = 0;
  resetGroupForm();
  composeOpen.value = true;
  nextTick(() => composeInput.value?.focus());
}

function closeCompose() {
  composeOpen.value = false;
  composeMode.value = "user";
  composeQuery.value = "";
  composeSuggestions.value = [];
  resetGroupForm();
}

function switchComposeGroup() {
  composeMode.value = "group";
  nextTick(() => memberInput.value?.focus());
}

function switchComposeUser() {
  composeMode.value = "user";
  nextTick(() => composeInput.value?.focus());
}

async function fetchComposeSuggestions(q: string) {
  const needle = q.trim();
  if (!needle) {
    composeSuggestions.value = [];
    composePickIdx.value = 0;
    return;
  }
  composeSearching.value = true;
  try {
    const data = await search(needle, 8);
    composeSuggestions.value = data.users.filter((u) => u.nickname !== auth.nickname);
    composePickIdx.value = 0;
  } catch {
    composeSuggestions.value = [];
  } finally {
    composeSearching.value = false;
  }
}

watch(composeQuery, (q) => {
  if (!composeOpen.value || composeMode.value !== "user") return;
  if (memberSearchTimer) clearTimeout(memberSearchTimer);
  memberSearchTimer = setTimeout(() => void fetchComposeSuggestions(q), 180);
});

async function startChatWith(u: SearchUser) {
  if (!auth.token) return;
  try {
    const t = await openChatWith(u.nickname, auth.token);
    closeCompose();
    await loadChats();
    router.replace({ name: "chats", query: { id: t.id } });
  } catch (e) {
    toastError(e);
  }
}

function onComposeKey(e: KeyboardEvent) {
  const list = composeSuggestions.value;
  if (e.key === "ArrowDown" && list.length) {
    e.preventDefault();
    composePickIdx.value = (composePickIdx.value + 1) % list.length;
    return;
  }
  if (e.key === "ArrowUp" && list.length) {
    e.preventDefault();
    composePickIdx.value = (composePickIdx.value - 1 + list.length) % list.length;
    return;
  }
  if ((e.key === "Enter" || e.key === "Tab") && list.length) {
    e.preventDefault();
    void startChatWith(list[composePickIdx.value]!);
  }
}

function pickGroupAvatar() {
  groupAvatarInput.value?.click();
}

function onGroupAvatarChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0] ?? null;
  (e.target as HTMLInputElement).value = "";
  if (!f || !f.type.startsWith("image/")) return;
  if (f.size > 10 * 1024 * 1024) {
    toastError(new Error("до 10 мб"));
    return;
  }
  if (groupAvatarPreview.value) URL.revokeObjectURL(groupAvatarPreview.value);
  groupAvatarFile.value = f;
  groupAvatarPreview.value = URL.createObjectURL(f);
}

async function fetchMemberSuggestions(q: string) {
  const needle = q.trim();
  if (!needle) {
    memberSuggestions.value = [];
    memberPickIdx.value = 0;
    return;
  }
  memberSearching.value = true;
  try {
    const data = await search(needle, 8);
    memberSuggestions.value = data.users.filter(
      (u) => u.nickname !== auth.nickname && !pickedNicknames.value.has(u.nickname),
    );
    memberPickIdx.value = 0;
  } catch {
    memberSuggestions.value = [];
  } finally {
    memberSearching.value = false;
  }
}

watch(memberQuery, (q) => {
  if (!composeOpen.value || composeMode.value !== "group") return;
  if (memberSearchTimer) clearTimeout(memberSearchTimer);
  memberSearchTimer = setTimeout(() => void fetchMemberSuggestions(q), 180);
});

function addPickedMember(u: SearchUser) {
  if (pickedNicknames.value.has(u.nickname)) return;
  selectedMembers.value = [...selectedMembers.value, u];
  memberQuery.value = "";
  memberSuggestions.value = [];
  memberPickIdx.value = 0;
  memberInput.value?.focus();
}

function removePickedMember(nick: string) {
  selectedMembers.value = selectedMembers.value.filter((u) => u.nickname !== nick);
  if (memberQuery.value.trim()) void fetchMemberSuggestions(memberQuery.value);
}

function pickHighlightedMember() {
  const u = memberSuggestions.value[memberPickIdx.value];
  if (u) addPickedMember(u);
}

function onMemberKey(e: KeyboardEvent) {
  const list = memberSuggestions.value;
  if (e.key === "ArrowDown" && list.length) {
    e.preventDefault();
    memberPickIdx.value = (memberPickIdx.value + 1) % list.length;
    return;
  }
  if (e.key === "ArrowUp" && list.length) {
    e.preventDefault();
    memberPickIdx.value = (memberPickIdx.value - 1 + list.length) % list.length;
    return;
  }
  if ((e.key === "Enter" || e.key === "Tab") && list.length) {
    e.preventDefault();
    pickHighlightedMember();
    return;
  }
  if (e.key === "Backspace" && !memberQuery.value && selectedMembers.value.length) {
    selectedMembers.value = selectedMembers.value.slice(0, -1);
  }
  if (e.key === "Escape") {
    memberSuggestions.value = [];
  }
}

async function createGroup() {
  if (!auth.token || creatingGroup.value) return;
  const title = groupTitle.value.trim();
  if (!title) return;
  creatingGroup.value = true;
  try {
    let avatarUrl = "";
    if (groupAvatarFile.value) {
      const r = await uploadGroupAvatar(auth.token, groupAvatarFile.value);
      avatarUrl = r.url;
    }
    const t = await createGroupChat(auth.token, {
      title,
      members: selectedMembers.value.map((u) => u.nickname),
      avatar_url: avatarUrl || undefined,
    });
    if (t.missing?.length) toastError(new Error(`не найдены: ${t.missing.join(", ")}`));
    closeCompose();
    await loadChats();
    router.replace({ name: "chats", query: { id: t.id } });
  } catch (e) {
    toastError(e);
  } finally {
    creatingGroup.value = false;
  }
}

function openMembers() {
  if (!groupInfo.value) return;
  membersOpen.value = true;
}

function closeMembers() {
  membersOpen.value = false;
}

function canRemoveMember(m: ChatGroupMember): boolean {
  if (!groupInfo.value || !auth.user?.id) return false;
  if (m.id === auth.user.id) return true;
  return groupInfo.value.owner_id === auth.user.id;
}

async function kickMember(m: ChatGroupMember) {
  if (!auth.token || !activeId.value || !groupInfo.value || !auth.user?.id) return;
  const self = m.id === auth.user.id;
  const q = self ? "выйти из группы?" : `убрать ${m.nickname}?`;
  if (!window.confirm(q)) return;
  try {
    const r = await removeGroupMember(activeId.value, auth.token, m.id);
    if (r.removed || self) {
      closeMembers();
      activeId.value = "";
      messages.value = [];
      groupInfo.value = null;
      router.replace({ name: "chats" });
      await loadChats();
      return;
    }
    groupInfo.value = { ...groupInfo.value, members: r.members };
    await loadChats();
  } catch (e) {
    toastError(e);
  }
}

function openAddMember() {
  closeMembers();
  memberQuery.value = "";
  memberSuggestions.value = [];
  memberPickIdx.value = 0;
  addMemberOpen.value = true;
  nextTick(() => memberInput.value?.focus());
}

function closeAddMember() {
  addMemberOpen.value = false;
  memberQuery.value = "";
  memberSuggestions.value = [];
  memberPickIdx.value = 0;
}

async function confirmAddMember(u: SearchUser) {
  if (!auth.token || !activeId.value) return;
  try {
    await addGroupMember(activeId.value, auth.token, u.nickname);
    closeAddMember();
    await loadMessages(false);
  } catch (e) {
    toastError(e);
  }
}

function onAddMemberKey(e: KeyboardEvent) {
  const list = memberSuggestions.value;
  if (e.key === "ArrowDown" && list.length) {
    e.preventDefault();
    memberPickIdx.value = (memberPickIdx.value + 1) % list.length;
    return;
  }
  if (e.key === "ArrowUp" && list.length) {
    e.preventDefault();
    memberPickIdx.value = (memberPickIdx.value - 1 + list.length) % list.length;
    return;
  }
  if ((e.key === "Enter" || e.key === "Tab") && list.length) {
    e.preventDefault();
    void confirmAddMember(list[memberPickIdx.value]!);
    return;
  }
  if (e.key === "Escape") closeAddMember();
}

async function fetchAddMemberSuggestions(q: string) {
  const needle = q.trim();
  if (!needle) {
    memberSuggestions.value = [];
    memberPickIdx.value = 0;
    return;
  }
  memberSearching.value = true;
  try {
    const data = await search(needle, 8);
    const inGroup = new Set(groupInfo.value?.members.map((m) => m.nickname) ?? []);
    memberSuggestions.value = data.users.filter(
      (u) => u.nickname !== auth.nickname && !inGroup.has(u.nickname),
    );
    memberPickIdx.value = 0;
  } catch {
    memberSuggestions.value = [];
  } finally {
    memberSearching.value = false;
  }
}

watch(
  () => (addMemberOpen.value ? memberQuery.value : ""),
  (q) => {
    if (!addMemberOpen.value) return;
    if (memberSearchTimer) clearTimeout(memberSearchTimer);
    memberSearchTimer = setTimeout(() => void fetchAddMemberSuggestions(q), 180);
  },
);

const isGroup = computed(() => groupInfo.value !== null);

function memberWord(n: number): string {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return "участник";
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return "участника";
  return "участников";
}

const groupMembersLabel = computed(() => {
  const n = groupInfo.value?.members.length ?? 0;
  return `${n} ${memberWord(n)}`;
});

const messages = ref<ChatMessage[]>([]);
const draft = ref("");
const sending = ref(false);
const loadingChats = ref(false);
const loadingMessages = ref(false);
const err = ref("");
const messagesEnd = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const composerTextarea = ref<HTMLTextAreaElement | null>(null);
const composerTall = ref(false);
const pendingFile = ref<File | null>(null);
const pendingPreview = ref("");
const lightboxUrl = ref("");
const editingId = ref("");
const editingDraft = ref("");
const replyTarget = ref<ChatMessage | null>(null);
let chatsTimer: ReturnType<typeof setInterval> | null = null;
let messagesTimer: ReturnType<typeof setInterval> | null = null;

const MONTHS_GEN = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

function calendarDayKey(d: Date): string {
  const y = d.getFullYear();
  const mo = d.getMonth() + 1;
  const da = d.getDate();
  return `${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
}

function utcDayStart(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

function relativeDayLabel(msg: Date, now: Date): string {
  const diffDays = Math.round((utcDayStart(now) - utcDayStart(msg)) / 86400000);
  if (diffDays < 0) return "";
  if (diffDays === 0) return "сегодня";
  if (diffDays === 1) return "вчера";
  if (diffDays === 2) return "позавчера";
  return "";
}

function formatMessageCalendarDate(d: Date): string {
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;
}

type MessageRow =
  | { kind: "day"; id: string; line: string }
  | { kind: "msg"; m: ChatMessage; id: string };

const messageRows = computed((): MessageRow[] => {
  const rows: MessageRow[] = [];
  let prevKey = "";
  const now = new Date();
  for (const m of messages.value) {
    const d = new Date(m.created_at);
    if (Number.isNaN(d.getTime())) {
      rows.push({ kind: "msg", m, id: m.id });
      continue;
    }
    const key = calendarDayKey(d);
    if (key !== prevKey) {
      prevKey = key;
      const rel = relativeDayLabel(d, now);
      const dateStr = formatMessageCalendarDate(d);
      const line = rel ? `${rel} · ${dateStr}` : dateStr;
      rows.push({ kind: "day", id: `day-${key}`, line });
    }
    rows.push({ kind: "msg", m, id: m.id });
  }
  return rows;
});

function messageSnippetForReply(m: ChatMessage): string {
  if (m.image_url && !m.body.trim()) return "фото";
  const t = m.body.trim();
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
}

function replyPreviewLines(m: ChatMessage): string {
  const r = m.reply_to;
  if (!r) return "";
  if (r.image_url && !r.body.trim()) return "фото";
  const t = r.body.trim();
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
}

function replyRefAuthor(r: ChatReplyRef): string {
  if (r.from_me) return "вы";
  if (isGroup.value) return r.sender_nickname || "участник";
  return otherNickname.value || "собеседник";
}

function replyAuthorLabel(m: ChatMessage): string {
  if (m.from_me) return "вы";
  if (isGroup.value) return m.sender_nickname || "участник";
  return otherNickname.value || "собеседник";
}

async function removeChatFromList(c: ChatThread) {
  if (!auth.token) return;
  const q = c.kind === "group" ? "выйти из группы?" : "убрать чат из списка?";
  if (!window.confirm(q)) return;
  try {
    await deleteChatThread(c.id, auth.token);
    chats.value = chats.value.filter((x) => x.id !== c.id);
    replyTarget.value = null;
    if (activeId.value === c.id) {
      activeId.value = "";
      messages.value = [];
      router.replace({ name: "chats" });
    }
    void chatStore.refresh();
  } catch (e) {
    toastError(e);
  }
}

function setReplyTo(m: ChatMessage) {
  replyTarget.value = m;
}

function clearReplyTarget() {
  replyTarget.value = null;
}

function removeCurrentChat() {
  const c = chats.value.find((x) => x.id === activeId.value);
  if (c) void removeChatFromList(c);
}

async function clearThreadHistory() {
  if (!auth.token || !activeId.value) return;
  if (!window.confirm("удалить все сообщения в этом чате? без восстановления.")) return;
  try {
    await clearThreadMessages(activeId.value, auth.token);
    messages.value = [];
    replyTarget.value = null;
    cancelEdit();
    await loadChats();
    void chatStore.refresh();
  } catch (e) {
    toastError(e);
  }
}

async function loadChats() {
  if (!auth.token) return;
  loadingChats.value = true;
  try {
    const data = await listChats(auth.token);
    chats.value = data.items;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    loadingChats.value = false;
  }
}

async function loadMessages(scrollEnd = true) {
  if (!auth.token || !activeId.value) return;
  const chatId = activeId.value;
  loadingMessages.value = true;
  try {
    const data = await listMessages(chatId, auth.token);
    if (chatId !== activeId.value) return;
    messages.value = data.items;
    groupInfo.value = data.group ?? null;
    otherNickname.value = data.other?.nickname ?? "";
    otherAvatar.value = data.other?.avatar_url ?? "";
    if (scrollEnd) {
      await nextTick();
      messagesEnd.value?.scrollIntoView({ block: "end" });
    }
    await markChatRead(chatId, auth.token);
    const c = chats.value.find((x) => x.id === chatId);
    if (c) c.unread = 0;
    void chatStore.refresh();
  } catch (e) {
    if (chatId !== activeId.value) return;
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    if (chatId === activeId.value) loadingMessages.value = false;
  }
}

async function syncOutgoingReads() {
  if (!auth.token || !activeId.value) return;
  try {
    const { items } = await listOutgoingReadFlags(activeId.value, auth.token);
    const byId = new Map(items.map((x) => [x.id, x.read] as const));
    messages.value = messages.value.map((m) =>
      m.from_me && byId.has(m.id) ? { ...m, read: byId.get(m.id)! } : m,
    );
  } catch {
    /* ignore */
  }
}

async function pollMessages() {
  if (!auth.token || !activeId.value) return;
  const chatId = activeId.value;
  const last = messages.value.at(-1)?.created_at;
  try {
    const data = await listMessages(chatId, auth.token, last);
    if (chatId !== activeId.value) return;
    if (data.group) groupInfo.value = data.group;
    if (data.items.length) {
      messages.value = [...messages.value, ...data.items];
      await nextTick();
      messagesEnd.value?.scrollIntoView({ block: "end", behavior: "smooth" });
      await markChatRead(chatId, auth.token);
      void chatStore.refresh();
      void loadChats();
    }
    await syncOutgoingReads();
  } catch {
    /* ignore poll errors */
  }
}

function pickFile() {
  fileInput.value?.click();
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0] ?? null;
  setPendingFile(f);
  input.value = "";
}

function setPendingFile(f: File | null) {
  if (pendingPreview.value) {
    URL.revokeObjectURL(pendingPreview.value);
    pendingPreview.value = "";
  }
  pendingFile.value = null;
  if (!f) return;
  if (!f.type.startsWith("image/")) {
    toastError(new Error("только изображения"));
    return;
  }
  if (f.size > 10 * 1024 * 1024) {
    toastError(new Error("до 10 мб"));
    return;
  }
  pendingFile.value = f;
  pendingPreview.value = URL.createObjectURL(f);
}

function clearPending() {
  setPendingFile(null);
}

function onPaste(e: ClipboardEvent) {
  const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
    i.type.startsWith("image/"),
  );
  if (!item) return;
  const f = item.getAsFile();
  if (f) {
    e.preventDefault();
    setPendingFile(f);
  }
}

async function send() {
  if (!auth.token || !activeId.value || sending.value) return;
  const text = draft.value.trim();
  const file = pendingFile.value;
  if (!text && !file) return;
  sending.value = true;
  try {
    let imageUrl = "";
    if (file) {
      const r = await uploadChatImage(activeId.value, auth.token, file);
      imageUrl = r.url;
    }
    const m = await sendMessage(activeId.value, auth.token, {
      body: text || undefined,
      image_url: imageUrl || undefined,
      ...(replyTarget.value ? { reply_to: replyTarget.value.id } : {}),
    });
    messages.value = [...messages.value, m];
    draft.value = "";
    replyTarget.value = null;
    clearPending();
    await nextTick();
    messagesEnd.value?.scrollIntoView({ block: "end", behavior: "smooth" });
    void loadChats();
  } catch (e) {
    toastError(e);
  } finally {
    sending.value = false;
  }
}

function selectChat(id: string) {
  router.replace({ name: "chats", query: { id } });
}

function onChatRowKey(e: KeyboardEvent, id: string) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    selectChat(id);
  }
}

function startEdit(m: ChatMessage) {
  editingId.value = m.id;
  editingDraft.value = m.body;
}

function cancelEdit() {
  editingId.value = "";
  editingDraft.value = "";
}

async function saveEdit(m: ChatMessage) {
  if (!auth.token) return;
  const text = editingDraft.value.trim();
  if (!text && !m.image_url) {
    return;
  }
  try {
    const updated = await editMessage(m.id, auth.token, text);
    const idx = messages.value.findIndex((x) => x.id === m.id);
    if (idx >= 0) messages.value[idx] = updated;
    cancelEdit();
    void loadChats();
  } catch (e) {
    toastError(e);
  }
}

async function removeMessage(m: ChatMessage) {
  if (!auth.token) return;
  if (!window.confirm("удалить сообщение?")) return;
  try {
    await deleteMessage(m.id, auth.token);
    messages.value = messages.value.filter((x) => x.id !== m.id);
    if (editingId.value === m.id) cancelEdit();
    void loadChats();
  } catch (e) {
    toastError(e);
  }
}

function onEditKey(e: KeyboardEvent, m: ChatMessage) {
  if (e.key === "Escape") {
    e.preventDefault();
    cancelEdit();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    void saveEdit(m);
  }
}

const COMPOSER_MAX_H = 220;

function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    void send();
  }
}

function adjustComposerHeight() {
  const el = composerTextarea.value;
  if (!el) return;
  const cap = Math.min(COMPOSER_MAX_H, Math.round(window.innerHeight * 0.45));
  el.style.maxHeight = `${cap}px`;
  el.style.height = "0";
  void el.offsetHeight;
  const sh = el.scrollHeight;
  const h = Math.min(Math.max(sh, 40), cap);
  el.style.height = `${h}px`;
  el.style.overflowY = sh > cap ? "auto" : "hidden";
  composerTall.value = sh > 52;
}

function scheduleComposerResize() {
  requestAnimationFrame(() => adjustComposerHeight());
}

watch(
  draft,
  () => {
    scheduleComposerResize();
  },
  { flush: "post" },
);
watch(
  activeId,
  () => {
    scheduleComposerResize();
  },
  { flush: "post" },
);

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return "";
  const diff = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (diff < 60) return "сейчас";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`;
  return iso.slice(5, 10);
}

function timeFor(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toTimeString().slice(0, 5);
}

watch(
  () => route.query.id,
  async (v) => {
    const id = typeof v === "string" ? v : "";
    if (id !== activeId.value) {
      activeId.value = id;
      messages.value = [];
      groupInfo.value = null;
      replyTarget.value = null;
      if (id) await loadMessages();
    }
  },
);

watch(
  () => route.query.with,
  async (v) => {
    if (!auth.token) return;
    const nick = typeof v === "string" ? v : "";
    if (!nick) return;
    try {
      const t = await openChatWith(nick, auth.token);
      await loadChats();
      router.replace({ name: "chats", query: { id: t.id } });
    } catch (e) {
      toastError(e);
    }
  },
  { immediate: true },
);

onMounted(async () => {
  await loadChats();
  const id = typeof route.query.id === "string" ? route.query.id : "";
  if (id) {
    activeId.value = id;
    await loadMessages();
  }
  chatsTimer = setInterval(() => void loadChats(), 30000);
  messagesTimer = setInterval(() => void pollMessages(), 5000);
  scheduleComposerResize();
});

onUnmounted(() => {
  if (chatsTimer) clearInterval(chatsTimer);
  if (messagesTimer) clearInterval(messagesTimer);
  if (memberSearchTimer) clearTimeout(memberSearchTimer);
  if (pendingPreview.value) {
    URL.revokeObjectURL(pendingPreview.value);
    pendingPreview.value = "";
  }
  if (groupAvatarPreview.value) {
    URL.revokeObjectURL(groupAvatarPreview.value);
    groupAvatarPreview.value = "";
  }
});
</script>

<template>
  <section class="chats">
    <aside class="list" :class="{ hidden: activeId }">
      <div class="list-head">
        <h2>чаты</h2>
        <button
          type="button"
          class="list-head-act"
          aria-label="новый чат"
          title="новый чат"
          @click="openCompose"
        >
          <AppIcon name="plus" :size="18" />
        </button>
      </div>
      <p v-if="loadingChats && !chats.length" class="page-empty muted">загрузка</p>
      <p v-else-if="!chats.length" class="page-empty muted">пусто</p>
      <div
        v-for="c in chats"
        :key="c.id"
        class="chat-row-outer"
        :class="{ on: c.id === activeId, unread: c.unread > 0 }"
        role="button"
        tabindex="0"
        @click="selectChat(c.id)"
        @keydown="(e) => onChatRowKey(e, c.id)"
      >
        <div class="chat-row">
          <span class="avatar">
            <img v-if="c.kind === 'group' && c.other_avatar" :src="c.other_avatar" alt="" />
            <AppIcon v-else-if="c.kind === 'group'" name="users" :size="16" />
            <img v-else-if="c.other_avatar" :src="c.other_avatar" alt="" />
            <span v-else>{{ c.other_nickname.slice(0, 2) }}</span>
          </span>
          <span class="row-text">
            <span class="row-line">
              <span class="nick">{{ c.other_nickname }}</span>
              <span class="time muted">{{ timeAgo(c.last_at) }}</span>
            </span>
            <span class="last muted small">
              <span v-if="c.last_from_me" class="muted">вы: </span>{{ c.last_body || "—" }}
            </span>
          </span>
        </div>
        <span class="chat-row-side">
          <button
            type="button"
            class="chat-row-del"
            aria-label="убрать чат"
            title="убрать чат"
            @click.stop="removeChatFromList(c)"
          >
            <AppIcon name="delete" :size="14" />
          </button>
          <span v-if="c.unread" class="badge">{{ c.unread > 9 ? "9+" : c.unread }}</span>
        </span>
      </div>
    </aside>

    <main class="thread" :class="{ hidden: !activeId }">
      <template v-if="activeId">
        <header class="thread-head">
          <button class="back" type="button" @click="router.replace({ name: 'chats' })">←</button>
          <button v-if="groupInfo" type="button" class="who who--group" @click="openMembers">
            <span class="avatar small">
              <img v-if="groupInfo.avatar_url" :src="groupInfo.avatar_url" alt="" />
              <AppIcon v-else name="users" :size="13" />
            </span>
            <span class="who-text">
              <span>{{ groupInfo.title }}</span>
              <span class="presence-label">{{ groupMembersLabel }}</span>
            </span>
          </button>
          <RouterLink v-else-if="otherNickname" :to="`/u/${otherNickname}`" class="who">
            <span class="avatar small">
              <img v-if="otherAvatar" :src="otherAvatar" alt="" />
              <span v-else>{{ otherNickname.slice(0, 2) }}</span>
            </span>
            <span class="who-text">
              <span>{{ otherNickname }}</span>
            </span>
          </RouterLink>
          <span v-if="otherNickname || groupInfo" class="thread-head-actions">
            <button
              v-if="groupInfo"
              type="button"
              class="thread-act"
              aria-label="добавить участника"
              title="добавить участника"
              @click="openAddMember"
            >
              <AppIcon name="register" :size="16" />
            </button>
            <button
              v-if="!groupInfo || groupInfo.owner_id === auth.user?.id"
              type="button"
              class="thread-act"
              aria-label="очистить переписку"
              title="очистить переписку"
              @click="clearThreadHistory"
            >
              <AppIcon name="clear" :size="16" />
            </button>
            <button
              type="button"
              class="thread-act"
              :aria-label="groupInfo ? 'выйти из группы' : 'убрать чат из списка'"
              :title="groupInfo ? 'выйти из группы' : 'убрать чат'"
              @click="removeCurrentChat"
            >
              <AppIcon :name="groupInfo ? 'logout' : 'delete'" :size="16" />
            </button>
          </span>
        </header>

        <div class="messages">
          <p v-if="loadingMessages && !messages.length" class="page-empty muted">загрузка</p>
          <p v-else-if="!messages.length" class="page-empty muted">напишите первое сообщение</p>
          <template v-for="row in messageRows" :key="row.id">
            <div v-if="row.kind === 'day'" class="day-mark muted small">
              {{ row.line }}
            </div>
            <div v-else class="msg" :class="{ me: row.m.from_me }">
              <span class="bubble">
                <RouterLink
                  v-if="isGroup && !row.m.from_me && row.m.sender_nickname"
                  :to="`/u/${row.m.sender_nickname}`"
                  class="msg-sender"
                >
                  {{ row.m.sender_nickname }}
                </RouterLink>
                <div v-if="row.m.reply_to" class="msg-reply muted small">
                  <span class="msg-reply-author">{{ replyRefAuthor(row.m.reply_to) }}</span>
                  <span class="msg-reply-snippet">{{ replyPreviewLines(row.m) }}</span>
                </div>
                <img
                  v-if="row.m.image_url"
                  :src="row.m.image_url"
                  class="msg-img"
                  alt=""
                  @click="lightboxUrl = row.m.image_url ?? ''"
                />
                <template v-if="editingId === row.m.id">
                  <textarea
                    v-model="editingDraft"
                    class="edit-area"
                    rows="2"
                    :maxlength="4000"
                    @keydown="(e) => onEditKey(e, row.m)"
                  />
                  <span class="edit-actions">
                    <button type="button" class="ghost" @click="cancelEdit">отмена</button>
                    <button type="button" @click="saveEdit(row.m)">сохранить</button>
                  </span>
                </template>
                <template v-else>
                  <span v-if="row.m.body" class="text">{{ row.m.body }}</span>
                  <span class="meta muted small">
                    <span v-if="row.m.edited_at" class="muted">изменено</span>
                    <span>{{ timeFor(row.m.created_at) }}</span>
                    <span
                      v-if="row.m.from_me && row.m.read"
                      class="msg-seen"
                      title="прочитано"
                      aria-label="прочитано"
                    >
                      <AppIcon name="seen" :size="12" />
                    </span>
                  </span>
                </template>
              </span>
              <span
                v-if="!row.m.from_me && editingId !== row.m.id"
                class="msg-actions msg-actions--peer"
              >
                <button
                  type="button"
                  class="msg-act"
                  aria-label="ответить"
                  title="ответить"
                  @click="setReplyTo(row.m)"
                >
                  <AppIcon name="reply" :size="14" />
                </button>
                <button
                  v-if="!isGroup || groupInfo?.owner_id === auth.user?.id"
                  type="button"
                  class="msg-act"
                  aria-label="удалить"
                  title="удалить"
                  @click="removeMessage(row.m)"
                >
                  <AppIcon name="delete" :size="14" />
                </button>
              </span>
              <span v-if="row.m.from_me && editingId !== row.m.id" class="msg-actions">
                <button
                  type="button"
                  class="msg-act"
                  aria-label="ответить"
                  title="ответить"
                  @click="setReplyTo(row.m)"
                >
                  <AppIcon name="reply" :size="14" />
                </button>
                <button
                  v-if="row.m.body"
                  type="button"
                  class="msg-act"
                  aria-label="изменить"
                  title="изменить"
                  @click="startEdit(row.m)"
                >
                  <AppIcon name="edit" :size="14" />
                </button>
                <button
                  type="button"
                  class="msg-act"
                  aria-label="удалить"
                  title="удалить"
                  @click="removeMessage(row.m)"
                >
                  <AppIcon name="delete" :size="14" />
                </button>
              </span>
            </div>
          </template>
          <div ref="messagesEnd" />
        </div>

        <div class="composer-wrap">
          <div v-if="replyTarget" class="reply-bar">
            <span class="reply-bar-lines muted small">
              <span class="reply-bar-who">{{ replyAuthorLabel(replyTarget) }}</span>
              <span class="reply-bar-snippet">{{ messageSnippetForReply(replyTarget) }}</span>
            </span>
            <button type="button" class="reply-bar-x" aria-label="отменить" @click="clearReplyTarget">
              ×
            </button>
          </div>
          <div v-if="pendingPreview" class="pending">
            <img :src="pendingPreview" alt="" />
            <button type="button" class="pending-x" @click="clearPending">×</button>
          </div>
          <div class="composer">
            <button
              type="button"
              class="attach"
              :disabled="sending"
              aria-label="прикрепить"
              title="прикрепить"
              @click="pickFile"
            >
              <AppIcon name="image" :size="18" />
            </button>
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              hidden
              @change="onFileChange"
            />
            <textarea
              ref="composerTextarea"
              v-model="draft"
              class="composer-ta"
              :class="{ 'composer-ta--tall': composerTall }"
              rows="1"
              placeholder="сообщение"
              :maxlength="4000"
              @keydown="onKey"
              @input="scheduleComposerResize"
              @paste="onPaste"
              @compositionend="scheduleComposerResize"
            />
            <button
              type="button"
              :disabled="sending || (!draft.trim() && !pendingFile)"
              @click="send"
            >
              {{ sending ? "…" : "отправить" }}
            </button>
          </div>
        </div>
      </template>
      <p v-else class="page-empty muted center">выберите чат слева</p>
    </main>

    <Teleport to="body">
      <div v-if="composeOpen" class="group-modal" @click.self="closeCompose">
        <div class="group-modal-card">
          <div class="group-modal-head">
            <button
              v-if="composeMode === 'group'"
              type="button"
              class="group-modal-back"
              aria-label="назад"
              @click="switchComposeUser"
            >
              ←
            </button>
            <span v-else class="group-modal-spacer" aria-hidden="true" />
            <span>{{ composeMode === "group" ? "новая группа" : "новый чат" }}</span>
            <button type="button" class="group-modal-x" aria-label="закрыть" @click="closeCompose">×</button>
          </div>

          <template v-if="composeMode === 'user'">
            <input
              ref="composeInput"
              v-model="composeQuery"
              type="text"
              class="compose-query"
              placeholder="ник"
              autocomplete="off"
              @keydown="onComposeKey"
            />
            <ul v-if="composeSuggestions.length" class="member-suggest">
              <li
                v-for="(u, i) in composeSuggestions"
                :key="u.nickname"
                :class="{ on: i === composePickIdx }"
                @mousedown.prevent="startChatWith(u)"
              >
                <span class="member-suggest-av">
                  <img v-if="u.avatar_url" :src="u.avatar_url" alt="" />
                  <span v-else>{{ u.nickname.slice(0, 2) }}</span>
                </span>
                <span class="member-suggest-text">
                  <span>{{ u.nickname }}</span>
                  <span v-if="u.full_name" class="muted small">{{ u.full_name }}</span>
                </span>
              </li>
            </ul>
            <p v-else-if="composeSearching" class="muted small member-hint">поиск…</p>
            <button type="button" class="compose-switch" @click="switchComposeGroup">
              <AppIcon name="users" :size="16" />
              <span>создать группу</span>
            </button>
          </template>

          <form v-else class="group-form" @submit.prevent="createGroup">
            <div class="group-form-top">
              <button type="button" class="group-avatar-pick" aria-label="аватар группы" @click="pickGroupAvatar">
                <img v-if="groupAvatarPreview" :src="groupAvatarPreview" alt="" />
                <AppIcon v-else name="users" :size="24" />
              </button>
              <input
                v-model="groupTitle"
                type="text"
                class="group-title-in"
                placeholder="название"
                :maxlength="80"
              />
            </div>
            <input
              ref="groupAvatarInput"
              type="file"
              accept="image/*"
              hidden
              @change="onGroupAvatarChange"
            />
            <div class="member-picker">
              <div class="member-combo" @click="focusMemberInput">
                <span v-for="u in selectedMembers" :key="u.nickname" class="member-chip">
                  <span class="member-chip-av">
                    <img v-if="u.avatar_url" :src="u.avatar_url" alt="" />
                    <AppIcon v-else name="profile" :size="12" />
                  </span>
                  <span class="member-chip-nick">{{ u.nickname }}</span>
                  <button
                    type="button"
                    class="member-chip-x"
                    aria-label="убрать"
                    @click.stop="removePickedMember(u.nickname)"
                  >
                    ×
                  </button>
                </span>
                <input
                  ref="memberInput"
                  v-model="memberQuery"
                  type="text"
                  class="member-query"
                  :placeholder="selectedMembers.length ? '' : 'ник участника'"
                  autocomplete="off"
                  @keydown="onMemberKey"
                />
              </div>
              <ul v-if="memberSuggestions.length" class="member-suggest">
                <li
                  v-for="(u, i) in memberSuggestions"
                  :key="u.nickname"
                  :class="{ on: i === memberPickIdx }"
                  @mousedown.prevent="addPickedMember(u)"
                >
                  <span class="member-suggest-av">
                    <img v-if="u.avatar_url" :src="u.avatar_url" alt="" />
                    <span v-else>{{ u.nickname.slice(0, 2) }}</span>
                  </span>
                  <span class="member-suggest-text">
                    <span>{{ u.nickname }}</span>
                    <span v-if="u.full_name" class="muted small">{{ u.full_name }}</span>
                  </span>
                </li>
              </ul>
              <p v-else-if="memberSearching" class="muted small member-hint">поиск…</p>
            </div>
            <button type="submit" class="group-create-btn" :disabled="creatingGroup || !groupTitle.trim()">
              {{ creatingGroup ? "…" : "создать" }}
            </button>
          </form>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="membersOpen && groupInfo" class="group-modal" @click.self="closeMembers">
        <div class="group-modal-card">
          <div class="group-modal-head">
            <span class="group-modal-spacer" aria-hidden="true" />
            <span>участники</span>
            <button type="button" class="group-modal-x" aria-label="закрыть" @click="closeMembers">×</button>
          </div>
          <button type="button" class="compose-switch" @click="openAddMember">
            <AppIcon name="register" :size="16" />
            <span>добавить</span>
          </button>
          <ul class="members-list">
            <li v-for="m in groupInfo.members" :key="m.id" class="members-row">
              <RouterLink :to="`/u/${m.nickname}`" class="members-who" @click="closeMembers">
                <span class="member-suggest-av">
                  <img v-if="m.avatar_url" :src="m.avatar_url" alt="" />
                  <span v-else>{{ m.nickname.slice(0, 2) }}</span>
                </span>
                <span class="members-who-text">
                  <span>{{ m.nickname }}</span>
                  <span v-if="m.id === groupInfo.owner_id" class="muted small">создатель</span>
                </span>
              </RouterLink>
              <button
                v-if="canRemoveMember(m)"
                type="button"
                class="members-kick"
                :aria-label="m.id === auth.user?.id ? 'выйти' : 'убрать'"
                @click="kickMember(m)"
              >
                <AppIcon :name="m.id === auth.user?.id ? 'logout' : 'delete'" :size="15" />
              </button>
            </li>
          </ul>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="addMemberOpen" class="group-modal" @click.self="closeAddMember">
        <div class="group-modal-card">
          <div class="group-modal-head">
            <span>добавить участника</span>
            <button type="button" class="group-modal-x" aria-label="закрыть" @click="closeAddMember">×</button>
          </div>
          <div class="member-picker">
            <div class="member-combo" @click="focusMemberInput">
              <input
                ref="memberInput"
                v-model="memberQuery"
                type="text"
                class="member-query"
                placeholder="ник"
                autocomplete="off"
                @keydown="onAddMemberKey"
              />
            </div>
            <ul v-if="memberSuggestions.length" class="member-suggest">
              <li
                v-for="(u, i) in memberSuggestions"
                :key="u.nickname"
                :class="{ on: i === memberPickIdx }"
                @mousedown.prevent="confirmAddMember(u)"
              >
                <span class="member-suggest-av">
                  <img v-if="u.avatar_url" :src="u.avatar_url" alt="" />
                  <span v-else>{{ u.nickname.slice(0, 2) }}</span>
                </span>
                <span class="member-suggest-text">
                  <span>{{ u.nickname }}</span>
                  <span v-if="u.full_name" class="muted small">{{ u.full_name }}</span>
                </span>
              </li>
            </ul>
            <p v-else-if="memberSearching" class="muted small member-hint">поиск…</p>
          </div>
        </div>
      </div>
    </Teleport>

    <div v-if="lightboxUrl" class="lightbox" @click="lightboxUrl = ''">
      <img :src="lightboxUrl" alt="" />
    </div>
  </section>
</template>

<style scoped>
.chats {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 0;
  border: 1px solid var(--border);
  /* сначала vh — старые браузеры; dvh — мобильный chrome без «обрезания» композера */
  height: calc(100vh - 8.75rem);
  max-height: calc(100vh - 8.75rem);
  height: calc(100dvh - 8.75rem);
  max-height: calc(100dvh - 8.75rem);
  min-height: 0;
  overflow: hidden;
}

.list {
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
}
.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem 0.6rem 0.55rem 1rem;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--bg, #000);
  z-index: 1;
}
.list-head-act {
  width: 36px;
  height: 36px;
  min-height: 36px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.list-head-act:hover {
  color: var(--text);
  background: var(--surface2);
}
.group-modal {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0, 0, 0, 0.72);
  display: grid;
  place-items: center;
  padding: 1rem;
}
.group-modal-card {
  width: min(420px, 100%);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg, #000);
  padding: 1rem;
  display: grid;
  gap: 0.75rem;
}
.group-modal-head {
  display: grid;
  grid-template-columns: 36px 1fr 36px;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
  color: var(--text);
  text-transform: lowercase;
}
.group-modal-head > span {
  text-align: center;
}
.group-modal-spacer {
  width: 36px;
  height: 36px;
}
.group-modal-back {
  width: 36px;
  height: 36px;
  min-height: 36px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}
.group-modal-back:hover {
  color: var(--text);
  background: var(--surface2);
}
.compose-query {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.55rem 1rem;
  font: inherit;
  font-size: 0.9rem;
  background: transparent;
  color: var(--text);
  width: 100%;
}
.compose-query:focus {
  outline: none;
  border-color: var(--focus-border);
}
.compose-switch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  width: 100%;
  min-height: 40px;
  margin-top: 0.25rem;
  padding: 0.45rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 0.88rem;
  cursor: pointer;
  text-transform: lowercase;
}
.compose-switch:hover {
  background: var(--surface2);
}
.group-modal-x {
  width: 36px;
  height: 36px;
  min-height: 36px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
}
.group-modal-x:hover {
  color: var(--text);
  background: var(--surface2);
}
.group-form {
  display: grid;
  gap: 0.75rem;
  width: 100%;
}
.group-form-top {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 0.65rem;
  align-items: center;
}
.group-avatar-pick {
  width: 64px;
  height: 64px;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--avatar-radius);
  background: var(--surface);
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: pointer;
  flex-shrink: 0;
}
.group-avatar-pick img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.group-title-in {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.55rem 1rem;
  font: inherit;
  font-size: 0.92rem;
  background: transparent;
  color: var(--text);
  text-align: left;
}
.group-title-in:focus {
  outline: none;
  border-color: var(--focus-border);
}
.member-picker {
  position: relative;
  width: 100%;
}
.member-combo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  width: 100%;
  min-height: 44px;
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  cursor: text;
}
.member-combo:focus-within {
  border-color: var(--focus-border);
}
.member-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.22rem 0.35rem 0.22rem 0.28rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg, #000);
  font-size: 0.84rem;
  color: var(--text);
  text-transform: lowercase;
  flex-shrink: 0;
}
.member-chip-x {
  width: 20px;
  height: 20px;
  min-height: 20px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
}
.member-chip-x:hover {
  color: var(--text);
  background: var(--surface2);
}
.group-create-btn {
  width: 100%;
  min-height: 40px;
  border-radius: 999px;
  font-size: 0.88rem;
}
.members-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0;
  max-height: min(50vh, 360px);
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.members-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.35rem 0.35rem 0.55rem;
  border-bottom: 1px solid var(--border);
}
.members-row:last-child {
  border-bottom: none;
}
.members-who {
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 0.55rem;
  align-items: center;
  min-width: 0;
  color: var(--text);
  text-transform: lowercase;
  text-decoration: none;
}
.members-who:hover {
  text-decoration: none;
}
.members-who-text {
  display: grid;
  gap: 0.05rem;
  min-width: 0;
}
.members-kick {
  width: 36px;
  height: 36px;
  min-height: 36px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.members-kick:hover {
  color: var(--text);
  background: var(--surface2);
}
.who--group {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  padding: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.who--group:hover .who-text > span:first-child {
  color: var(--text);
}
.member-chip-av {
  width: 24px;
  height: 24px;
  border-radius: var(--avatar-radius);
  border: 1px solid var(--border);
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  flex-shrink: 0;
  background: var(--surface2);
}
.member-chip-av img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.member-chip-nick {
  line-height: 1.2;
  white-space: nowrap;
}
.member-query {
  flex: 1 1 80px;
  min-width: 80px;
  border: none;
  background: transparent;
  padding: 0.25rem 0.35rem;
  font: inherit;
  font-size: 0.9rem;
  color: var(--text);
}
.member-query:focus {
  outline: none;
}
.member-suggest {
  list-style: none;
  margin: 0.35rem 0 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  max-height: 220px;
  overflow-y: auto;
}
.member-suggest li {
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 0.55rem;
  align-items: center;
  padding: 0.5rem 0.65rem;
  cursor: pointer;
}
.member-suggest li.on,
.member-suggest li:hover {
  background: var(--surface2);
}
.member-suggest-av {
  width: 32px;
  height: 32px;
  border-radius: var(--avatar-radius);
  border: 1px solid var(--border);
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  color: var(--muted);
}
.member-suggest-av img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.member-suggest-text {
  display: grid;
  gap: 0.05rem;
  min-width: 0;
  text-transform: lowercase;
}
.member-hint {
  padding: 0.2rem 0.4rem;
}
.list-head h2 {
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0;
  text-transform: lowercase;
  color: var(--text);
}
.center {
  margin: auto;
}

.chat-row-outer {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: stretch;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  background: transparent;
  outline: none;
}
.chat-row-outer:focus-visible {
  outline: 2px solid var(--border);
  outline-offset: -2px;
}
.chat-row-outer:hover {
  background: var(--surface);
}
.chat-row-outer.on {
  background: var(--surface2);
}
.chat-row-outer.on:hover {
  background: var(--surface2);
}
.chat-row {
  display: grid;
  grid-template-columns: 36px 1fr;
  gap: 0.6rem;
  align-items: center;
  width: 100%;
  min-width: 0;
  padding: 0.7rem 0.9rem;
  border: none;
  border-radius: 0;
  background: transparent;
  text-align: left;
  font: inherit;
  min-height: 0;
}
.chat-row-outer.on .chat-row {
  background: transparent;
}

.avatar {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: var(--avatar-radius);
  border: 1px solid var(--border);
  background: var(--surface);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--muted);
  font-weight: 500;
  font-size: 0.78rem;
  text-transform: lowercase;
  flex-shrink: 0;
}
.avatar.small {
  width: 28px;
  height: 28px;
  font-size: 0.7rem;
}
.who-text {
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
  min-width: 0;
}
.presence-label {
  color: var(--muted);
  font-size: 0.72rem;
  line-height: 1.2;
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--avatar-radius);
}

.row-text {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}
.row-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}
.nick {
  color: var(--text);
  font-size: 0.92rem;
  text-transform: lowercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.time {
  font-size: 0.72rem;
  flex-shrink: 0;
}
.last {
  font-size: 0.82rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chat-row-side {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0 0.4rem 0 0;
}
.chat-row-del {
  width: 36px;
  height: 36px;
  min-height: 36px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.chat-row-outer:hover .chat-row-del {
  opacity: 1;
}
.chat-row-del:hover {
  color: var(--text);
  background: var(--surface2);
}
.chat-row-outer.unread .nick,
.chat-row-outer.unread .last {
  color: var(--text);
}
.badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: var(--text);
  color: var(--bg, #000);
  border-radius: 999px;
  font-size: 0.7rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.small {
  font-size: 0.78rem;
}

.thread {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: transparent;
}

.thread-head {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.65rem 1rem;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.thread-head-actions {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}
.thread-act {
  width: 40px;
  height: 40px;
  min-height: 40px;
  padding: 0;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.thread-act:hover {
  color: var(--text);
  background: var(--surface2);
}
.back {
  display: none;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  min-height: 40px;
  background: transparent;
  border: none;
  border-radius: var(--radius-pill);
  color: var(--muted);
  font-size: 1.1rem;
  padding: 0;
  margin-right: 0.1rem;
  flex-shrink: 0;
}
.back:hover {
  color: var(--text);
  background: var(--surface2);
}
.who {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text);
  text-transform: lowercase;
  flex: 1;
  min-width: 0;
}
.who:hover {
  text-decoration: none;
}

.messages {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.day-mark {
  text-align: center;
  padding: 0.35rem 0 0.05rem;
  align-self: center;
  max-width: 100%;
  line-height: 1.35;
}
.msg {
  display: flex;
  justify-content: flex-start;
  align-items: flex-end;
  gap: 0.3rem;
}
.msg.me {
  justify-content: flex-start;
  flex-direction: row-reverse;
}
.bubble {
  max-width: 70%;
  padding: 0.4rem 0.65rem 0.35rem;
  border: 1px solid var(--border);
  border-radius: 14px;
  border-bottom-left-radius: 4px;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  column-gap: 0.5rem;
  row-gap: 0.1rem;
}
.msg.me .bubble {
  background: var(--surface2);
  border-bottom-left-radius: 14px;
  border-bottom-right-radius: 4px;
}
.bubble > .msg-img {
  flex-basis: 100%;
}
.msg-sender {
  flex-basis: 100%;
  font-size: 0.74rem;
  color: var(--muted);
  text-transform: lowercase;
  line-height: 1.2;
}
.msg-sender:hover {
  color: var(--text);
  text-decoration: none;
}
.msg-reply {
  flex-basis: 100%;
  border-left: 2px solid var(--border);
  padding: 0.1rem 0 0.15rem 0.45rem;
  margin-bottom: 0.15rem;
  display: grid;
  gap: 0.08rem;
}
.msg-reply-author {
  font-size: 0.72rem;
}
.msg-reply-snippet {
  font-size: 0.8rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.35;
}
.text {
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: anywhere;
  font-size: 0.93rem;
  line-height: 1.4;
  flex: 1 1 auto;
  min-width: 0;
}
.meta {
  margin-left: auto;
  font-size: 0.68rem;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  white-space: nowrap;
  opacity: 0.7;
}
.msg-seen {
  display: inline-flex;
  align-items: center;
  line-height: 0;
  color: var(--muted);
}

.msg-actions {
  display: inline-flex;
  gap: 0.15rem;
  opacity: 0;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
}
.msg:hover .msg-actions {
  opacity: 1;
}
.msg-act {
  width: 36px;
  height: 36px;
  min-height: 36px;
  padding: 0;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.msg-act:hover {
  background: var(--surface2);
  color: var(--text);
}

.edit-area {
  width: 100%;
  min-width: 220px;
  resize: vertical;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.4rem 0.6rem;
  font: inherit;
  font-size: 0.92rem;
  background: transparent;
  color: var(--text);
}
.edit-area:focus {
  outline: none;
  border-color: var(--focus-border);
}
.edit-actions {
  display: inline-flex;
  gap: 0.4rem;
  justify-content: flex-end;
}
.edit-actions button {
  padding: 0.25rem 0.7rem;
  min-height: 0;
  font-size: 0.78rem;
  border-radius: 999px;
}
.edit-actions .ghost {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--muted);
}

.composer-wrap {
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
.reply-bar {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.45rem 1rem 0;
  border-bottom: 1px solid var(--border);
}
.reply-bar-lines {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 0.12rem;
}
.reply-bar-who {
  font-size: 0.75rem;
}
.reply-bar-snippet {
  font-size: 0.82rem;
  line-height: 1.35;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.reply-bar-x {
  width: 36px;
  height: 36px;
  min-height: 36px;
  padding: 0;
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
}
.reply-bar-x:hover {
  color: var(--text);
  background: var(--surface2);
}
.pending {
  position: relative;
  padding: 0.6rem 1rem 0;
  display: inline-block;
}
.pending img {
  max-height: 120px;
  max-width: 220px;
  border-radius: 8px;
  border: 1px solid var(--border);
  display: block;
}
.pending-x {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  width: 22px;
  height: 22px;
  min-height: 22px;
  padding: 0;
  border-radius: 999px;
  border: none;
  background: rgba(0, 0, 0, 0.7);
  color: var(--text);
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
}
/* зона клика ≥36px без увеличения глифа */
.pending-x::after {
  content: "";
  position: absolute;
  inset: -8px;
}
.composer {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.5rem;
  padding: 0.7rem 1rem;
  align-items: end;
}
.attach {
  width: 40px;
  height: 40px;
  min-height: 40px;
  padding: 0;
  border-radius: 999px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.attach:hover {
  color: var(--text);
}
.composer .composer-ta {
  resize: none;
  min-height: 40px;
  max-height: 220px;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.55rem 1rem;
  font: inherit;
  font-size: 0.92rem;
  line-height: 1.4;
  background: transparent;
  color: var(--text);
  overflow-y: hidden;
}
.composer .composer-ta.composer-ta--tall {
  border-radius: 14px;
}
.composer .composer-ta:focus {
  outline: none;
  border-color: var(--focus-border);
}
.composer button:not(.attach) {
  padding: 0.4rem 1rem;
  min-height: 40px;
  border-radius: 999px;
  font-size: 0.85rem;
}

.msg-img {
  max-width: 100%;
  max-height: 280px;
  border-radius: 10px;
  display: block;
  cursor: zoom-in;
}
.msg.me .msg-img {
  margin-left: auto;
}

.lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.92);
  display: grid;
  place-items: center;
  z-index: 200;
  cursor: zoom-out;
  padding: 1rem;
}
.lightbox img {
  max-width: 96vw;
  max-height: 92vh;
  display: block;
}

@media (min-width: 761px) {
  .chats {
    min-height: 400px;
  }
}

@media (max-width: 760px) {
  .chats {
    grid-template-columns: 1fr;
    height: calc(100vh - 6.25rem);
    max-height: calc(100vh - 6.25rem);
    height: calc(100dvh - 6.25rem);
    max-height: calc(100dvh - 6.25rem);
  }
  .list.hidden {
    display: none;
  }
  .thread.hidden {
    display: none;
  }
  .back {
    display: inline-flex;
  }
  .list {
    border-right: none;
  }
}
</style>
