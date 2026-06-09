<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import QRCode from "qrcode";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  createWorkPoint,
  deleteWorkPoint,
  downloadWorkExport,
  listWorkCheckins,
  listWorkPoints,
  updateWorkPoint,
  workQrUrl,
  type WorkCheckin,
  type WorkPoint,
} from "../api/work";
import { useAuthStore } from "../stores/auth";
import AppIcon from "./AppIcon.vue";

const auth = useAuthStore();

const err = ref("");
const points = ref<WorkPoint[]>([]);

/* ---------- карта ---------- */

const mapEl = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;
let pickMarker: L.Marker | null = null;
let pickCircle: L.Circle | null = null;
const pointMarkers = new Map<string, L.Marker>();

const newName = ref("");
const newRadius = ref(250);
const picked = ref<{ lat: number; lng: number } | null>(null);
const creating = ref(false);

const markerIcon = L.divIcon({
  className: "work-marker",
  html: '<span class="work-marker-dot"></span>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function syncPick() {
  if (!map || !picked.value) return;
  const ll = L.latLng(picked.value.lat, picked.value.lng);
  if (!pickMarker) {
    pickMarker = L.marker(ll, { icon: markerIcon }).addTo(map);
  } else {
    pickMarker.setLatLng(ll);
  }
  if (!pickCircle) {
    pickCircle = L.circle(ll, { radius: newRadius.value, weight: 1 }).addTo(map);
  } else {
    pickCircle.setLatLng(ll);
    pickCircle.setRadius(newRadius.value);
  }
}

function renderPoints() {
  if (!map) return;
  for (const [, m] of pointMarkers) m.remove();
  pointMarkers.clear();
  for (const p of points.value) {
    const m = L.marker([p.lat, p.lng], { icon: markerIcon })
      .addTo(map)
      .bindTooltip(p.name, { direction: "top" });
    pointMarkers.set(p.id, m);
  }
}

async function initMap() {
  await nextTick();
  if (!mapEl.value || map) return;
  const first = points.value[0];
  map = L.map(mapEl.value, { zoomControl: true }).setView(
    first ? [first.lat, first.lng] : [55.751, 37.618],
    first ? 14 : 11,
  );
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; openstreetmap",
  }).addTo(map);
  map.on("click", (e: L.LeafletMouseEvent) => {
    picked.value = { lat: e.latlng.lat, lng: e.latlng.lng };
    syncPick();
  });
  renderPoints();
}

watch(newRadius, syncPick);

async function addPoint() {
  if (!auth.token || !picked.value) return;
  const name = newName.value.trim();
  if (!name) {
    err.value = "нужно название точки";
    return;
  }
  creating.value = true;
  err.value = "";
  try {
    const p = await createWorkPoint(auth.token, {
      name,
      lat: picked.value.lat,
      lng: picked.value.lng,
      radius_m: newRadius.value,
    });
    points.value = [p, ...points.value];
    newName.value = "";
    picked.value = null;
    pickMarker?.remove();
    pickMarker = null;
    pickCircle?.remove();
    pickCircle = null;
    renderPoints();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    creating.value = false;
  }
}

