<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import MicroComposer from "../components/MicroComposer.vue";
import AppLoading from "../components/AppLoading.vue";
import MicroItem from "../components/MicroItem.vue";
import { getMicro, type MicroPost } from "../api/micro";
import { useAuthStore } from "../stores/auth";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const post = ref<MicroPost | null>(null);
const replies = ref<MicroPost[]>([]);
const err = ref("");
const loading = ref(false);

const id = computed(() => String(route.params.id || ""));
const isReply = computed(() => !!post.value?.parent_id);

async function load() {
  err.value = "";
  const keepContent = post.value?.id === id.value;
  if (!keepContent) {
    loading.value = true;
    post.value = null;
    replies.value = [];
  }
  try {
    const data = await getMicro(id.value, auth.token);
    post.value = data.post;
    replies.value = data.replies;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    loading.value = false;
  }
}

function onReplyPosted(r: MicroPost) {
  replies.value = [...replies.value, r];
  if (post.value) post.value.reply_count += 1;
}

function onPostDeleted() {
  if (isReply.value && post.value?.parent_id) {
    router.push(`/microblogs/${post.value.parent_id}`);
  } else {
    router.push("/microblogs");
  }
}

function onReplyDeleted(rid: string) {
  replies.value = replies.value.filter((r) => r.id !== rid);
  if (post.value && post.value.reply_count > 0) post.value.reply_count -= 1;
}

function onPostUpdated(updated: MicroPost) {
  post.value = updated;
}

function onReplyUpdated(updated: MicroPost) {
  replies.value = replies.value.map((r) => (r.id === updated.id ? updated : r));
}

onMounted(load);
watch(id, load);
</script>

<template>
  <section class="thread">
    <RouterLink v-if="isReply && post" :to="`/microblogs/${post.parent_id}`" class="back muted small">
      ← к ветке
    </RouterLink>
    <RouterLink v-else to="/microblogs" class="back muted small">← лента</RouterLink>

    <p v-if="err" class="error">{{ err }}</p>
    <AppLoading v-else-if="loading && !post" />

    <template v-else-if="post">
      <MicroItem
        :post="post"
        :connected="auth.token ? true : replies.length > 0"
        @deleted="onPostDeleted"
        @updated="onPostUpdated"
      />

      <MicroComposer
        v-if="auth.token"
        :parent-id="post.id"
        :connected="replies.length > 0"
        placeholder="ответить"
        @posted="onReplyPosted"
      />

      <MicroItem
        v-for="r in replies"
        :key="r.id"
        :post="r"
        clickable
        @deleted="onReplyDeleted"
        @updated="onReplyUpdated"
      />

      <p v-if="!replies.length && !auth.token" class="muted empty">пока нет ответов</p>
    </template>
  </section>
</template>

<style scoped>
.thread {
  max-width: 640px;
  margin: 0 auto;
}
.back {
  display: inline-block;
  margin-bottom: 0.6rem;
}
.empty {
  margin-top: 1.5rem;
  text-align: center;
}
.small {
  font-size: 0.82rem;
}
</style>
