<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import QRCode from "qrcode";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  createWorkPoint,
  deleteWorkPoint,
  getWorkSheetLink,
  listWorkPoints,
  updateWorkPoint,
  workQrUrl,
  type WorkPoint,
} from "../api/work";
import { toastSuccess } from "../utils/toast";
import { useAuthStore } from "../stores/auth";
import AppIcon from "../components/AppIcon.vue";

const auth = useAuthStore();

const err = ref("");
const points = ref<WorkPoint[]>([]);

const mapOpen = ref(false);
const mapMode = ref<"create" | "view">("create");
const createMode = computed(() => mapMode.value === "create");

const mapEl = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;
let tileLayer: L.TileLayer | null = null;
let pickMarker: L.Marker | null = null;
let pickCircle: L.Circle | null = null;
const pointMarkers = new Map<string, L.Marker>();
let themeObserver: MutationObserver | null = null;

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

function mapUsesDarkTiles(): boolean {
  const theme = document.documentElement.getAttribute("data-theme");
  return !theme || theme === "black" || theme === "contrast";
}

function mapTileUrl(): string {
  return "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
}

function mapStrokeColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#ededed";
}

function circleStyle(): L.PathOptions {
  const stroke = mapStrokeColor();
  return {
    weight: 1,
    color: stroke,
    fillColor: stroke,
    fillOpacity: 0.1,
  };
}

function applyMapTiles() {
  if (!map) return;
  tileLayer?.remove();
  tileLayer = L.tileLayer(mapTileUrl(), {
    maxZoom: 19,
    attribution: "&copy; openstreetmap",
  }).addTo(map);
}

