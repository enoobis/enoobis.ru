<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import QRCode from "qrcode";
import { claimQrCode, extractQrCode, issueQrCode, qrLoginUrl } from "../api/qrAuth";
import { useAuthStore } from "../stores/auth";

type Tab = "show" | "scan";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const tab = ref<Tab>("show");
const err = ref("");
const ok = ref("");
const qrDataUrl = ref("");
const expiresIn = ref(0);
const issuing = ref(false);
const claiming = ref(false);
const scanRaw = ref("");
const videoEl = ref<HTMLVideoElement | null>(null);

let expireTimer: ReturnType<typeof setInterval> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let scanLoop: ReturnType<typeof setInterval> | null = null;
let mediaStream: MediaStream | null = null;

function clearTimers() {
  if (expireTimer) {
    clearInterval(expireTimer);
    expireTimer = null;
  }
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

function stopCamera() {
  if (scanLoop) {
    clearInterval(scanLoop);
    scanLoop = null;
  }
  if (mediaStream) {
    for (const t of mediaStream.getTracks()) t.stop();
    mediaStream = null;
  }
}

function describeErr(code: string) {
  if (code === "invalid_code") return "неверный или устаревший код";
  if (code === "code_expired") return "код истёк — обновите qr на другом устройстве";
  if (code === "code_used") return "код уже использован";
  if (code === "forbidden") return "аккаунт недоступен";
  return code || "ошибка";
}

async function refreshQr() {
  if (!auth.token) {
    err.value = "войдите, чтобы показать qr";
    return;
  }
  issuing.value = true;
  err.value = "";
  ok.value = "";
  try {
    const r = await issueQrCode(auth.token);
    const url = qrLoginUrl(r.code);
    qrDataUrl.value = await QRCode.toDataURL(url, {
      width: 220,
      margin: 1,
      color: { dark: "#fafafa", light: "#141414" },
    });
    expiresIn.value = r.expires_in;
    clearTimers();
    expireTimer = setInterval(() => {
      expiresIn.value = Math.max(0, expiresIn.value - 1);
    }, 1000);
    refreshTimer = setTimeout(() => {
      if (tab.value === "show") void refreshQr();
    }, r.expires_in * 1000);
  } catch (e) {
    err.value = describeErr(e instanceof Error ? e.message : "ошибка");
    qrDataUrl.value = "";
  } finally {
    issuing.value = false;
  }
}

async function claim(codeInput: string) {
  const code = extractQrCode(codeInput);
  if (!code) {
    err.value = "вставьте ссылку или код из qr";
    return;
  }
  claiming.value = true;
  err.value = "";
  ok.value = "";
  try {
    const r = await claimQrCode(code);
    auth.applySession(r.token, r.user);
    ok.value = `вошли как @${r.user.nickname}`;
    stopCamera();
    await router.push("/microblogs");
  } catch (e) {
    err.value = describeErr(e instanceof Error ? e.message : "ошибка");
  } finally {
    claiming.value = false;
  }
}

async function startCamera() {
  stopCamera();
  err.value = "";
  const Detector = (window as unknown as { BarcodeDetector?: typeof BarcodeDetector })
    .BarcodeDetector;
  if (!Detector || !navigator.mediaDevices?.getUserMedia) {
    return;
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    if (videoEl.value) {
      videoEl.value.srcObject = mediaStream;
      await videoEl.value.play();
    }
    const detector = new Detector({ formats: ["qr_code"] });
    scanLoop = setInterval(async () => {
      if (!videoEl.value || claiming.value) return;
      try {
        const hits = await detector.detect(videoEl.value);
        const raw = hits[0]?.rawValue;
        if (raw) await claim(raw);
      } catch {
        /* ignore frame errors */
      }
    }, 700);
  } catch {
    err.value = "камера недоступна — вставьте ссылку вручную";
  }
}

watch(tab, (t) => {
  err.value = "";
  ok.value = "";
  if (t === "show") {
    stopCamera();
    void refreshQr();
  } else {
    clearTimers();
    qrDataUrl.value = "";
    void startCamera();
  }
});

onMounted(() => {
  const fromUrl = String(route.query.code ?? "");
  if (fromUrl) {
    tab.value = "scan";
    scanRaw.value = fromUrl;
    void claim(fromUrl);
    return;
  }
  if (auth.token) {
    tab.value = "show";
    void refreshQr();
  } else {
    tab.value = "scan";
    void startCamera();
  }
});

onBeforeUnmount(() => {
  clearTimers();
  stopCamera();
});
</script>

<template>
  <section class="qr-page card">
    <h1>вход по qr</h1>
    <p class="muted lead">
      покажите qr на одном устройстве — отсканируйте на другом. работает в обе стороны.
    </p>

    <div class="tabs" role="tablist">
      <button
        type="button"
        class="tab"
        :class="{ on: tab === 'show' }"
        :disabled="!auth.token"
        @click="tab = 'show'"
      >
        показать qr
      </button>
      <button type="button" class="tab" :class="{ on: tab === 'scan' }" @click="tab = 'scan'">
        сканировать
      </button>
    </div>

    <p v-if="!auth.token && tab === 'show'" class="muted hint">
      чтобы показать qr, сначала <RouterLink to="/login">войдите</RouterLink> на этом устройстве.
    </p>

    <div v-if="tab === 'show'" class="show-pane">
      <div v-if="qrDataUrl" class="qr-wrap">
        <img :src="qrDataUrl" width="220" height="220" alt="qr для входа" />
        <p class="muted timer">{{ expiresIn }} сек</p>
      </div>
      <p v-else-if="issuing" class="muted">создаём код…</p>
      <button type="button" class="ghost" :disabled="issuing || !auth.token" @click="refreshQr">
        обновить
      </button>
    </div>

    <div v-else class="scan-pane">
      <video ref="videoEl" class="scan-video" playsinline muted />
      <label class="scan-label">
        или вставьте ссылку / код
        <textarea v-model="scanRaw" rows="3" placeholder="https://…/auth/qr?code=…" />
      </label>
      <button type="button" :disabled="claiming" @click="claim(scanRaw)">
        {{ claiming ? "вход…" : "войти на этом устройстве" }}
      </button>
    </div>

    <p v-if="err" class="error">{{ err }}</p>
    <p v-if="ok" class="ok">{{ ok }}</p>
  </section>
</template>

<style scoped>
.qr-page {
  max-width: 24rem;
  margin: 2rem auto;
  padding: 1.25rem;
}

h1 {
  font-size: 1.25rem;
  margin: 0 0 0.35rem;
  text-transform: lowercase;
}

.lead {
  margin: 0 0 1rem;
  font-size: 0.875rem;
  line-height: 1.45;
}

.tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
  margin-bottom: 1rem;
}

