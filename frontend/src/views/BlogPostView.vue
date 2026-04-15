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
import { useAuthStore } from "../stores/auth";
import { renderMarkdown } from "../utils/markdown";
import { addRecentPost, updateRecentPostProgress } from "../utils/recentPosts";

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
    err.value = e instanceof Error ? e.message : "Ошибка";
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
    err.value = e instanceof Error ? e.message : "Ошибка";
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
    err.value = e instanceof Error ? e.message : "Ошибка";
  } finally {
    working.value = false;
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
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

async function removeComment(id: string) {
  if (!auth.token || !post.value) return;
  try {
    await deleteComment(id, auth.token);
    comments.value = await listComments(post.value.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

async function sendPostReport() {
  if (!auth.token || !post.value) return;
  const reason = prompt("Причина жалобы:");
  if (!reason) return;
  try {
    await reportPost(post.value.id, auth.token, reason);
    alert("Жалоба отправлена");
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

async function sendCommentReport(commentId: string) {
  if (!auth.token) return;
  const reason = prompt("Причина жалобы:");
  if (!reason) return;
  try {
    await reportComment(commentId, auth.token, reason);
    alert("Жалоба отправлена");
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
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
  <article v-if="post" class="card">
    <h1>{{ post.title }}</h1>
    <p class="muted">
      <RouterLink :to="`/u/${post.author_nickname}`">{{ post.author_nickname }}</RouterLink>
      · {{ (post.published_at || post.created_at).slice(0, 16).replace("T", " ") }}
    </p>
    <div style="margin: 0.75rem 0; display: flex; gap: 0.5rem; flex-wrap: wrap">
      <span v-for="t in post.tags" :key="t" class="badge">#{{ t }}</span>
      <span v-for="c in post.categories" :key="`cat-${c}`" class="badge">{{ c }}</span>
    </div>
    <img
      v-if="post.cover_image_url"
      :src="post.cover_image_url"
      alt=""
      style="width: 100%; border-radius: 10px; border: 1px solid var(--border); margin: 0.75rem 0"
    />
    <div class="markdown-body" style="margin-top: 1rem" v-html="renderedBody" />

    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 1rem">
      <button
        v-if="auth.token"
        class="secondary"
        type="button"
        @click="toggleLike"
      >
        <AppIcon :name="myState.liked ? 'liked' : 'like'" /> <span>Лайк ({{ post.like_count }})</span>
      </button>
      <button
        v-if="auth.token"
        class="secondary"
        type="button"
        @click="toggleBookmark"
      >
        <AppIcon :name="myState.bookmarked ? 'bookmarked' : 'bookmark'" />
        <span>{{ myState.bookmarked ? "В закладках" : "В закладки" }} ({{ post.bookmark_count }})</span>
      </button>
      <RouterLink
        v-if="myState.can_edit"
        :to="`/blog/${post.id}/edit`"
        class="btn secondary"
      >
        <AppIcon name="edit" /> <span>Редактировать</span>
      </RouterLink>
      <button v-if="auth.token" class="secondary" type="button" @click="sendPostReport">
        <AppIcon name="report" /> <span>Пожаловаться</span>
      </button>
    </div>

    <h2 style="margin-top: 1.5rem">Комментарии ({{ comments.length }})</h2>
    <div v-if="auth.token" style="display: grid; gap: 0.5rem; margin-bottom: 1rem">
      <textarea v-model="commentBody" rows="3" placeholder="Комментарий" />
      <button type="button" @click="sendComment"><AppIcon name="send" /> <span>Отправить</span></button>
    </div>
    <p v-else class="muted">
      <RouterLink to="/login">Войдите</RouterLink>, чтобы комментировать.
    </p>
    <div v-for="c in comments" :key="c.id" class="card" style="margin-bottom: 0.5rem">
      <div class="muted">{{ c.author_nickname }} · {{ c.created_at.slice(0, 16).replace("T", " ") }}</div>
      <p style="margin: 0.35rem 0">{{ c.body }}</p>
      <div v-if="auth.token" style="display: flex; gap: 0.5rem">
        <button
          v-if="auth.user?.id === c.user_id || auth.role === 'admin'"
          class="secondary"
          type="button"
          @click="removeComment(c.id)"
        >
          <AppIcon name="delete" /> <span>Удалить</span>
        </button>
        <button class="secondary" type="button" @click="sendCommentReport(c.id)">
          <AppIcon name="report" /> <span>Жалоба</span>
        </button>
      </div>
    </div>
  </article>
  <p v-else-if="err" class="error">{{ err }}</p>
  <p v-else class="muted">Загрузка...</p>
</template>

<style scoped>
.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: 10px;
  border: 1px solid var(--border);
}
.markdown-body :deep(pre) {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow-x: auto;
  margin: 0.75rem 0;
}
.markdown-body :deep(pre code.hljs) {
  border-radius: 8px;
}
.markdown-body :deep(code) {
  font-family: var(--mono);
}
.markdown-body :deep(p code),
.markdown-body :deep(li code) {
  background: var(--surface2);
  padding: 0.12em 0.35em;
  border-radius: 4px;
  border: 1px solid var(--border);
}
.markdown-body :deep(blockquote) {
  margin: 0.75rem 0;
  padding: 0.25rem 0.75rem;
  border-left: 3px solid var(--border);
  color: var(--muted);
}
</style>
