<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import jsQR from "jsqr";
import { extractWorkCode, workCheckin } from "../api/work";
import { useAuthStore } from "../stores/auth";
import AppIcon from "../components/AppIcon.vue";

const auth = useAuthStore();
const route = useRoute();

const err = ref("");
const okMsg = ref("");
const scanning = ref(false);
const busy = ref(false);
const videoEl = ref<HTMLVideoElement | null>(null);

let scanLoop: ReturnType<typeof setInterval> | null = null;
let mediaStream: MediaStream | null = null;
let scanCanvas: HTMLCanvasElement | null = null;

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

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("браузер не поддерживает геолокацию"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000,
    });
  });
}

function geoErrText(e: unknown) {
  if (e instanceof GeolocationPositionError) {
    if (e.code === e.PERMISSION_DENIED) return "доступ к геолокации запрещён - разрешите в настройках браузера";
    if (e.code === e.POSITION_UNAVAILABLE) return "не удалось определить местоположение";
    if (e.code === e.TIMEOUT) return "геолокация не ответила - попробуйте ещё раз";
  }
  return e instanceof Error ? e.message : "ошибка геолокации";
}

async function checkin(raw: string) {
  const code = extractWorkCode(raw);
  if (!code || !auth.token || busy.value) return;
  busy.value = true;
  err.value = "";
  okMsg.value = "";
  try {
    const pos = await getPosition();
    const r = await workCheckin(auth.token, {
      code,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    });
    okMsg.value = `отмечено · ${r.point_name}`;
    stopCamera();
  } catch (e) {
    err.value = geoErrText(e);
  } finally {
    busy.value = false;
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
  okMsg.value = "";
  if (!window.isSecureContext) {
    err.value = "камера работает только по https";
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    err.value = "браузер не поддерживает камеру";
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
      if (!videoEl.value || busy.value) return;
      try {
        let raw: string | null = null;
        if (detector) {
          const hits = await detector.detect(videoEl.value);
          raw = hits[0]?.rawValue ?? null;
        } else {
          raw = decodeWithJsQr();
        }
        if (raw) await checkin(raw);
      } catch {
        /* ignore frame errors */
      }
    }, 400);
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError") err.value = "доступ к камере запрещён - разрешите в настройках браузера";
    else if (name === "NotFoundError") err.value = "камера не найдена";
    else err.value = "не удалось открыть камеру";
  }
}

onMounted(() => {
  const fromUrl = String(route.query.c ?? "");
  if (fromUrl) {
    void checkin(fromUrl);
  }
});

onBeforeUnmount(stopCamera);
</script>

<template>
  <section class="work-page card">
    <h1>работа</h1>

    <div class="scan-pane">
      <video v-show="scanning" ref="videoEl" class="scan-video" playsinline muted />
      <button v-if="!scanning" type="button" class="primary" :disabled="busy" @click="startCamera">
        <AppIcon name="qr" :size="18" />
        {{ busy ? "отмечаем…" : "сканировать qr" }}
      </button>
      <button v-else type="button" class="secondary ghost" @click="stopCamera">
        выключить камеру
      </button>
    </div>

    <p v-if="err" class="error">{{ err }}</p>
    <p v-if="okMsg" class="ok">{{ okMsg }}</p>
  </section>
</template>

<style scoped>
.work-page {
  max-width: 24rem;
  margin: 2rem auto;
  padding: 1.25rem;
  display: grid;
  justify-items: center;
  text-align: center;
  gap: 1rem;
}

h1 {
  font-size: 1.25rem;
  margin: 0;
}

.scan-pane {
  display: grid;
  justify-items: center;
  gap: 0.75rem;
  width: 100%;
}

.scan-video {
  width: 100%;
  max-height: 260px;
  border-radius: var(--radius);
  background: var(--surface2);
  object-fit: cover;
}

.scan-pane button {
  width: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
}

.ghost {
  border: none;
  background: transparent;
  min-height: 0;
}

.ghost:hover {
  transform: none;
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