.tab {
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--line, #333);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}

.tab.on {
  border-color: var(--accent, #a78bfa);
  color: var(--accent, #a78bfa);
}

.tab:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.show-pane,
.scan-pane {
  display: grid;
  gap: 0.75rem;
}

.qr-wrap {
  display: grid;
  justify-items: center;
  gap: 0.35rem;
}

.qr-wrap img {
  border-radius: 8px;
  background: #141414;
}

.timer {
  font-size: 0.8125rem;
}

.scan-video {
  width: 100%;
  max-height: 220px;
  border-radius: 8px;
  background: #111;
  object-fit: cover;
}

.scan-label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.8125rem;
  color: var(--muted, #737373);
}

textarea {
  width: 100%;
  resize: vertical;
  min-height: 4.5rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--line, #333);
  border-radius: 8px;
  background: #111;
  color: inherit;
  font: inherit;
}

button:not(.tab):not(.ghost) {
  width: 100%;
  padding: 0.65rem 1rem;
  border: 1px solid var(--line, #404040);
  border-radius: 8px;
  background: #1a1a1a;
  color: inherit;
  cursor: pointer;
}

.ghost {
  justify-self: start;
  padding: 0.4rem 0;
  border: none;
  background: transparent;
  color: var(--muted, #737373);
  cursor: pointer;
  font-size: 0.8125rem;
}

.hint {
  font-size: 0.8125rem;
  margin-bottom: 0.75rem;
}

.error {
  color: #f87171;
  font-size: 0.875rem;
  margin: 0.75rem 0 0;
}

.ok {
  color: #86efac;
  font-size: 0.875rem;
  margin: 0.75rem 0 0;
}
</style>
