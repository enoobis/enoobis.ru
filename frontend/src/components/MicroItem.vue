<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import AppIcon from "./AppIcon.vue";
import RichText from "./RichText.vue";
import {
  bookmarkMicro,
  deleteMicro,
  unbookmarkMicro,
  updateMicro,
  voteMicro,
  type MicroPost,
} from "../api/micro";
import AnimatedNumber from "./AnimatedNumber.vue";
import { useAuthStore } from "../stores/auth";
import { usePop } from "../composables/usePop";
import { haptic } from "../utils/haptics";
import { toast, toastError, toastSuccess } from "../utils/toast";
import { nextVoteState } from "../utils/voteState";
import "../styles/post-actions.css";

const ACT = 17;

const props = defineProps<{
  post: MicroPost;
  clickable?: boolean;
  connected?: boolean;
}>();

const emit = defineEmits<{
  (e: "deleted", id: string): void;
  (e: "updated", post: MicroPost): void;
  (e: "unsaved", id: string): void;
}>();

const auth = useAuthStore();
const router = useRouter();
const myVote = ref<1 | -1 | null>(props.post.my_vote);
const upCount = ref(props.post.up_count);
const downCount = ref(props.post.down_count);
const bookmarked = ref(!!props.post.bookmarked_by_me);
const busy = ref(false);
const { popped, pop } = usePop();
let voteSeq = 0;
let bookmarkSeq = 0;

watch(
  () => props.post,
  (p) => {
    if (busy.value) return;
    myVote.value = p.my_vote;
    upCount.value = p.up_count;
    downCount.value = p.down_count;
    bookmarked.value = !!p.bookmarked_by_me;
  },
);
const editing = ref(false);
const draft = ref("");
const saving = ref(false);
const EDIT_WINDOW_MS = 5 * 60 * 1000;
const isAuthor = computed(() => auth.user?.id === props.post.author_id);
const canDelete = computed(
  () => !!auth.token && (isAuthor.value || auth.role === "admin"),
);
const canEdit = computed(() => {
  if (!isAuthor.value) return false;
  const t = Date.parse(props.post.created_at);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < EDIT_WINDOW_MS;
});
const initials = computed(() => props.post.author_nickname.slice(0, 2));
const authorAvatarBroken = ref(false);
const timeAgo = computed(() => formatAgo(props.post.created_at));

const menuOpen = ref(false);
const hasMenu = computed(() => canEdit.value || canDelete.value);

function closeMenu() {
  menuOpen.value = false;
}

function onEsc(e: KeyboardEvent) {
  if (e.key === "Escape") closeMenu();
}

watch(menuOpen, (open) => {
  if (open) {
    document.addEventListener("click", closeMenu);
    document.addEventListener("keydown", onEsc);
  } else {
    document.removeEventListener("click", closeMenu);
    document.removeEventListener("keydown", onEsc);
  }
});

onUnmounted(() => {
  document.removeEventListener("click", closeMenu);
  document.removeEventListener("keydown", onEsc);
});

