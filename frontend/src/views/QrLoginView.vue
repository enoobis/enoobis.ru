<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import QRCode from "qrcode";
import { claimQrCode, extractQrCode, issueQrCode, qrLoginUrl } from "../api/qrAuth";
import { useQrScanDevice } from "../composables/useQrScanDevice";
import { useAuthStore } from "../stores/auth";

type Tab = "show" | "scan";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const { canScanQr } = useQrScanDevice();

const tab = ref<Tab>("show");
const err = ref("");
const ok = ref("");
const qrDataUrl = ref("");
const expiresIn = ref(0);
const issuing = ref(false);
const claiming = ref(false);
const scanRaw = ref("");
const videoEl = ref<HTMLVideoElement | null>(null);

const leadText = computed(() =>
  canScanQr.value
    ? "покажите qr на одном устройстве — отсканируйте на другом. работает в обе стороны."
    : "покажите qr и отсканируйте с телефона.",
);

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
  if (!canScanQr.value) {
    err.value = "откройте ссылку с телефона";
    return;
  }
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
  if (!canScanQr.value) return;
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

watch(canScanQr, (can) => {
  if (!can) {
    tab.value = "show";
    stopCamera();
  }
});

watch(tab, (t) => {
  err.value = "";
  ok.value = "";
  if (t === "show") {
    stopCamera();
    void refreshQr();
  } else if (canScanQr.value) {
    clearTimers();
    qrDataUrl.value = "";
    void startCamera();
  }
});

onMounted(() => {
  const fromUrl = String(route.query.code ?? "");
  if (fromUrl) {
    if (!canScanQr.value) {
      err.value = "откройте ссылку с телефона";
      tab.value = "show";
      return;
    }
    tab.value = "scan";
    scanRaw.value = fromUrl;
    void claim(fromUrl);
    return;
  }
  if (auth.token) {
    tab.value = "show";
    void refreshQr();
  } else if (canScanQr.value) {
    tab.value = "scan";
    void startCamera();
  } else {
    tab.value = "show";
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
    <p class="muted lead">{{ leadText }}</p>

    <div v-if="canScanQr" class="tabs" role="tablist">
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

    <p v-if="!canScanQr && !auth.token" class="muted hint">
      сканирование только с телефона. <RouterLink to="/login">войти</RouterLink>
    </p>

    <p v-else-if="!auth.token && tab === 'show'" class="muted hint">
      чтобы показать qr, сначала <RouterLink to="/login">войдите</RouterLink> на этом устройстве.
    </p>

    <div v-if="tab === 'show'" class="show-pane">
      <div v-if="qrDataUrl" class="qr-wrap">
        <img :src="qrDataUrl" width="220" height="220" alt="qr для входа" />
        <p class="muted timer">{{ expiresIn }} сек</p>
      </div>
      <p v-else-if="issuing" class="muted">создаём код…</p>
      <button type="button" class="secondary ghost" :disabled="issuing || !auth.token" @click="refreshQr">
        обновить
      </button>
    </div>

    <div v-else-if="canScanQr" class="scan-pane">
      <video ref="videoEl" class="scan-video" playsinline muted />
      <label class="scan-label">
        или вставьте ссылку / код
        <textarea v-model="scanRaw" rows="3" placeholder="https://…/auth/qr?code=…" />
      </label>
      <button type="button" class="primary" :disabled="claiming" @click="claim(scanRaw)">
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
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: transparent;
  color: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}

.tab.on {
  border-color: var(--text);
  color: var(--text);
  background: var(--surface2);
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
  border-radius: var(--radius);
  background: var(--surface2);
}

.timer {
  font-size: 0.8125rem;
}

.scan-video {
  width: 100%;
  max-height: 220px;
  border-radius: var(--radius);
  background: var(--surface2);
  object-fit: cover;
}

.scan-label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.8125rem;
  color: var(--muted);
}

.scan-pane button {
  width: 100%;
}

.ghost {
  justify-self: start;
  padding: 0.4rem 0;
  border: none;
  background: transparent;
  min-height: 0;
}

.ghost:hover {
  transform: none;
}

.hint {
  font-size: 0.8125rem;
  margin-bottom: 0.75rem;
}

.error {
  margin: 0.75rem 0 0;
}

.ok {
  color: var(--muted);
  font-size: 0.875rem;
  margin: 0.75rem 0 0;
}
</style>
