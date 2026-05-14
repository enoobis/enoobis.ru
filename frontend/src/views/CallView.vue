<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { endCallSession, getCallStatus } from "../api/calls";

const route = useRoute();

const slug = computed(() => (typeof route.params.slug === "string" ? route.params.slug : ""));

type Phase = "loading" | "live" | "gone";
const phase = ref<Phase>("loading");
const ending = ref(false);
const meetUrl = ref("");

let pollTimer: ReturnType<typeof setInterval> | null = null;

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPoll() {
  stopPoll();
  pollTimer = setInterval(() => {
    if (phase.value !== "live") return;
    void refresh();
  }, 8000);
}

async function refresh() {
  const s = slug.value;
  if (!s) {
    phase.value = "gone";
    stopPoll();
    meetUrl.value = "";
    return;
  }
  try {
    const data = await getCallStatus(s);
    if (!data.active) {
      phase.value = "gone";
      stopPoll();
      meetUrl.value = "";
      return;
    }
    meetUrl.value = data.meetUrl;
  } catch {
    phase.value = "gone";
    stopPoll();
    meetUrl.value = "";
  }
}

async function boot() {
  phase.value = "loading";
  stopPoll();
  meetUrl.value = "";
  const s = slug.value;
  if (!s) {
    phase.value = "gone";
    return;
  }
  try {
    const data = await getCallStatus(s);
    if (!data.active) {
      phase.value = "gone";
      return;
    }
    meetUrl.value = data.meetUrl;
    phase.value = "live";
  } catch {
    phase.value = "gone";
  }
}

async function endCall() {
  const s = slug.value;
  if (!s || ending.value) return;
  ending.value = true;
  try {
    await endCallSession(s);
  } catch {
    /* */
  } finally {
    phase.value = "gone";
    ending.value = false;
    stopPoll();
    meetUrl.value = "";
  }
}

onMounted(() => {
  void (async () => {
    await boot();
    if (phase.value === "live") startPoll();
  })();
});

onUnmounted(() => {
  stopPoll();
});

watch(slug, () => {
  void (async () => {
    await boot();
    if (phase.value === "live") startPoll();
  })();
});

const iframeAllow =
  "camera; microphone; fullscreen; display-capture; autoplay; clipboard-write";
</script>

<template>
  <section class="call-page">
    <p v-if="phase === 'loading'" class="muted load">загрузка</p>
    <template v-else-if="phase === 'gone'">
      <p class="gone-msg">эта ссылка недоступна или звонок уже завершён</p>
    </template>
    <template v-else>
      <div class="toolbar">
        <a class="tab small" :href="meetUrl" target="_blank" rel="noopener noreferrer"
          >открыть во вкладке</a
        >
        <button type="button" class="end" :disabled="ending" @click="endCall">завершить звонок</button>
      </div>
      <iframe
        v-if="meetUrl"
        class="meet"
        title="звонок"
        :src="meetUrl"
        :allow="iframeAllow"
      />
      <p v-else class="muted small">нет адреса комнаты</p>
    </template>
  </section>
</template>

<style scoped>
.call-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 0;
  gap: 0;
  box-sizing: border-box;
}
.load {
  margin: 2rem 1rem 0;
  font-size: 0.9rem;
}
.gone-msg {
  margin: 2rem 1rem 0;
  font-size: 0.95rem;
  color: var(--muted);
  text-transform: lowercase;
  max-width: 28rem;
}
.small {
  font-size: 0.85rem;
}
.toolbar {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 0.65rem 1rem;
  border-bottom: 1px solid var(--border);
}
.tab {
  color: var(--muted);
  text-decoration: none;
  text-transform: lowercase;
}
.tab:hover {
  color: var(--text);
}
.meet {
  flex: 1;
  width: 100%;
  min-height: min(70vh, 720px);
  border: 0;
  background: var(--surface);
}
.end {
  border-color: var(--danger);
  color: var(--danger);
  background: transparent;
}
.end:hover:not(:disabled) {
  background: var(--surface2);
  color: var(--danger);
  border-color: var(--danger);
}
</style>