async function removePoint(p: WorkPoint) {
  if (!auth.token) return;
  if (!window.confirm(`удалить точку «${p.name}» и её отметки?`)) return;
  try {
    await deleteWorkPoint(auth.token, p.id);
    points.value = points.value.filter((x) => x.id !== p.id);
    if (qrPoint.value?.id === p.id) qrPoint.value = null;
    renderPoints();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

async function changeRadius(p: WorkPoint) {
  if (!auth.token) return;
  const raw = window.prompt("радиус, м (50–2000)", String(p.radius_m));
  if (raw === null) return;
  const radius = Number(raw);
  if (!Number.isFinite(radius)) return;
  try {
    const updated = await updateWorkPoint(auth.token, p.id, { radius_m: radius });
    points.value = points.value.map((x) => (x.id === p.id ? { ...x, ...updated } : x));
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

function focusPoint(p: WorkPoint) {
  map?.setView([p.lat, p.lng], 16);
}

/* ---------- qr ---------- */

const qrPoint = ref<WorkPoint | null>(null);
const qrDataUrl = ref("");

async function showQr(p: WorkPoint) {
  qrPoint.value = p;
  qrDataUrl.value = await QRCode.toDataURL(workQrUrl(p.qr_secret), {
    width: 280,
    margin: 2,
  });
}

function downloadQr() {
  if (!qrDataUrl.value || !qrPoint.value) return;
  const a = document.createElement("a");
  a.href = qrDataUrl.value;
  a.download = `qr-${qrPoint.value.name}.png`;
  a.click();
}

/* ---------- отметки ---------- */

type Period = "week" | "month";
const period = ref<Period>("week");
const periodOffset = ref(0);
const checkins = ref<WorkCheckin[]>([]);
const loadingCheckins = ref(false);
const exporting = ref(false);

function rangeFor(p: Period, offset: number): { from: Date; to: Date } {
  const now = new Date();
  if (p === "week") {
    const day = (now.getDay() + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + offset * 7);
    const next = new Date(monday);
    next.setDate(monday.getDate() + 7);
    return { from: monday, to: next };
  }
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const next = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { from: first, to: next };
}

const rangeLabel = computed(() => {
  const { from, to } = rangeFor(period.value, periodOffset.value);
  if (period.value === "week") {
    const end = new Date(to);
    end.setDate(end.getDate() - 1);
    const fmt = (d: Date) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    return `${fmt(from)} — ${fmt(end)}`;
  }
  return from.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
});

async function loadCheckins() {
  if (!auth.token) return;
  loadingCheckins.value = true;
  err.value = "";
  try {
    const { from, to } = rangeFor(period.value, periodOffset.value);
    const r = await listWorkCheckins(auth.token, from.toISOString(), to.toISOString());
    checkins.value = r.items;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    loadingCheckins.value = false;
  }
}

watch([period, periodOffset], loadCheckins);

function setPeriod(p: Period) {
  period.value = p;
  periodOffset.value = 0;
}

async function exportXlsx() {
  if (!auth.token) return;
  exporting.value = true;
  try {
    const { from, to } = rangeFor(period.value, periodOffset.value);
    await downloadWorkExport(auth.token, from.toISOString(), to.toISOString());
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    exporting.value = false;
  }
}

function fmtCheckin(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

onMounted(async () => {
  if (!auth.token) return;
  try {
    const r = await listWorkPoints(auth.token);
    points.value = r.items;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
  await initMap();
  await loadCheckins();
});

onBeforeUnmount(() => {
  map?.remove();
  map = null;
});
</script>

<template>
  <div class="work-tab">
    <p v-if="err" class="error">{{ err }}</p>

    <div class="work-map-wrap">
      <div ref="mapEl" class="work-map" />
      <div class="work-new">
        <input v-model="newName" type="text" placeholder="название точки" />
        <label class="radius-label">
          радиус · {{ newRadius }} м
          <input v-model.number="newRadius" type="range" min="50" max="1000" step="50" />
        </label>
        <button type="button" :disabled="!picked || creating" @click="addPoint">
          {{ picked ? "добавить точку" : "кликните на карту" }}
        </button>
      </div>
    </div>

    <ul v-if="points.length" class="list">
      <li v-for="p in points" :key="p.id">
        <div>
          <strong>{{ p.name }}</strong>
          <span class="muted small"> · {{ p.radius_m }} м · {{ p.checkin_count ?? 0 }} отметок</span>
        </div>
        <div class="row-actions">
          <button class="secondary" type="button" @click="focusPoint(p)">на карте</button>
          <button class="secondary" type="button" @click="changeRadius(p)">радиус</button>
          <button class="secondary" type="button" @click="showQr(p)">qr</button>
          <button class="secondary danger" type="button" @click="removePoint(p)">удалить</button>
        </div>
      </li>
    </ul>
    <p v-else class="muted">точек пока нет — кликните на карту и добавьте первую</p>

    <div v-if="qrPoint" class="qr-modal" @click.self="qrPoint = null">
      <div class="qr-card">
        <p class="qr-title">{{ qrPoint.name }}</p>
        <img v-if="qrDataUrl" :src="qrDataUrl" width="280" height="280" alt="qr точки" />
        <div class="row-actions">
          <button type="button" @click="downloadQr">скачать png</button>
          <button class="secondary" type="button" @click="qrPoint = null">закрыть</button>
        </div>
      </div>
    </div>

    <div class="checkins-head">
      <div class="filter-tabs">
        <button class="filter-tab" :class="{ on: period === 'week' }" type="button" @click="setPeriod('week')">
          неделя
        </button>
        <button class="filter-tab" :class="{ on: period === 'month' }" type="button" @click="setPeriod('month')">
          месяц
        </button>
      </div>
      <div class="range-nav">
        <button class="secondary" type="button" aria-label="назад" @click="periodOffset--">
          <AppIcon name="back" :size="16" />
        </button>
        <span class="range-label">{{ rangeLabel }}</span>
        <button
          class="secondary range-next"
          type="button"
          aria-label="вперёд"
          :disabled="periodOffset >= 0"
          @click="periodOffset++"
        >
          <AppIcon name="back" :size="16" />
        </button>
      </div>
      <button class="secondary" type="button" :disabled="exporting || !checkins.length" @click="exportXlsx">
        {{ exporting ? "скачиваем…" : "excel" }}
      </button>
    </div>

    <p v-if="loadingCheckins" class="muted">загрузка…</p>
    <p v-else-if="!checkins.length" class="muted">отметок нет</p>
    <ul v-else class="list">
      <li v-for="c in checkins" :key="c.id">
        <div>
          <strong>{{ c.nickname }}</strong>
          <span class="muted small"> · {{ c.point_name }} · {{ fmtCheckin(c.created_at) }} · {{ c.distance_m }} м</span>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.work-tab {
  display: grid;
  gap: 1rem;
}

.work-map-wrap {
  display: grid;
  gap: 0.6rem;
}

.work-map {
  height: 320px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  overflow: hidden;
  z-index: 0;
}

.work-new {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.work-new input[type="text"] {
  flex: 1;
  min-width: 10rem;
}

.radius-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: var(--muted);
  white-space: nowrap;
}

.qr-modal {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.6);
}

.qr-card {
  display: grid;
  justify-items: center;
  gap: 0.75rem;
  padding: 1.25rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface);
}

.qr-card img {
  border-radius: var(--radius);
  background: #fff;
}

.qr-title {
  margin: 0;
  font-weight: 600;
}

.checkins-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.range-nav {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-left: auto;
}

.range-label {
  font-size: 0.8125rem;
  color: var(--muted);
  min-width: 9rem;
  text-align: center;
}

.range-next :deep(.app-icon) {
  transform: rotate(180deg);
}

:deep(.work-marker-dot) {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text, #fafafa);
  border: 3px solid var(--bg, #141414);
  box-sizing: border-box;
}
</style>
