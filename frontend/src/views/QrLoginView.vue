<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import QRCode from "qrcode";
import jsQR from "jsqr";
import {
  approveQrLogin,
  claimQrCode,
  extractApproveCode,
  extractQrCode,
  issueQrCode,
  pollQrLogin,
  qrApproveUrl,
  qrLoginUrl,
  requestQrLogin,
} from "../api/qrAuth";
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
const scanning = ref(false);
const scanRaw = ref("");
const showManual = ref(false);
const videoEl = ref<HTMLVideoElement | null>(null);
const approveCode = ref("");
const approving = ref(false);

const leadText = "покажите qr на одном устройстве - отсканируйте на другом. работает в обе стороны.";

let expireTimer: ReturnType<typeof setInterval> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let scanLoop: ReturnType<typeof setInterval> | null = null;
let mediaStream: MediaStream | null = null;
let scanCanvas: HTMLCanvasElement | null = null;

function clearTimers() {
  if (expireTimer) {
    clearInterval(expireTimer);
    expireTimer = null;
  }
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
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
  scanning.value = false;
}

function describeErr(code: string) {
  if (code === "invalid_code") return "неверный или устаревший код";
  if (code === "code_expired") return "код истёк - обновите qr на другом устройстве";
  if (code === "code_used") return "код уже использован";
  if (code === "forbidden") return "аккаунт недоступен";
  return code || "ошибка";
}

async function refreshQr() {
  issuing.value = true;
  err.value = "";
  ok.value = "";
  try {
    const r = auth.token ? await issueQrCode(auth.token) : await requestQrLogin();
    const url = auth.token ? qrLoginUrl(r.code) : qrApproveUrl(r.code);
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
    if (!auth.token) {
      pollTimer = setInterval(async () => {
        try {
          const p = await pollQrLogin(r.code);
          if (!p.pending && p.token && p.user) {
            clearTimers();
            auth.applySession(p.token, p.user);
            ok.value = `вошли как @${p.user.nickname}`;
            await router.push("/microblogs");
          }
        } catch {
          /* истёк - обновится по таймеру */
        }
      }, 2000);
    }
  } catch (e) {
    err.value = describeErr(e instanceof Error ? e.message : "ошибка");
    qrDataUrl.value = "";
  } finally {
    issuing.value = false;
  }
}

async function confirmApprove() {
  if (!auth.token || !approveCode.value) return;
  approving.value = true;
  err.value = "";
  try {
    await approveQrLogin(auth.token, approveCode.value);
    approveCode.value = "";
    ok.value = "вход на другом устройстве подтверждён";
  } catch (e) {
    err.value = describeErr(e instanceof Error ? e.message : "ошибка");
  } finally {
    approving.value = false;
  }
}

async function claim(codeInput: string) {
  const approve = extractApproveCode(codeInput);
  if (approve) {
    if (!auth.token) {
      err.value = "войдите, чтобы подтвердить вход на другом устройстве";
      return;
    }
    approveCode.value = approve;
    stopCamera();
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

function decodeWithJsQr(): string | null {
  const video = videoEl.value;
  if (!video || !video.videoWidth || !video.videoHeight) return null;
  if (!scanCanvas) scanCanvas = document.createElement("canvas");
  const ctx = scanCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  scanCanvas.width = video.videoWidth;
  scanCanvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, scanCanvas.width, scanCanvas.height);
  const image = ctx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
  const hit = jsQR(image.data, image.width, image.height, {
    inversionAttempts: "dontInvert",
  });
  return hit?.data ?? null;
}

async function startCamera() {
  stopCamera();
  err.value = "";
  if (!window.isSecureContext) {
    err.value = "камера работает только по https";
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    err.value = "браузер не поддерживает камеру - вставьте ссылку вручную";
    showManual.value = true;
    return;
  }
  const Detector = (window as unknown as { BarcodeDetector?: typeof BarcodeDetector })
    .BarcodeDetector;
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    scanning.value = true;
    await nextTick();
    if (videoEl.value) {
      videoEl.value.srcObject = mediaStream;
      videoEl.value.setAttribute("playsinline", "true");
      await videoEl.value.play();
    }
    const detector = Detector ? new Detector({ formats: ["qr_code"] }) : null;
    scanLoop = setInterval(async () => {
      if (!videoEl.value || claiming.value) return;
      try {
        let raw: string | null = null;
        if (detector) {
          const hits = await detector.detect(videoEl.value);
          raw = hits[0]?.rawValue ?? null;
        } else {
          raw = decodeWithJsQr();
        }
        if (raw) await claim(raw);
      } catch {
        /* ignore frame errors */
      }
    }, 400);
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError") err.value = "доступ к камере запрещён - разрешите в настройках браузера";
    else if (name === "NotFoundError") err.value = "камера не найдена";
    else err.value = "не удалось открыть камеру - вставьте ссылку вручную";
    showManual.value = true;
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
  }
});

