<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import {
  bookmarkPost,
  createComment,
  deleteComment,
  getMyPostState,
  getPost,
  likePost,
  listComments,
  reportComment,
  reportPost,
  unlikePost,
  unbookmarkPost,
  type BlogPost,
  type CommentItem,
} from "../api/blog";
import AppIcon from "../components/AppIcon.vue";
import { pinPost } from "../api/profile";
import { useAuthStore } from "../stores/auth";
import { renderMarkdown } from "../utils/markdown";
import { addRecentPost, updateRecentPostProgress } from "../utils/recentPosts";
import { toast, toastError, toastSuccess } from "../utils/toast";

const route = useRoute();
const auth = useAuthStore();
const post = ref<BlogPost | null>(null);
const comments = ref<CommentItem[]>([]);
const err = ref("");
const commentBody = ref("");
const working = ref(false);
const myState = ref({ liked: false, bookmarked: false, can_edit: false });

const postId = computed(() => String(route.params.id || ""));
const renderedBody = computed(() => renderMarkdown(post.value?.body ?? ""));

const readingMinutes = computed(() => {
  const text = (post.value?.body ?? "").replace(/\s+/g, " ").trim();
  if (!text) return 0;
  const words = text.split(" ").length;
  return Math.max(1, Math.round(words / 200));
});

