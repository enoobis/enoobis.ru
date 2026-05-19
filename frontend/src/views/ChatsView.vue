<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import {
  clearThreadMessages,
  deleteChatThread,
  deleteMessage,
  editMessage,
  listChats,
  listMessages,
  listOutgoingReadFlags,
  markChatRead,
  openChatWith,
  sendMessage,
  uploadChatImage,
  type ChatMessage,
  type ChatThread,
} from "../api/chat";
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
const otherOnline = ref<boolean | null>(null);
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

function replyAuthorLabel(fromMe: boolean): string {
  return fromMe ? "вы" : otherNickname.value || "собеседник";
}

async function removeChatFromList(c: ChatThread) {
  if (!auth.token) return;
  if (!window.confirm("убрать чат из списка?")) return;
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
  loadingMessages.value = true;
  try {
    const data = await listMessages(activeId.value, auth.token);
    messages.value = data.items;
    otherNickname.value = data.other?.nickname ?? "";
    otherAvatar.value = data.other?.avatar_url ?? "";
    otherOnline.value =
      data.other?.online === null || data.other?.online === undefined
        ? null
        : !!data.other.online.online;
    if (scrollEnd) {
      await nextTick();
      messagesEnd.value?.scrollIntoView({ block: "end" });
    }
    await markChatRead(activeId.value, auth.token);
    const c = chats.value.find((x) => x.id === activeId.value);
    if (c) c.unread = 0;
    void chatStore.refresh();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    loadingMessages.value = false;
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
  const last = messages.value.at(-1)?.created_at;
  try {
    const data = await listMessages(activeId.value, auth.token, last);
    if (data.other) {
      otherOnline.value =
        data.other.online === null || data.other.online === undefined
          ? null
          : !!data.other.online.online;
    }
    if (data.items.length) {
      messages.value = [...messages.value, ...data.items];
      await nextTick();
      messagesEnd.value?.scrollIntoView({ block: "end", behavior: "smooth" });
      await markChatRead(activeId.value, auth.token);
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
      otherOnline.value = null;
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
});
</script>

<template>
  <section class="chats">
    <aside class="list" :class="{ hidden: activeId }">
      <div class="list-head">
        <h2>чаты</h2>
      </div>
      <p v-if="loadingChats && !chats.length" class="muted small pad">загрузка</p>
      <p v-else-if="!chats.length" class="muted small pad">пусто</p>
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
          <span class="avatar" :class="{ 'has-online': c.other_online === true }">
            <img v-if="c.other_avatar" :src="c.other_avatar" alt="" />
            <span v-else>{{ c.other_nickname.slice(0, 2) }}</span>
            <span v-if="c.other_online === true" class="online-dot" />
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
          <RouterLink v-if="otherNickname" :to="`/u/${otherNickname}`" class="who">
            <span class="avatar small" :class="{ 'has-online': otherOnline === true }">
              <img v-if="otherAvatar" :src="otherAvatar" alt="" />
              <span v-else>{{ otherNickname.slice(0, 2) }}</span>
              <span v-if="otherOnline === true" class="online-dot" />
            </span>
            <span class="who-text">
              <span>{{ otherNickname }}</span>
              <span v-if="otherOnline === true" class="online-label">онлайн</span>
            </span>
          </RouterLink>
          <span v-if="otherNickname" class="thread-head-actions">
            <button
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
              aria-label="убрать чат из списка"
              title="убрать чат"
              @click="removeCurrentChat"
            >
              <AppIcon name="delete" :size="16" />
            </button>
          </span>
        </header>

        <div class="messages">
          <p v-if="loadingMessages && !messages.length" class="muted small pad">загрузка</p>
          <p v-else-if="!messages.length" class="muted small pad">напишите первое сообщение</p>
          <template v-for="row in messageRows" :key="row.id">
            <div v-if="row.kind === 'day'" class="day-mark muted small">
              {{ row.line }}
            </div>
            <div v-else class="msg" :class="{ me: row.m.from_me }">
              <span class="bubble">
                <div v-if="row.m.reply_to" class="msg-reply muted small">
                  <span class="msg-reply-author">{{ replyAuthorLabel(row.m.reply_to.from_me) }}</span>
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
              <span class="reply-bar-who">{{ replyAuthorLabel(replyTarget.from_me) }}</span>
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
      <p v-else class="muted small pad center">выберите чат слева</p>
    </main>

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
  border-radius: var(--radius);
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
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--bg, #000);
  z-index: 1;
}
.list-head h2 {
  font-size: 0.95rem;
  font-weight: 500;
  margin: 0;
  text-transform: lowercase;
  color: var(--muted);
}
.pad {
  padding: 1rem;
}
.center {
  text-align: center;
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
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
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
.avatar .online-dot {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #4ade80;
  border: 2px solid var(--bg, #0a0a0a);
  box-sizing: border-box;
  z-index: 1;
}
.avatar.small .online-dot {
  width: 8px;
  height: 8px;
}
.who-text {
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
  min-width: 0;
}
.online-label {
  color: #4ade80;
  font-size: 0.72rem;
  line-height: 1.2;
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
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
  width: 28px;
  height: 28px;
  min-height: 28px;
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
  flex-shrink: 0;
}
.thread-act:hover {
  color: var(--text);
  background: var(--surface2);
}
.back {
  display: none;
  background: transparent;
  border: none;
  color: var(--muted);
  font-size: 1rem;
  padding: 0;
  min-height: 0;
  margin-right: 0.2rem;
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
  width: 24px;
  height: 24px;
  min-height: 24px;
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
  border-color: #3a3a3a;
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
  width: 26px;
  height: 26px;
  min-height: 26px;
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
  border-color: #3a3a3a;
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
    display: inline;
  }
  .list {
    border-right: none;
  }
}
</style>