onMounted(() => {
  const approveFromUrl = String(route.query.approve ?? "");
  if (approveFromUrl) {
    if (auth.token) {
      approveCode.value = approveFromUrl;
    } else {
      tab.value = "scan";
      err.value = "войдите, чтобы подтвердить вход на другом устройстве";
    }
    return;
  }
  const fromUrl = String(route.query.code ?? "");
  if (fromUrl) {
    tab.value = "scan";
    scanRaw.value = fromUrl;
    showManual.value = true;
    void claim(fromUrl);
    return;
  }
  tab.value = "show";
  void refreshQr();
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

    <div v-if="approveCode" class="approve-pane">
      <p class="approve-text">подтвердить вход на другом устройстве?</p>
      <button type="button" class="primary" :disabled="approving" @click="confirmApprove">
        {{ approving ? "подтверждаем…" : "войти на том устройстве" }}
      </button>
      <button type="button" class="secondary ghost" @click="approveCode = ''">отмена</button>
    </div>

    <template v-else>
    <div class="filter-tabs tabs" role="tablist">
      <button
        type="button"
        class="filter-tab"
        :class="{ on: tab === 'show' }"
        @click="tab = 'show'"
      >
        показать qr
      </button>
      <button type="button" class="filter-tab" :class="{ on: tab === 'scan' }" @click="tab = 'scan'">
        сканировать
      </button>
    </div>

    <div v-if="tab === 'show'" class="show-pane">
      <p v-if="!auth.token" class="muted hint">отсканируйте этот qr с устройства, где вы вошли</p>
      <div v-if="qrDataUrl" class="qr-wrap">
        <img :src="qrDataUrl" width="220" height="220" alt="qr для входа" />
        <p class="muted timer">{{ expiresIn }} сек</p>
      </div>
      <p v-else-if="issuing" class="muted">создаём код…</p>
      <button type="button" class="secondary ghost" :disabled="issuing" @click="refreshQr">
        обновить
      </button>
    </div>

    <div v-else class="scan-pane">
      <video v-show="scanning" ref="videoEl" class="scan-video" playsinline muted />
      <button v-if="!scanning" type="button" class="primary" @click="startCamera">
        включить камеру
      </button>
      <button v-else type="button" class="secondary ghost" @click="stopCamera">
        выключить камеру
      </button>

      <button type="button" class="link-toggle" @click="showManual = !showManual">
        {{ showManual ? "скрыть ввод" : "ввести ссылку вручную" }}
      </button>
      <template v-if="showManual">
        <label class="scan-label">
          ссылка / код
          <textarea v-model="scanRaw" rows="3" placeholder="https://…/auth/qr?code=…" />
        </label>
        <button type="button" class="primary" :disabled="claiming" @click="claim(scanRaw)">
          {{ claiming ? "вход…" : "войти на этом устройстве" }}
        </button>
      </template>
    </div>
    </template>

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
  font-size: var(--text-sm);
  line-height: 1.45;
}

.tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
  margin-bottom: 1rem;
}

.show-pane,
.scan-pane,
.approve-pane {
  display: grid;
  gap: 0.75rem;
}

.approve-pane button {
  width: 100%;
}

.approve-text {
  margin: 0;
  font-size: var(--text-md);
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
  font-size: var(--text-xs);
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
  font-size: var(--text-xs);
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

.link-toggle {
  justify-self: start;
  padding: 0.25rem 0;
  border: none;
  background: transparent;
  min-height: 0;
  color: var(--muted);
  font-size: var(--text-xs);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.link-toggle:hover {
  color: var(--text);
  background: transparent;
  transform: none;
}

.hint {
  font-size: var(--text-xs);
  margin-bottom: 0.75rem;
}

.error {
  margin: 0.75rem 0 0;
}

.ok {
  color: var(--muted);
  font-size: var(--text-sm);
  margin: 0.75rem 0 0;
}
</style>