function syncPick() {
  if (!map || !picked.value) return;
  const ll = L.latLng(picked.value.lat, picked.value.lng);
  const style = circleStyle();
  if (!pickMarker) {
    pickMarker = L.marker(ll, { icon: markerIcon }).addTo(map);
  } else {
    pickMarker.setLatLng(ll);
  }
  if (!pickCircle) {
    pickCircle = L.circle(ll, { ...circleStyle(), radius: newRadius.value }).addTo(map);
  } else {
    pickCircle.setLatLng(ll);
    pickCircle.setRadius(newRadius.value);
    pickCircle.setStyle({
      color: style.color,
      fillColor: style.fillColor,
      fillOpacity: style.fillOpacity,
    });
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

function destroyMap() {
  pickMarker?.remove();
  pickMarker = null;
  pickCircle?.remove();
  pickCircle = null;
  pointMarkers.clear();
  map?.remove();
  map = null;
  tileLayer = null;
}

async function initMap() {
  await nextTick();
  if (!mapEl.value) return;
  if (map) {
    map.invalidateSize();
    return;
  }
  const first = points.value[0];
  map = L.map(mapEl.value, { zoomControl: true }).setView(
    first ? [first.lat, first.lng] : [55.751, 37.618],
    first ? 14 : 11,
  );
  applyMapTiles();
  map.on("click", (e: L.LeafletMouseEvent) => {
    if (!createMode.value) return;
    picked.value = { lat: e.latlng.lat, lng: e.latlng.lng };
    syncPick();
  });
  renderPoints();
  requestAnimationFrame(() => map?.invalidateSize());
}

async function openCreateMap() {
  mapMode.value = "create";
  newName.value = "";
  picked.value = null;
  mapOpen.value = true;
  await nextTick();
  await initMap();
}

async function openMapView(p: WorkPoint) {
  mapMode.value = "view";
  picked.value = null;
  pickMarker?.remove();
  pickMarker = null;
  pickCircle?.remove();
  pickCircle = null;
  mapOpen.value = true;
  await nextTick();
  await initMap();
  focusPoint(p);
}

function closeMap() {
  destroyMap();
  picked.value = null;
  mapOpen.value = false;
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
    closeMap();
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
  const raw = window.prompt("радиус, м (50-2000)", String(p.radius_m));
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

const sheetPath = ref("");
const mapDark = ref(mapUsesDarkTiles());

async function copySheetLink() {
  if (!sheetPath.value) return;
  const url = `${window.location.origin}${sheetPath.value}`;
  try {
    await navigator.clipboard.writeText(url);
    toastSuccess("ссылка скопирована");
  } catch {
    err.value = "не скопировалось";
  }
}

onMounted(async () => {
  if (!auth.token) return;
  try {
    const [pts, sheet] = await Promise.all([
      listWorkPoints(auth.token),
      getWorkSheetLink(auth.token),
    ]);
    points.value = pts.items;
    sheetPath.value = sheet.path;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }

  themeObserver = new MutationObserver(() => {
    mapDark.value = mapUsesDarkTiles();
    if (map) applyMapTiles();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
});

onBeforeUnmount(() => {
  themeObserver?.disconnect();
  themeObserver = null;
  destroyMap();
});
</script>

<template>
  <div class="work-tab">
    <p v-if="err" class="error">{{ err }}</p>

    <button type="button" class="work-create" @click="openCreateMap">создать точку</button>

    <div v-if="mapOpen" class="work-map-wrap">
      <div class="work-map-head">
        <span class="work-map-label muted small">
          {{ createMode ? "кликните на карту" : "просмотр" }}
        </span>
        <button class="filter-icon-btn" type="button" aria-label="закрыть" @click="closeMap">
          <AppIcon name="close" :size="18" />
        </button>
      </div>
      <div ref="mapEl" class="work-map" :class="{ 'work-map--dark': mapDark }" />
      <div v-if="createMode" class="work-new">
        <input v-model="newName" type="text" placeholder="название" />
        <label class="radius-label">
          <span class="radius-label-text">радиус · {{ newRadius }} м</span>
          <input
            v-model.number="newRadius"
            class="radius-range"
            type="range"
            min="50"
            max="1000"
            step="50"
          />
        </label>
        <button type="button" :disabled="!picked || creating" @click="addPoint">
          {{ creating ? "…" : picked ? "добавить" : "выберите место" }}
        </button>
      </div>
    </div>

    <ul v-if="points.length" class="point-list">
      <li v-for="p in points" :key="p.id" class="point-row">
        <div class="point-main">
          <strong class="point-name">{{ p.name }}</strong>
          <p class="point-meta muted">
            {{ p.radius_m }} м · {{ p.checkin_count ?? 0 }} отметок
          </p>
        </div>
        <div class="point-actions">
          <button class="filter-icon-btn" type="button" aria-label="на карте" @click="openMapView(p)">
            <AppIcon name="pin" :size="18" />
          </button>
          <button class="filter-icon-btn" type="button" aria-label="радиус" @click="changeRadius(p)">
            <AppIcon name="edit" :size="18" />
          </button>
          <button class="filter-icon-btn" type="button" aria-label="qr" @click="showQr(p)">
            <AppIcon name="qr" :size="18" />
          </button>
          <button class="filter-icon-btn" type="button" aria-label="удалить" @click="removePoint(p)">
            <AppIcon name="delete" :size="18" />
          </button>
        </div>
      </li>
    </ul>
    <p v-else class="page-empty">точек нет</p>

    <div v-if="qrPoint" class="qr-modal" @click.self="qrPoint = null">
      <div class="qr-card">
        <p class="qr-title">{{ qrPoint.name }}</p>
        <img v-if="qrDataUrl" :src="qrDataUrl" width="280" height="280" alt="qr точки" />
        <div class="qr-actions">
          <button type="button" @click="downloadQr">скачать</button>
          <button class="secondary" type="button" @click="qrPoint = null">закрыть</button>
        </div>
      </div>
    </div>

    <section v-if="sheetPath" class="sheet-line">
      <RouterLink :to="sheetPath">таблица</RouterLink>
      <button type="button" class="secondary" @click="copySheetLink">копировать</button>
    </section>
  </div>
</template>

<style scoped>
.work-tab {
  display: grid;
  gap: var(--space-5);
}

.work-create {
  width: 100%;
}

.work-map-wrap {
  display: grid;
  gap: var(--space-3);
}

.work-map-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.work-map-label {
  margin: 0;
}

.work-map {
  height: min(52vh, 320px);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  overflow: hidden;
  z-index: 0;
  background: var(--bg);
}

.work-map--dark :deep(.leaflet-tile-pane) {
  filter: invert(1) grayscale(1);
}

.sheet-line {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
}

.work-new {
  display: grid;
  gap: var(--space-3);
}

.work-new input[type="text"] {
  width: 100%;
}

.radius-label {
  display: grid;
  gap: 0.35rem;
}

.radius-label-text {
  font-size: var(--text-xs);
  color: var(--muted);
}

.radius-range {
  width: 100%;
  height: 4px;
  margin: 0;
  appearance: none;
  background: var(--border);
  border-radius: var(--radius-pill);
  cursor: pointer;
}

.radius-range:focus-visible {
  outline: 2px solid var(--focus-border);
  outline-offset: 4px;
}

.radius-range::-webkit-slider-runnable-track {
  height: 4px;
  background: var(--border);
  border-radius: var(--radius-pill);
}

.radius-range::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  margin-top: -6px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--text);
}

.radius-range::-moz-range-track {
  height: 4px;
  background: var(--border);
  border-radius: var(--radius-pill);
}

.radius-range::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--text);
}

.point-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0;
}

.point-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border);
}

.point-row:last-child {
  border-bottom: none;
}

.point-main {
  flex: 1;
  min-width: 0;
}

.point-name {
  display: block;
  font-weight: 500;
  letter-spacing: -0.02em;
}

.point-meta {
  margin: 0.15rem 0 0;
  font-size: var(--text-xs);
}

.point-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  flex-shrink: 0;
}

.qr-modal {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: var(--layout-pad);
  background: rgba(0, 0, 0, 0.6);
}

.qr-card {
  display: grid;
  justify-items: center;
  gap: var(--space-3);
  width: min(100%, 20rem);
  padding: var(--space-5);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface);
}

.qr-card img {
  width: 100%;
  height: auto;
  border-radius: var(--radius);
  background: #fff;
}

.qr-title {
  margin: 0;
  font-weight: 500;
}

.qr-actions {
  display: flex;
  gap: 0.4rem;
  width: 100%;
}

.qr-actions > * {
  flex: 1;
}

:deep(.leaflet-control-zoom a) {
  background: var(--surface) !important;
  color: var(--text) !important;
  border-color: var(--border) !important;
}

:deep(.leaflet-control-attribution) {
  background: var(--surface) !important;
  color: var(--muted) !important;
}

:deep(.leaflet-control-attribution a) {
  color: var(--muted) !important;
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
