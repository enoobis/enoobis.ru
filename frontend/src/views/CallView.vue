<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { endCallSession, getCallStatus } from "../api/calls";

type SigJson =
  | { t: "config"; iceServers: RTCIceServer[] }
  | { t: "wait" }
  | { t: "create-offer" }
  | { t: "wait-offer" }
  | { t: "peer-left" }
  | { t: "offer"; sdp: string }
  | { t: "answer"; sdp: string }
  | { t: "ice"; candidate: RTCIceCandidateInit | null };

const route = useRoute();

const slug = computed(() => (typeof route.params.slug === "string" ? route.params.slug : ""));

type Phase = "loading" | "live" | "gone";
const phase = ref<Phase>("loading");
const status = ref("");
const micOn = ref(false);
const ending = ref(false);
const remoteAudioRef = ref<HTMLAudioElement | null>(null);

let pollTimer: ReturnType<typeof setInterval> | null = null;
let sock: WebSocket | null = null;
let pc: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

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

function cleanupMedia() {
  if (localStream) {
    for (const t of localStream.getTracks()) t.stop();
    localStream = null;
  }
  if (pc) {
    pc.close();
    pc = null;
  }
  if (sock) {
    sock.close();
    sock = null;
  }
  const el = remoteAudioRef.value;
  if (el) el.srcObject = null;
}

async function refresh() {
  const s = slug.value;
  if (!s) {
    phase.value = "gone";
    stopPoll();
    cleanupMedia();
    return;
  }
  try {
    const data = await getCallStatus(s);
    if (!data.active) {
      phase.value = "gone";
      stopPoll();
      cleanupMedia();
    }
  } catch {
    phase.value = "gone";
    stopPoll();
    cleanupMedia();
  }
}

function wsCallUrl(): string {
  const u = new URL(window.location.href);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/ws/call";
  u.search = `?slug=${encodeURIComponent(slug.value)}`;
  u.hash = "";
  return u.toString();
}

async function ensurePc(): Promise<RTCPeerConnection> {
  if (pc) return pc;
  const c = new RTCPeerConnection({ iceServers });
  c.ontrack = (ev) => {
    const el = remoteAudioRef.value;
    if (el && ev.streams[0]) {
      el.srcObject = ev.streams[0];
      void el.play().catch(() => {});
    }
  };
  c.onicecandidate = (ev) => {
    if (sock?.readyState === WebSocket.OPEN) {
      const candidate = ev.candidate ? ev.candidate.toJSON() : null;
      sock.send(JSON.stringify({ t: "ice", candidate }));
    }
  };
  pc = c;
  return c;
}

async function ensureLocalAudio() {
  if (!localStream) {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  }
  for (const t of localStream.getAudioTracks()) {
    t.enabled = micOn.value;
  }
  const c = await ensurePc();
  for (const t of localStream.getTracks()) {
    if (!c.getSenders().some((s) => s.track === t)) c.addTrack(t, localStream);
  }
}

function connectSignal() {
  const s = slug.value;
  cleanupMedia();
  sock = new WebSocket(wsCallUrl());
  sock.onmessage = async (ev) => {
    let msg: SigJson;
    try {
      msg = JSON.parse(ev.data as string) as SigJson;
    } catch {
      return;
    }
    if (msg.t === "config") {
      if (msg.iceServers.length) iceServers = msg.iceServers;
      return;
    }
    if (msg.t === "wait") {
      status.value = "ожидание собеседника";
      return;
    }
    if (msg.t === "wait-offer") {
      status.value = "подключение";
      return;
    }
    if (msg.t === "create-offer") {
      status.value = "подключение";
      await ensureLocalAudio();
      const c = await ensurePc();
      const offer = await c.createOffer();
      await c.setLocalDescription(offer);
      sock?.send(JSON.stringify({ t: "offer", sdp: offer.sdp ?? "" }));
      return;
    }
    if (msg.t === "offer") {
      await ensureLocalAudio();
      const c = await ensurePc();
      await c.setRemoteDescription({ type: "offer", sdp: msg.sdp });
      const answer = await c.createAnswer();
      await c.setLocalDescription(answer);
      sock?.send(JSON.stringify({ t: "answer", sdp: answer.sdp ?? "" }));
      return;
    }
    if (msg.t === "answer") {
      const c = await ensurePc();
      await c.setRemoteDescription({ type: "answer", sdp: msg.sdp });
      return;
    }
    if (msg.t === "ice") {
      const c = await ensurePc();
      if (!msg.candidate) return;
      try {
        await c.addIceCandidate(msg.candidate);
      } catch {
        /* игнор дублей ice */
      }
      return;
    }
    if (msg.t === "peer-left") {
      status.value = "собеседник вышел";
      if (pc) {
        pc.close();
        pc = null;
      }
      const el = remoteAudioRef.value;
      if (el) el.srcObject = null;
    }
  };
}

function toggleMic() {
  micOn.value = !micOn.value;
  if (localStream) {
    for (const t of localStream.getAudioTracks()) {
      t.enabled = micOn.value;
    }
  }
}

async function boot() {
  phase.value = "loading";
  status.value = "";
  stopPoll();
  cleanupMedia();
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
    phase.value = "live";
    micOn.value = false;
    connectSignal();
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
    cleanupMedia();
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
  cleanupMedia();
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
      <p v-if="status" class="status muted small">{{ status }}</p>
      <audio ref="remoteAudioRef" class="sr-only" playsinline />
      <div class="row">
        <button type="button" class="secondary" @click="toggleMic">
          {{ micOn ? "выключить микрофон" : "включить микрофон" }}
        </button>
        <button type="button" class="end" :disabled="ending" @click="endCall">завершить звонок</button>
      </div>
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
.status {
  margin: 0;
}
.gone-msg {
  margin: 2rem 0 0;
  font-size: 0.95rem;
  color: var(--muted);
  text-transform: lowercase;
  max-width: 28rem;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
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
