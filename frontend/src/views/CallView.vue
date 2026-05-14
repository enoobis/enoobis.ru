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
const micOn = ref(false);
const ending = ref(false);
const remoteAudioRef = ref<HTMLAudioElement | null>(null);

/** без жеста (клика) getUserMedia часто блокируют — системный запрос не появляется */
const audioPrimed = ref(false);
/** websocket к комнате: не путать с голосом (это ice/pc) */
type WsState = "idle" | "connecting" | "open" | "closed";
const wsState = ref<WsState>("idle");
const wsCloseReason = ref<"none" | "room_full" | "other">("none");
const peerPresence = ref<"alone" | "together" | "gone">("alone");
const mediaLink = ref<"off" | "connecting" | "on">("off");
const micReady = ref(false);
const micDenied = ref(false);

let pollTimer: ReturnType<typeof setInterval> | null = null;
let sock: WebSocket | null = null;
let pc: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

let needCreateOffer = false;
let pendingOfferSdp: string | null = null;
const iceBuffer: RTCIceCandidateInit[] = [];

function resetNegotiationQueue() {
  needCreateOffer = false;
  pendingOfferSdp = null;
  iceBuffer.length = 0;
}

const peerLabel = computed(() => {
  if (peerPresence.value === "gone") return "вышел из звонка";
  if (wsState.value !== "open") return "ждём комнату…";
  if (peerPresence.value === "alone") return "ещё не зашёл";
  if (mediaLink.value === "on") return "есть, слышно";
  if (mediaLink.value === "connecting") return "звонок цепляется…";
  return "в комнате";
});

const peerDotOn = computed(
  () => peerPresence.value === "together" && mediaLink.value === "on",
);

const peerDotWarn = computed(() => peerPresence.value === "gone");

const selfRoomLine = computed(() => {
  if (wsCloseReason.value === "room_full") return "уже двое — нужна новая ссылка";
  if (wsState.value === "open") return "в комнате";
  if (wsState.value === "connecting") return "заходим в комнату…";
  return "не вышло зайти в комнату — обнови страницу";
});

const micHint = computed(() => {
  if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    return "лучше https — иначе запрос микрофона может не появиться";
  }
  if (micDenied.value) return "браузер заблокировал микрофон — значок слева от адреса → разрешить";
  if (!audioPrimed.value) {
    return "нажми ниже: откроется обычный запрос браузера у адресной строки";
  }
  if (!micReady.value) return "микрофон не готов";
  if (micOn.value) return "микрофон вкл";
  return "микрофон выкл";
});

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

function syncMediaLink() {
  if (!pc) {
    mediaLink.value = "off";
    return;
  }
  const s = pc.connectionState;
  const ice = pc.iceConnectionState;
  if (s === "connected" || ice === "connected" || ice === "completed") {
    mediaLink.value = "on";
    return;
  }
  if (
    s === "connecting" ||
    ice === "checking" ||
    (s === "new" && peerPresence.value === "together")
  ) {
    mediaLink.value = "connecting";
    return;
  }
  if (s === "disconnected" || s === "failed") {
    mediaLink.value = peerPresence.value === "together" ? "connecting" : "off";
    return;
  }
  if (s === "closed") {
    mediaLink.value = "off";
    return;
  }
  mediaLink.value = peerPresence.value === "together" ? "connecting" : "off";
}

function resetPresence() {
  wsState.value = "idle";
  wsCloseReason.value = "none";
  peerPresence.value = "alone";
  mediaLink.value = "off";
  micReady.value = false;
  micDenied.value = false;
  audioPrimed.value = false;
  resetNegotiationQueue();
}

function cleanupMedia() {
  resetPresence();
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

async function flushIceBuffer() {
  const c = pc;
  if (!c?.remoteDescription) return;
  const copy = [...iceBuffer];
  iceBuffer.length = 0;
  for (const cand of copy) {
    try {
      await c.addIceCandidate(cand);
    } catch {
      /* дубль или порядок */
    }
  }
}

async function addIceOrBuffer(c: RTCPeerConnection, cand: RTCIceCandidateInit) {
  if (!c.remoteDescription) {
    iceBuffer.push(cand);
    return;
  }
  try {
    await c.addIceCandidate(cand);
  } catch {
    /* */
  }
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
    syncMediaLink();
  };
  c.onicecandidate = (ev) => {
    if (sock?.readyState === WebSocket.OPEN) {
      const candidate = ev.candidate ? ev.candidate.toJSON() : null;
      sock.send(JSON.stringify({ t: "ice", candidate }));
    }
  };
  c.onconnectionstatechange = () => syncMediaLink();
  c.oniceconnectionstatechange = () => syncMediaLink();
  pc = c;
  syncMediaLink();
  return c;
}

function attachLocalTracks() {
  if (!localStream || !pc) return;
  for (const t of localStream.getTracks()) {
    if (!pc.getSenders().some((s) => s.track === t)) pc.addTrack(t, localStream);
  }
}

async function runCreateOfferFlow() {
  if (!localStream) return;
  const c = await ensurePc();
  attachLocalTracks();
  const offer = await c.createOffer();
  await c.setLocalDescription(offer);
  sock?.send(JSON.stringify({ t: "offer", sdp: offer.sdp ?? "" }));
}