function formatAgo(iso: string) {
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return "";
  const diff = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} д`;
  return iso.slice(0, 10);
}

async function castVote(vote: 1 | -1) {
  if (!auth.token || isAuthor.value) return;

  const before = { my_vote: myVote.value, up_count: upCount.value, down_count: downCount.value };
  const next = nextVoteState(before, vote);
  myVote.value = next.my_vote;
  upCount.value = next.up_count;
  downCount.value = next.down_count;
  pop(vote === 1 ? "up" : "down");
  haptic("tap");

  const seq = ++voteSeq;
  busy.value = true;
  try {
    const res = await voteMicro(props.post.id, auth.token, vote);
    if (seq !== voteSeq) return;
    myVote.value = res.my_vote;
    upCount.value = res.up_count;
    downCount.value = res.down_count;
  } catch (e) {
    if (seq !== voteSeq) return;
    myVote.value = before.my_vote;
    upCount.value = before.up_count;
    downCount.value = before.down_count;
    toastError(e);
  } finally {
    if (seq === voteSeq) busy.value = false;
  }
}

async function toggleBookmark() {
  if (!auth.token) return;

  const before = bookmarked.value;
  bookmarked.value = !before;
  pop("save");
  haptic("toggle");

  const seq = ++bookmarkSeq;
  busy.value = true;
  try {
    if (before) {
      await unbookmarkMicro(props.post.id, auth.token);
      if (seq === bookmarkSeq) emit("unsaved", props.post.id);
    } else {
      await bookmarkMicro(props.post.id, auth.token);
      if (seq === bookmarkSeq) toastSuccess("в закладках");
    }
  } catch (e) {
    if (seq !== bookmarkSeq) return;
    bookmarked.value = before;
    toastError(e);
  } finally {
    if (seq === bookmarkSeq) busy.value = false;
  }
}

async function remove() {
  closeMenu();
  if (!auth.token || !canDelete.value || busy.value) return;
  if (!confirm("удалить?")) return;
  busy.value = true;
  try {
    await deleteMicro(props.post.id, auth.token);
    emit("deleted", props.post.id);
  } catch (e) {
    toastError(e);
  } finally {
    busy.value = false;
  }
}

function openDetail() {
  if (!props.clickable || editing.value) return;
  router.push(`/microblogs/${props.post.id}`);
}

function startEdit() {
  closeMenu();
  draft.value = props.post.body;
  editing.value = true;
}

function cancelEdit() {
  editing.value = false;
  draft.value = "";
}

async function saveEdit() {
  if (!auth.token || saving.value) return;
  const text = draft.value.trim();
  if (!text || text === props.post.body) {
    cancelEdit();
    return;
  }
  saving.value = true;
  try {
    const updated = await updateMicro(props.post.id, auth.token, text);
    editing.value = false;
    draft.value = "";
    emit("updated", updated);
  } catch (e) {
    toastError(e);
  } finally {
    saving.value = false;
  }
}

async function share() {
  const url = `${window.location.origin}/microblogs/${props.post.id}`;
  try {
    await navigator.clipboard.writeText(url);
    toastSuccess("ссылка скопирована");
  } catch {
    toast(url);
  }
}
</script>

<template>
  <article
    class="item"
    :class="{ clickable: clickable && !editing, connected }"
    @click="openDetail"
  >
    <div class="rail">
      <RouterLink :to="`/u/${post.author_nickname}`" class="avatar" @click.stop>
        <img
          v-if="post.author_avatar && !authorAvatarBroken"
          :src="post.author_avatar"
          alt=""
          @error="authorAvatarBroken = true"
        />
        <span v-else>{{ initials }}</span>
      </RouterLink>
      <span v-if="connected" class="thread-line" aria-hidden="true" />
    </div>

    <div class="content">
      <header>
        <RouterLink :to="`/u/${post.author_nickname}`" class="author" @click.stop>
          {{ post.author_nickname }}
        </RouterLink>
        <span class="time">{{ timeAgo }}</span>

        <div v-if="hasMenu" class="more-wrap" @click.stop>
          <button
            class="more"
            type="button"
            :aria-expanded="menuOpen"
            title="ещё"
            @click="menuOpen = !menuOpen"
          >
            <AppIcon name="more" :size="16" />
          </button>
          <div v-if="menuOpen" class="menu">
            <button v-if="canEdit" type="button" @click="startEdit">редактировать</button>
            <button v-if="canDelete" type="button" @click="remove">удалить</button>
          </div>
        </div>
      </header>

      <div v-if="editing" class="edit" @click.stop>
        <textarea v-model="draft" rows="2" :maxlength="480" />
        <div class="edit-row">
          <button class="ghost" type="button" @click="cancelEdit">отмена</button>
          <button type="button" :disabled="saving || !draft.trim()" @click="saveEdit">
            {{ saving ? "…" : "сохранить" }}
          </button>
        </div>
      </div>

      <template v-else>
        <p v-if="post.body" class="body"><RichText :text="post.body" /></p>
        <img
          v-if="post.image_url"
          :src="post.image_url"
          alt=""
          class="image"
          loading="lazy"
          decoding="async"
        />
      </template>

      <div class="post-actions" @click.stop>
        <div v-if="!isAuthor" class="votes">
          <button
            class="act"
            type="button"
            :class="{ on: myVote === 1, pop: popped === 'up' }"
            :disabled="!auth.token || editing"
            title="вверх"
            @click="castVote(1)"
          >
            <AppIcon name="voteUp" :size="ACT" />
          </button>
          <span v-if="upCount || downCount" class="vote-score">
            <AnimatedNumber v-if="upCount" :value="upCount" />
            <span v-if="upCount && downCount" class="vote-sep">·</span>
            <AnimatedNumber v-if="downCount" :value="downCount" />
          </span>
          <button
            class="act"
            type="button"
            :class="{ on: myVote === -1, pop: popped === 'down' }"
            :disabled="!auth.token || editing"
            title="вниз"
            @click="castVote(-1)"
          >
            <AppIcon name="voteDown" :size="ACT" />
          </button>
        </div>
        <span v-else-if="upCount || downCount" class="votes votes-readonly">
          <span class="act" aria-hidden="true"><AppIcon name="voteUp" :size="ACT" /></span>
          <span class="vote-score">
            <span v-if="upCount">{{ upCount }}</span>
            <span v-if="upCount && downCount" class="vote-sep">·</span>
            <span v-if="downCount">{{ downCount }}</span>
          </span>
          <span class="act" aria-hidden="true"><AppIcon name="voteDown" :size="ACT" /></span>
        </span>
        <RouterLink :to="`/microblogs/${post.id}`" class="act" title="комментарии">
          <AppIcon name="comment" :size="ACT" />
          <span v-if="post.reply_count">{{ post.reply_count }}</span>
        </RouterLink>
        <button
          v-if="auth.token"
          class="act"
          type="button"
          :class="{ on: bookmarked, pop: popped === 'save' }"
          :title="bookmarked ? 'убрать из закладок' : 'в закладки'"
          @click="toggleBookmark"
        >
          <AppIcon :name="bookmarked ? 'bookmarked' : 'bookmark'" :size="ACT" />
        </button>
        <button class="act" type="button" title="поделиться" @click="share">
          <AppIcon name="send" :size="ACT" />
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.item {
  display: grid;
  grid-template-columns: var(--avatar-md) 1fr;
  gap: 0.75rem;
  padding: 0.9rem 0;
  border-bottom: 1px solid var(--border);
}
/* пост продолжается ответами — линия ведёт дальше, разделителя нет */
.item.connected {
  padding-bottom: 0;
  border-bottom: none;
}
.item.clickable {
  cursor: pointer;
}
.item.clickable:hover .body {
  color: var(--text);
}

.rail {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}
/* выходит за пределы поста, чтобы линия не рвалась на отступе следующего */
.thread-line {
  position: absolute;
  top: calc(var(--avatar-md) + 0.5rem);
  bottom: -0.9rem;
  left: 50%;
  width: 2px;
  margin-left: -1px;
  border-radius: 1px;
  background: var(--hover-border);
}

.avatar {
  width: var(--avatar-md);
  height: var(--avatar-md);
  flex: 0 0 var(--avatar-md);
  border-radius: var(--avatar-radius);
  border: 1px solid var(--border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  color: var(--muted);
  font-weight: 500;
  text-transform: lowercase;
  font-size: 0.78rem;
  overflow: hidden;
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--avatar-radius);
}

.content {
  min-width: 0;
}
header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 1.75rem;
}
.author {
  color: var(--text);
  font-weight: 600;
  font-size: 0.95rem;
  text-transform: lowercase;
}
.time {
  color: var(--muted);
  font-size: var(--text-sm);
}

.more-wrap {
  position: relative;
  margin-left: auto;
}
.more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  min-height: 0;
  padding: 0;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--muted);
}
.more:hover {
  background: var(--hover-surface);
  color: var(--text);
}
.menu {
  position: absolute;
  top: calc(100% + 0.25rem);
  right: 0;
  z-index: 20;
  min-width: 9.5rem;
  display: grid;
  padding: 0.25rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
}
.menu button {
  width: 100%;
  min-height: 2.25rem;
  padding: 0.45rem 0.6rem;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font-size: var(--text-sm);
  text-align: left;
}
.menu button:hover {
  background: var(--surface2);
}

.body {
  margin: 0.1rem 0 0.5rem;
  word-wrap: break-word;
  line-height: 1.5;
  font-size: 0.98rem;
}

/* глобальный hover на --surface почти не виден на чёрной теме */
.post-actions .act:hover:not(:disabled) {
  background: var(--hover-surface);
}

.image {
  width: 100%;
  max-width: 100%;
  height: auto;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  margin: 0.4rem 0 0.5rem;
  display: block;
}

.edit {
  display: grid;
  gap: 0.4rem;
  margin: 0.2rem 0 0.5rem;
}
.edit textarea {
  resize: vertical;
  font-size: 0.95rem;
  line-height: 1.5;
}
.edit-row {
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
}
.edit-row button {
  padding: 0.3rem 0.7rem;
  min-height: 40px;
  border-radius: 999px;
  font-size: 0.82rem;
}
.ghost {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--muted);
}
.ghost:hover {
  color: var(--text);
}

.post-actions {
  margin-top: 0.35rem;
  gap: 0.15rem;
}
</style>
