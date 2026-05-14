<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { endCallSession, getCallStatus } from "../api/calls";

const route = useRoute();

const slug = computed(() => (typeof route.params.slug === "string" ? route.params.slug : ""));

type Phase = "loading" | "live" | "gone";
const phase = ref<Phase>("loading");
const iframeSrc = ref("");
const ending = ref(false);

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
    if (phase.value === "live") void refresh();
  }, 4000);
}

function jitsiVoiceUrl(meetBase: string, room: string): string {
  const base = meetBase.replace(/\/+$/, "");
  const roomEnc = encodeURIComponent(room);
  const hash = [
    "config.startAudioOnly=true",
    "config.startWithAudioMuted=true",
    "config.prejoinPageEnabled=false",
    "config.requireDisplayName=false",
    "config.desktopSharingEnabled=false",
    "interfaceConfig.MOBILE_APP_PROMO=false",
  ].join("&");
  return `${base}/${roomEnc}#${hash}`;
}

async function refresh() {
  const s = slug.value;
  if (!s) {
    phase.value = "gone";
    iframeSrc.value = "";
    stopPoll();
    return;
  }
  try {
    const data = await getCallStatus(s);
    if (!data.active) {
      phase.value = "gone";
      iframeSrc.value = "";
      stopPoll();
      return;
    }
    phase.value = "live";
    iframeSrc.value = jitsiVoiceUrl(data.meet_base, data.jitsi_room);
  } catch {
    phase.value = "gone";
    iframeSrc.value = "";
    stopPoll();
  }
}

async function boot() {
  phase.value = "loading";
  iframeSrc.value = "";
  stopPoll();
  await refresh();
}

async function endCall() {
  const s = slug.value;
  if (!s || ending.value) return;
  ending.value = true;
  try {
    await endCallSession(s);
  } catch {
    /* ссылка всё равно считается закрытой локально */
  } finally {
    phase.value = "gone";
    iframeSrc.value = "";
    ending.value = false;
    stopPoll();
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
</script>

<template>
  <section class="call-page">
    <p v-if="phase === 'loading'" class="muted load">загрузка</p>
    <template v-else-if="phase === 'gone'">
      <p class="gone-msg">эта ссылка недоступна или звонок уже завершён</p>
    </template>
    <template v-else>
      <div class="frame-shell">
        <iframe
          v-if="iframeSrc"
          :src="iframeSrc"
          class="frame"
          title="голос"
          allow="microphone; autoplay"
        />
      </div>
      <button type="button" class="end" :disabled="ending" @click="endCall">завершить звонок</button>
    </template>
  </section>
</template>

<style scoped>
.call-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  gap: 0.75rem;
  box-sizing: border-box;
}
.load {
  margin: 2rem 0 0;
  font-size: 0.9rem;
}
.gone-msg {
  margin: 2rem 0 0;
  font-size: 0.95rem;
  color: var(--muted);
  text-transform: lowercase;
  max-width: 28rem;
}
.frame-shell {
  flex: 0 0 auto;
  height: min(42vh, 340px);
  max-height: 50vh;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--surface);
}
.frame {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}
.end {
  align-self: flex-start;
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