async function runAnswerFlow(offerSdp: string) {
  if (!localStream) return;
  const c = await ensurePc();
  attachLocalTracks();
  await c.setRemoteDescription({ type: "offer", sdp: offerSdp });
  await flushIceBuffer();
  const answer = await c.createAnswer();
  await c.setLocalDescription(answer);
  sock?.send(JSON.stringify({ t: "answer", sdp: answer.sdp ?? "" }));
}

async function flushNegotiationIfReady() {
  if (!audioPrimed.value || !localStream) return;
  if (needCreateOffer) {
    needCreateOffer = false;
    await runCreateOfferFlow();
  }
  if (pendingOfferSdp !== null) {
    const sdp = pendingOfferSdp;
    pendingOfferSdp = null;
    await runAnswerFlow(sdp);
  }
}

async function onPrimeAudio() {
  micDenied.value = false;
  if (!navigator.mediaDevices?.getUserMedia) {
    micDenied.value = true;
    return;
  }
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    for (const t of localStream.getAudioTracks()) {
      t.enabled = micOn.value;
    }
    micReady.value = true;
    audioPrimed.value = true;
    await flushNegotiationIfReady();
  } catch {
    micDenied.value = true;
    micReady.value = false;
    audioPrimed.value = false;
    if (localStream) {
      for (const t of localStream.getTracks()) t.stop();
      localStream = null;
    }
  }
}

function connectSignal() {
  cleanupMedia();
  micOn.value = false;
  wsState.value = "connecting";
  wsCloseReason.value = "none";
  sock = new WebSocket(wsCallUrl());
  sock.onopen = () => {
    wsState.value = "open";
  };
  sock.onclose = (ev) => {
    wsState.value = "closed";
    wsCloseReason.value = ev.code === 4001 ? "room_full" : "other";
  };
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
      peerPresence.value = "alone";
      mediaLink.value = "off";
      return;
    }
    if (msg.t === "wait-offer" || msg.t === "create-offer") {
      peerPresence.value = "together";
      syncMediaLink();
    }
    if (msg.t === "create-offer") {
      if (!audioPrimed.value || !localStream) {
        needCreateOffer = true;
        return;
      }
      await runCreateOfferFlow();
      return;
    }
    if (msg.t === "offer") {
      if (!audioPrimed.value || !localStream) {
        pendingOfferSdp = msg.sdp;
        return;
      }
      await runAnswerFlow(msg.sdp);
      return;
    }
    if (msg.t === "answer") {
      const c = await ensurePc();
      await c.setRemoteDescription({ type: "answer", sdp: msg.sdp });
      await flushIceBuffer();
      return;
    }
    if (msg.t === "ice") {
      if (!msg.candidate) return;
      const c = await ensurePc();
      await addIceOrBuffer(c, msg.candidate);
      return;
    }
    if (msg.t === "peer-left") {
      peerPresence.value = "gone";
      mediaLink.value = "off";
      resetNegotiationQueue();
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
      <ul class="participants" aria-label="участники">
        <li class="participant">
          <span class="dot" :class="{ on: wsState === 'open' }" aria-hidden="true" />
          <span class="who">ты</span>
          <span class="detail small" :class="{ muted: wsState !== 'open' }">{{ selfRoomLine }}</span>
        </li>
        <li class="participant">
          <span
            class="dot"
            :class="{ on: peerDotOn, warn: peerDotWarn }"
            aria-hidden="true"
          />
          <span class="who">собеседник</span>
          <span class="detail small" :class="{ muted: !peerDotOn && !peerDotWarn }">{{ peerLabel }}</span>
        </li>
      </ul>
      <p class="mic-hint small">{{ micHint }}</p>
      <button v-if="!audioPrimed" type="button" class="prime" @click="onPrimeAudio">
        {{ micDenied ? "попробовать снова" : "запросить микрофон" }}
      </button>
      <audio ref="remoteAudioRef" class="sr-only" playsinline />
      <div v-if="audioPrimed" class="row">
        <button type="button" class="secondary" @click="toggleMic">
          {{ micOn ? "выключить микрофон" : "включить микрофон" }}
        </button>
        <button type="button" class="end" :disabled="ending" @click="endCall">завершить звонок</button>
      </div>
      <button
        v-else
        type="button"
        class="end ghost-end"
        :disabled="ending"
        @click="endCall"
      >
        завершить звонок
      </button>
    </template>
  </section>
</template>

<style scoped>
.call-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  gap: 0.85rem;
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
.participants {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  max-width: 22rem;
}
.participant {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: 0.5rem;
  align-items: center;
}
.participant .dot {
  grid-row: 1 / -1;
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--border);
  flex-shrink: 0;
}
.dot.on {
  background: var(--text);
}
.dot.warn {
  background: var(--danger);
}
.who {
  grid-column: 2;
  grid-row: 1;
  font-size: 0.88rem;
  color: var(--text);
  text-transform: lowercase;
}
.detail {
  grid-column: 2;
  grid-row: 2;
  text-transform: lowercase;
  color: var(--text);
}
.detail.muted {
  color: var(--muted);
}
.mic-hint {
  margin: 0;
  color: var(--muted);
  max-width: 24rem;
  line-height: 1.4;
  text-transform: lowercase;
}
.prime {
  align-self: flex-start;
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
.ghost-end {
  align-self: flex-start;
  background: transparent;
  border-color: var(--border);
  color: var(--muted);
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
