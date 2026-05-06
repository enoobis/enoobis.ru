<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import AppIcon from "./AppIcon.vue";
import RichText from "./RichText.vue";
import {
  bookmarkMicro,
  deleteMicro,
  likeMicro,
  unbookmarkMicro,
  unlikeMicro,
  updateMicro,
  type MicroPost,
} from "../api/micro";
import { pinPost } from "../api/profile";
import { useAuthStore } from "../stores/auth";
import { toast, toastError, toastSuccess } from "../utils/toast";

const props = defineProps<{
  post: MicroPost;
  clickable?: boolean;
}>();

const emit = defineEmits<{
  (e: "deleted", id: string): void;
  (e: "updated", post: MicroPost): void;
  (e: "unsaved", id: string): void;
}>();

const auth = useAuthStore();
const router = useRouter();
const liked = ref(props.post.liked_by_me);
const likes = ref(props.post.like_count);
const bookmarked = ref(!!props.post.bookmarked_by_me);
const busy = ref(false);
const editing = ref(false);
const draft = ref("");
const saving = ref(false);
const pinBusy = ref(false);

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
const timeAgo = computed(() => formatAgo(props.post.created_at));

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

async function toggleLike() {
  if (!auth.token || busy.value) return;
  busy.value = true;
  try {
    if (liked.value) {
      await unlikeMicro(props.post.id, auth.token);
      liked.value = false;
      likes.value = Math.max(0, likes.value - 1);
    } else {
      await likeMicro(props.post.id, auth.token);
      liked.value = true;
      likes.value += 1;
    }
  } catch {
    /* ignore */
  } finally {
    busy.value = false;
  }
}

async function toggleBookmark() {
  if (!auth.token || busy.value) return;
  busy.value = true;
  try {
    if (bookmarked.value) {
      await unbookmarkMicro(props.post.id, auth.token);
      bookmarked.value = false;
      emit("unsaved", props.post.id);
    } else {
      await bookmarkMicro(props.post.id, auth.token);
      bookmarked.value = true;
      toastSuccess("в закладках");
    }
  } catch (e) {
    toastError(e);
  } finally {
    busy.value = false;
  }
}

async function togglePin() {
  if (!auth.token || pinBusy.value) return;
  pinBusy.value = true;
  try {
    await pinPost(auth.token, { type: "micro", id: props.post.id });
    toastSuccess("закреплено в профиле");
  } catch (e) {
    toastError(e);
  } finally {
    pinBusy.value = false;
  }
}

async function remove() {
  if (!auth.token || !canDelete.value) return;
  if (!confirm("удалить?")) return;
  await deleteMicro(props.post.id, auth.token);
  emit("deleted", props.post.id);
}

function openDetail() {
  if (!props.clickable || editing.value) return;
  router.push(`/microblogs/${props.post.id}`);
}

function startEdit() {
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
  <article class="item" :class="{ clickable: clickable && !editing }" @click="openDetail">
    <RouterLink :to="`/u/${post.author_nickname}`" class="avatar" @click.stop>
      <img v-if="post.author_avatar" :src="post.author_avatar" alt="" />
      <span v-else>{{ initials }}</span>
    </RouterLink>

    <div class="content">
      <header>
        <RouterLink :to="`/u/${post.author_nickname}`" class="author" @click.stop>
          {{ post.author_nickname }}
        </RouterLink>
        <span class="muted small">· {{ timeAgo }}</span>
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
        <img v-if="post.image_url" :src="post.image_url" alt="" class="image" />
      </template>

      <div class="actions" @click.stop>
        <button
          class="action"
          type="button"
          :class="{ on: liked }"
          :disabled="!auth.token || editing"
          @click="toggleLike"
        >
          <AppIcon :name="liked ? 'liked' : 'like'" :size="14" />
          <span v-if="likes">{{ likes }}</span>
        </button>
        <RouterLink :to="`/microblogs/${post.id}`" class="action">
          <AppIcon name="comment" :size="14" />
          <span v-if="post.reply_count">{{ post.reply_count }}</span>
        </RouterLink>
        <button
          v-if="auth.token"
          class="action"
          type="button"
          :class="{ on: bookmarked }"
          :title="bookmarked ? 'убрать из закладок' : 'в закладки'"
          @click="toggleBookmark"
        >
          <AppIcon :name="bookmarked ? 'bookmarked' : 'bookmark'" :size="14" />
        </button>
        <button class="action" type="button" title="поделиться" @click="share">
          <AppIcon name="send" :size="14" />
        </button>
        <button
          v-if="isAuthor && !editing"
          class="action"
          type="button"
          title="закрепить в профиле"
          @click="togglePin"
        >
          <AppIcon name="pin" :size="14" />
        </button>
        <button
          v-if="canEdit && !editing"
          class="action"
          type="button"
          title="редактировать"
          @click="startEdit"
        >
          <AppIcon name="edit" :size="14" />
        </button>
        <button v-if="canDelete && !editing" class="action danger" type="button" @click="remove">
          <AppIcon name="delete" :size="14" />
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.item {
  display: grid;
  grid-template-columns: 36px 1fr;
  gap: 0.7rem;
  padding: 0.9rem 0;
  border-bottom: 1px solid var(--border);
}
.item.clickable {
  cursor: pointer;
}
.item.clickable:hover .body {
  color: var(--text);
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 999px;
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
  flex: 0 0 36px;
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.content {
  min-width: 0;
}
header {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  margin-bottom: 0.2rem;
}
.author {
  color: var(--text);
  font-weight: 500;
  font-size: 0.92rem;
  text-transform: lowercase;
}

.body {
  margin: 0.2rem 0 0.5rem;
  word-wrap: break-word;
  line-height: 1.5;
  font-size: 0.95rem;
}

.image {
  max-width: 100%;
  max-height: 320px;
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
  min-height: 28px;
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

.actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 0.3rem;
}
.action {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 0.2rem 0.4rem;
  min-height: 0;
  border-radius: 6px;
  font-size: 0.78rem;
}
.action:hover:not(:disabled) {
  color: var(--text);
  background: var(--surface);
}
.action.on {
  color: var(--text);
}
.action.danger:hover {
  color: var(--danger);
  background: transparent;
}
.small {
  font-size: 0.78rem;
}
</style>
