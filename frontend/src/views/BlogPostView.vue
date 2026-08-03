<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import {
  bookmarkPost,
  createComment,
  deleteComment,
  deletePost,
  approveBlogPost,
  getMyPostState,
  getPost,
  listComments,
  recallBlogPost,
  reportComment,
  reportPost,
  setBlogPinned,
  votePost,
  unbookmarkPost,
  type BlogPost,
  type CommentItem,
} from "../api/blog";
import AppIcon from "../components/AppIcon.vue";
import AppLoading from "../components/AppLoading.vue";
import { useAuthStore } from "../stores/auth";
import { renderMarkdown } from "../utils/markdown";
import { addRecentPost, updateRecentPostProgress } from "../utils/recentPosts";
import { toast, toastError, toastSuccess } from "../utils/toast";
import "../styles/post-actions.css";

const ACT = 18;

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const post = ref<BlogPost | null>(null);
const comments = ref<CommentItem[]>([]);
const err = ref("");
const commentBody = ref("");
const working = ref(false);
const myState = ref({
  my_vote: null as 1 | -1 | null,
  bookmarked: false,
  can_edit: false,
  can_delete: false,
});

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
  const keep = post.value?.id === postId.value;
  if (!keep) {
    post.value = null;
    comments.value = [];
  }
  try {
    post.value = await getPost(postId.value, auth.token ?? undefined);
    addRecentPost(post.value);
    if (post.value.status === "published") {
      comments.value = await listComments(postId.value);
    }
    if (auth.token) {
      myState.value = await getMyPostState(postId.value, auth.token);
    } else {
      myState.value = { my_vote: null, bookmarked: false, can_edit: false, can_delete: false };
    }
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

async function softRefreshPost() {
  if (document.visibilityState === "hidden" || !postId.value) return;
  try {
    const [p, c] = await Promise.all([
      getPost(postId.value, auth.token ?? undefined),
      post.value?.status === "published" ? listComments(postId.value) : Promise.resolve([] as CommentItem[]),
    ]);
    post.value = p;
    comments.value = p.status === "published" ? c : [];
    addRecentPost(p);
    if (auth.token) {
      myState.value = await getMyPostState(postId.value, auth.token);
    } else {
      myState.value = { my_vote: null, bookmarked: false, can_edit: false, can_delete: false };
    }
  } catch {
  }
}

function onPostVisibility() {
  if (document.visibilityState === "visible") void softRefreshPost();
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

const isAuthor = computed(() => !!post.value && auth.user?.id === post.value.author_id);
const isPending = computed(() => post.value?.status === "pending");
const isRecalled = computed(() => post.value?.status === "recalled");
const isPublished = computed(() => post.value?.status === "published");
const needsReview = computed(() => isPending.value || isRecalled.value);

async function castVote(vote: 1 | -1) {
  if (!auth.token || !post.value || working.value || isAuthor.value) return;
  working.value = true;
  try {
    const res = await votePost(post.value.id, auth.token, vote);
    post.value = { ...post.value, up_count: res.up_count, down_count: res.down_count, my_vote: res.my_vote };
    myState.value = { ...myState.value, my_vote: res.my_vote };
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

function goBack() {
  if (window.history.state?.back) {
    router.back();
  } else {
    router.push({ name: "blog" });
  }
}

async function removePost() {
  if (!auth.token || !post.value || working.value) return;
  if (!window.confirm("удалить этот пост?")) return;
  working.value = true;
  try {
    await deletePost(post.value.id, auth.token);
    await router.replace({ name: "blog" });
  } catch (e) {
    toastError(e);
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

async function approvePost() {
  if (!auth.token || !post.value || working.value || auth.role !== "admin") return;
  if (!needsReview.value) return;
  working.value = true;
  try {
    await approveBlogPost(post.value.id, auth.token);
    await load();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    working.value = false;
  }
}

async function recallPost() {
  if (!auth.token || !post.value || working.value || auth.role !== "admin" || !isPublished.value) return;
  if (!confirm("отозвать пост?")) return;
  working.value = true;
  try {
    await recallBlogPost(post.value.id, auth.token);
    await load();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    working.value = false;
  }
}

async function togglePin() {
  if (!auth.token || !post.value || working.value || auth.role !== "admin" || !isPublished.value) return;
  working.value = true;
  try {
    const next = !post.value.is_pinned;
    const res = await setBlogPinned(post.value.id, next, auth.token);
    post.value = { ...post.value, is_pinned: res.is_pinned };
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    working.value = false;
  }
}

onMounted(() => {
  window.addEventListener("scroll", persistProgress, { passive: true });
  document.addEventListener("visibilitychange", onPostVisibility);
  load();
});
onUnmounted(() => {
  persistProgress();
  window.removeEventListener("scroll", persistProgress);
  document.removeEventListener("visibilitychange", onPostVisibility);
});
watch(() => route.params.id, load);
</script>

<template>
  <article v-if="post" class="post">
    <div class="post-actions post-actions--top post-actions--lg">
      <button class="act" type="button" aria-label="назад" title="назад" @click="goBack">
        <AppIcon name="back" :size="ACT" />
      </button>
      <button
        v-if="auth.token && isPublished"
        class="act"
        type="button"
        :class="{ on: myState.bookmarked }"
        :title="myState.bookmarked ? 'убрать из закладок' : 'в закладки'"
        @click="toggleBookmark"
      >
        <AppIcon :name="myState.bookmarked ? 'bookmarked' : 'bookmark'" :size="ACT" />
      </button>
      <div v-if="auth.token && isPublished && !isAuthor" class="votes">
        <button class="act" type="button" :class="{ on: myState.my_vote === 1 }" title="вверх" @click="castVote(1)">
          <AppIcon name="voteUp" :size="ACT" />
        </button>
        <span v-if="post.up_count || post.down_count" class="vote-score">
          <span v-if="post.up_count">{{ post.up_count }}</span>
          <span v-if="post.up_count && post.down_count" class="vote-sep">·</span>
          <span v-if="post.down_count">{{ post.down_count }}</span>
        </span>
        <button class="act" type="button" :class="{ on: myState.my_vote === -1 }" title="вниз" @click="castVote(-1)">
          <AppIcon name="voteDown" :size="ACT" />
        </button>
      </div>
      <span v-else-if="isPublished && (post.up_count || post.down_count)" class="votes votes-readonly">
        <span class="act" aria-hidden="true"><AppIcon name="voteUp" :size="ACT" /></span>
        <span class="vote-score">
          <span v-if="post.up_count">{{ post.up_count }}</span>
          <span v-if="post.up_count && post.down_count" class="vote-sep">·</span>
          <span v-if="post.down_count">{{ post.down_count }}</span>
        </span>
        <span class="act" aria-hidden="true"><AppIcon name="voteDown" :size="ACT" /></span>
      </span>
      <span class="post-actions-gap" aria-hidden="true" />
      <button v-if="isPublished" class="act" type="button" title="поделиться" @click="sharePost">
        <AppIcon name="send" :size="ACT" />
      </button>
      <button
        v-if="auth.role === 'admin' && isPublished"
        class="act"
        type="button"
        :class="{ on: post.is_pinned }"
        :title="post.is_pinned ? 'снять закреп' : 'закрепить'"
        :disabled="working"
        @click="togglePin"
      >
        <AppIcon name="pinned" :size="ACT" />
      </button>
      <button
        v-if="auth.role === 'admin' && isPublished"
        class="act"
        type="button"
        title="отозвать"
        :disabled="working"
        @click="recallPost"
      >
        <AppIcon name="recall" :size="ACT" />
      </button>
      <RouterLink v-if="myState.can_edit" :to="`/blogs/${post.id}/edit`" class="act" title="редактировать">
        <AppIcon name="edit" :size="ACT" />
      </RouterLink>
      <button v-if="myState.can_delete" class="act danger" type="button" title="удалить" :disabled="working" @click="removePost">
        <AppIcon name="delete" :size="ACT" />
      </button>
      <button v-if="auth.token && isPublished && !isAuthor" class="act" type="button" title="пожаловаться" @click="sendPostReport">
        <AppIcon name="report" :size="ACT" />
      </button>
    </div>

    <p v-if="isPending" class="pending-note">
      <span class="muted">на модерации</span>
      <button
        v-if="auth.role === 'admin'"
        type="button"
        class="pending-approve"
        :disabled="working"
        @click="approvePost"
      >
        одобрить
      </button>
    </p>
    <p v-else-if="isRecalled" class="pending-note">
      <span class="muted">отозван администратором</span>
      <button
        v-if="auth.role === 'admin'"
        type="button"
        class="pending-approve"
        :disabled="working"
        @click="approvePost"
      >
        одобрить
      </button>
    </p>
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

    <section v-if="isPublished" class="comments">
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
            <button
              v-if="auth.user?.id !== c.user_id"
              class="link-btn"
              type="button"
              @click="sendCommentReport(c.id)"
            >
              жалоба
            </button>
          </div>
        </li>
      </ul>
    </section>
  </article>
  <p v-else-if="err" class="error">{{ err }}</p>
  <AppLoading v-else />
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
.pending-note {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
}
.pending-approve {
  padding: 0.2rem 0.55rem;
  min-height: 28px;
  font-size: 0.85rem;
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

.post-actions--top {
  flex-wrap: wrap;
  margin: 0 0 1rem;
  padding: 0;
  border: none;
}
.post-actions-gap {
  flex: 1;
  min-width: 0.5rem;
}
@media (max-width: 640px) {
  .post-actions-gap {
    flex-basis: 100%;
    height: 0;
    min-width: 0;
  }
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