async function load() {
  err.value = "";
  post.value = null;
  comments.value = [];
  try {
    post.value = await getPost(postId.value);
    addRecentPost(post.value);
    comments.value = await listComments(postId.value);
    if (auth.token) {
      myState.value = await getMyPostState(postId.value, auth.token);
    } else {
      myState.value = { liked: false, bookmarked: false, can_edit: false };
    }
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

function readingProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (max <= 0) return 100;
  return (window.scrollY / max) * 100;
}

function persistProgress() {
  if (!post.value) return;
  updateRecentPostProgress(post.value.id, readingProgress());
}

async function toggleLike() {
  if (!auth.token || !post.value || working.value) return;
  working.value = true;
  try {
    if (myState.value.liked) {
      await unlikePost(post.value.id, auth.token);
    } else {
      await likePost(post.value.id, auth.token);
    }
    await load();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    working.value = false;
  }
}

async function toggleBookmark() {
  if (!auth.token || !post.value || working.value) return;
  working.value = true;
  try {
    if (myState.value.bookmarked) {
      await unbookmarkPost(post.value.id, auth.token);
    } else {
      await bookmarkPost(post.value.id, auth.token);
    }
    await load();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    working.value = false;
  }
}

async function pinThis() {
  if (!auth.token || !post.value) return;
  try {
    await pinPost(auth.token, { type: "blog", id: post.value.id });
    toastSuccess("закреплено в профиле");
  } catch (e) {
    toastError(e);
  }
}

async function sendComment() {
  if (!auth.token || !post.value) return;
  const text = commentBody.value.trim();
  if (!text) return;
  try {
    await createComment(post.value.id, auth.token, text);
    commentBody.value = "";
    comments.value = await listComments(post.value.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

async function removeComment(id: string) {
  if (!auth.token || !post.value) return;
  try {
    await deleteComment(id, auth.token);
    comments.value = await listComments(post.value.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

async function sendPostReport() {
  if (!auth.token || !post.value) return;
  const reason = prompt("причина:");
  if (!reason) return;
  try {
    await reportPost(post.value.id, auth.token, reason);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

async function sharePost() {
  if (!post.value) return;
  const url = `${window.location.origin}/blogs/${post.value.id}`;
  try {
    await navigator.clipboard.writeText(url);
    toastSuccess("ссылка скопирована");
  } catch {
    toast(url);
  }
}

async function sendCommentReport(commentId: string) {
  if (!auth.token) return;
  const reason = prompt("причина:");
  if (!reason) return;
  try {
    await reportComment(commentId, auth.token, reason);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

onMounted(() => {
  window.addEventListener("scroll", persistProgress, { passive: true });
  load();
});
onUnmounted(() => {
  persistProgress();
  window.removeEventListener("scroll", persistProgress);
});
watch(() => route.params.id, load);
</script>

<template>
  <article v-if="post" class="post">
    <h1>{{ post.title }}</h1>
    <p class="meta muted">
      <RouterLink :to="`/u/${post.author_nickname}`">{{ post.author_nickname }}</RouterLink>
      · {{ (post.published_at || post.created_at).slice(0, 10) }}
      <span v-if="readingMinutes">· {{ readingMinutes }} мин чтения</span>
    </p>
    <img
      v-if="post.cover_image_url"
      :src="post.cover_image_url"
      alt=""
      class="cover"
    />
    <div class="markdown-body" v-html="renderedBody" />

    <div class="actions">
      <button v-if="auth.token" class="icon-action" type="button" :title="myState.liked ? 'убрать лайк' : 'лайк'" @click="toggleLike">
        <AppIcon :name="myState.liked ? 'liked' : 'like'" />
        <span>{{ post.like_count }}</span>
      </button>
      <button v-if="auth.token" class="icon-action" type="button" :title="myState.bookmarked ? 'убрать из закладок' : 'в закладки'" @click="toggleBookmark">
        <AppIcon :name="myState.bookmarked ? 'bookmarked' : 'bookmark'" />
      </button>
      <button class="icon-action" type="button" title="поделиться" @click="sharePost">
        <AppIcon name="send" />
      </button>
      <button
        v-if="myState.can_edit"
        class="icon-action"
        type="button"
        title="закрепить в профиле"
        @click="pinThis"
      >
        <AppIcon name="pin" />
      </button>
      <RouterLink v-if="myState.can_edit" :to="`/blogs/${post.id}/edit`" class="icon-action" title="редактировать">
        <AppIcon name="edit" />
      </RouterLink>
      <button v-if="auth.token" class="icon-action" type="button" title="пожаловаться" @click="sendPostReport">
        <AppIcon name="report" />
      </button>
    </div>

    <section class="comments">
      <h2>комментарии · {{ comments.length }}</h2>
      <div v-if="auth.token" class="comment-form">
        <textarea v-model="commentBody" rows="2" placeholder="комментарий" />
        <button type="button" :disabled="!commentBody.trim()" @click="sendComment">отправить</button>
      </div>
      <p v-else class="muted">
        <RouterLink to="/login">войдите</RouterLink>, чтобы комментировать
      </p>
      <ul v-if="comments.length" class="comment-list">
        <li v-for="c in comments" :key="c.id">
          <div class="muted small">{{ c.author_nickname }} · {{ c.created_at.slice(0, 10) }}</div>
          <p>{{ c.body }}</p>
          <div v-if="auth.token" class="comment-actions">
            <button
              v-if="auth.user?.id === c.user_id || auth.role === 'admin'"
              class="link-btn"
              type="button"
              @click="removeComment(c.id)"
            >
              удалить
            </button>
            <button class="link-btn" type="button" @click="sendCommentReport(c.id)">
              жалоба
            </button>
          </div>
        </li>
      </ul>
    </section>
  </article>
  <p v-else-if="err" class="error">{{ err }}</p>
  <p v-else class="muted">загрузка</p>
</template>

<style scoped>
.post {
  max-width: 680px;
  margin: 0 auto;
}
h1 {
  font-size: 1.6rem;
  font-weight: 600;
  line-height: 1.25;
  margin-bottom: 0.5rem;
}
.meta {
  font-size: 0.85rem;
  margin-bottom: 1.5rem;
}
.cover {
  width: 100%;
  border-radius: var(--radius);
  margin-bottom: 1.5rem;
}

.markdown-body {
  line-height: 1.7;
  font-size: 1rem;
}
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  font-weight: 600;
  margin: 1.6rem 0 0.6rem;
}
.markdown-body :deep(h2) {
  font-size: 1.25rem;
}
.markdown-body :deep(h3) {
  font-size: 1.1rem;
}
.markdown-body :deep(p) {
  margin: 0.6rem 0;
}
.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: var(--radius);
  margin: 1rem 0;
}
.markdown-body :deep(pre) {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow-x: auto;
  margin: 1rem 0;
  background: var(--surface);
}
.markdown-body :deep(pre code.hljs) {
  border-radius: var(--radius);
}
.markdown-body :deep(code) {
  font-family: var(--mono);
  font-size: 0.9em;
}
.markdown-body :deep(p code),
.markdown-body :deep(li code) {
  background: var(--surface2);
  padding: 0.1em 0.3em;
  border-radius: 4px;
}
.markdown-body :deep(blockquote) {
  margin: 1rem 0;
  padding: 0.1rem 0.9rem;
  border-left: 2px solid var(--border);
  color: var(--muted);
}
.markdown-body :deep(a) {
  color: var(--text);
  border-bottom: 1px solid var(--border);
}

.actions {
  display: flex;
  gap: 0.5rem;
  margin: 2rem 0 0;
  padding-top: 1.2rem;
  border-top: 1px solid var(--border);
}
.icon-action {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  font-size: 0.85rem;
  min-height: 0;
}
.icon-action:hover {
  color: var(--text);
  background: var(--surface);
}

.comments {
  margin-top: 2.5rem;
}
.comments h2 {
  font-size: 1rem;
  font-weight: 500;
  color: var(--muted);
  margin-bottom: 1rem;
  text-transform: lowercase;
}
.comment-form {
  display: grid;
  gap: 0.5rem;
  margin-bottom: 1.2rem;
}
.comment-form button {
  justify-self: end;
}
.comment-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 1.2rem;
}
.comment-list p {
  margin: 0.3rem 0;
}
.small {
  font-size: 0.8rem;
}
.comment-actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 0.3rem;
}
.link-btn {
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 0;
  min-height: 0;
  font-size: 0.8rem;
  text-transform: lowercase;
}
.link-btn:hover {
  color: var(--text);
  background: transparent;
}
</style>
