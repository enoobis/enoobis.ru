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
import AppIcon from "../components/AppIcon.vue";
import AppLoading from "./AppLoading.vue";

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
  return mapUsesDarkTiles()
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
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

type Period = "week" | "month";
const period = ref<Period>("month");
const periodOffset = ref(0);
const pointFilter = ref("");
const pointMenuOpen = ref(false);
const pointMenuRoot = ref<HTMLElement | null>(null);
const checkins = ref<WorkCheckin[]>([]);
const loadingCheckins = ref(false);
const exporting = ref(false);

function selectPointFilter(id: string) {
  pointFilter.value = id;
  pointMenuOpen.value = false;
}

function onDocumentClick(event: MouseEvent) {
  if (!pointMenuOpen.value) return;
  const target = event.target as HTMLElement | null;
  const root = pointMenuRoot.value;
  if (root && target && root.contains(target)) return;
  pointMenuOpen.value = false;
}

const checkinsCountLabel = computed(() => {
  const n = checkins.value.length;
  if (n === 0) return "0 отметок";
  const mod10 = n % 10;
  const mod100 = n % 100;
  let word = "отметок";
  if (mod10 === 1 && mod100 !== 11) word = "отметка";
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = "отметки";
  return `${n} ${word}`;
});

const pointFilterLabel = computed(() => {
  if (!pointFilter.value) return "все точки";
  return points.value.find((p) => p.id === pointFilter.value)?.name ?? "точка";
});

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
    return `${fmt(from)} - ${fmt(end)}`;
  }
  return from.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
});

async function loadCheckins() {
  if (!auth.token) return;
  loadingCheckins.value = true;
  err.value = "";
  try {
    const { from, to } = rangeFor(period.value, periodOffset.value);
    const r = await listWorkCheckins(
      auth.token,
      from.toISOString(),
      to.toISOString(),
      pointFilter.value || undefined,
    );
    checkins.value = r.items;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    loadingCheckins.value = false;
  }
}

watch([period, periodOffset, pointFilter], loadCheckins);

function filterByPoint(p: WorkPoint) {
  pointFilter.value = p.id;
  pointMenuOpen.value = false;
}

function setPeriod(p: Period) {
  period.value = p;
  periodOffset.value = 0;
}

async function exportXlsx() {
  if (!auth.token) return;
  exporting.value = true;
  try {
    const { from, to } = rangeFor(period.value, periodOffset.value);
    await downloadWorkExport(
      auth.token,
      from.toISOString(),
      to.toISOString(),
      pointFilter.value || undefined,
    );
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    exporting.value = false;
  }
}

function checkinPersonLabel(c: WorkCheckin): string {
  const name = c.full_name?.trim();
  if (name && name.toLowerCase() !== c.nickname.toLowerCase()) {
    return `${name} - ${c.nickname}`;
  }
  return name || c.nickname;
}

function fmtWorkDate(iso: string | Date) {
  const d = iso instanceof Date ? iso : new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${d.getFullYear()}`;
}

function fmtWorkTime(iso: string | Date) {
  const d = iso instanceof Date ? iso : new Date(iso);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

onMounted(async () => {
  document.addEventListener("click", onDocumentClick);
  if (!auth.token) return;
  try {
    const r = await listWorkPoints(auth.token);
    points.value = r.items;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
  await loadCheckins();

  themeObserver = new MutationObserver(() => {
    if (map) applyMapTiles();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
});

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocumentClick);
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
      <div ref="mapEl" class="work-map" />
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
            {{ p.radius_m }} м ·
            <button type="button" class="checkins-link" @click="filterByPoint(p)">
              {{ p.checkin_count ?? 0 }} отметок
            </button>
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

    <section class="checkins-panel">
      <div class="filter-bar filter-bar--stack">
        <div class="filter-tabs" role="tablist" aria-label="период">
          <button
            class="filter-tab"
            :class="{ on: period === 'week' }"
            type="button"
            role="tab"
            :aria-selected="period === 'week'"
            @click="setPeriod('week')"
          >
            неделя
          </button>
          <button
            class="filter-tab"
            :class="{ on: period === 'month' }"
            type="button"
            role="tab"
            :aria-selected="period === 'month'"
            @click="setPeriod('month')"
          >
            месяц
          </button>
        </div>
        <div v-if="points.length" ref="pointMenuRoot" class="filter-menu-wrap">
          <button
            type="button"
            class="filter-trigger"
            :class="{ on: pointMenuOpen || !!pointFilter }"
            aria-haspopup="listbox"
            :aria-expanded="pointMenuOpen"
            @click.stop="pointMenuOpen = !pointMenuOpen"
          >
            <span>{{ pointFilterLabel }}</span>
          </button>
          <div v-if="pointMenuOpen" class="filter-menu" role="listbox">
            <button
              type="button"
              class="filter-menu-opt"
              :class="{ on: !pointFilter }"
              role="option"
              @click="selectPointFilter('')"
            >
              все точки
            </button>
            <button
              v-for="p in points"
              :key="p.id"
              type="button"
              class="filter-menu-opt"
              :class="{ on: pointFilter === p.id }"
              role="option"
              @click="selectPointFilter(p.id)"
            >
              {{ p.name }}
            </button>
          </div>
        </div>
        <div class="checkins-range">
          <button class="filter-icon-btn" type="button" aria-label="назад" @click="periodOffset--">
            <AppIcon name="back" :size="18" />
          </button>
          <div class="checkins-range-mid">
            <span class="range-label">{{ rangeLabel }}</span>
            <span class="checkins-meta muted">{{ checkinsCountLabel }}</span>
          </div>
          <button
            class="filter-icon-btn range-next"
            type="button"
            aria-label="вперёд"
            :disabled="periodOffset >= 0"
            @click="periodOffset++"
          >
            <AppIcon name="back" :size="18" />
          </button>
          <button
            class="filter-icon-btn"
            type="button"
            aria-label="скачать excel"
            :disabled="exporting || !checkins.length"
            @click="exportXlsx"
          >
            <AppIcon name="download" :size="18" />
          </button>
        </div>
      </div>

      <AppLoading v-if="loadingCheckins" class="page-empty page-empty--tight" />
      <p v-else-if="!checkins.length" class="page-empty page-empty--tight">пусто</p>
      <ul v-else class="checkin-list">
        <li v-for="c in checkins" :key="c.id" class="checkin-row">
          <div class="checkin-top">
            <span class="checkin-name">{{ checkinPersonLabel(c) }}</span>
            <span class="checkin-dist muted">{{ c.distance_m }} м</span>
          </div>
          <p class="checkin-sub muted">
            {{ fmtWorkDate(c.created_at) }} · {{ fmtWorkTime(c.created_at) }} · {{ c.point_name }}
          </p>
        </li>
      </ul>
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
  font-size: 0.82rem;
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
  font-size: 0.82rem;
}

.point-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  flex-shrink: 0;
}

.checkins-link {
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.checkins-link:hover {
  color: var(--text);
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

.checkins-panel {
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
}

.checkins-panel :deep(.filter-bar) {
  margin-bottom: 0;
}

.checkins-range {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  width: 100%;
  min-height: var(--control-h);
  padding: 0.15rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface2);
  box-sizing: border-box;
}

.checkins-range-mid {
  flex: 1;
  min-width: 0;
  display: grid;
  justify-items: center;
  gap: 0.05rem;
  padding: 0 0.25rem;
}

.range-label {
  font-size: 0.88rem;
  color: var(--text);
  text-align: center;
  text-transform: lowercase;
  line-height: 1.2;
}

.range-next :deep(.app-icon) {
  transform: rotate(180deg);
}

.checkins-meta {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.2;
}

.checkin-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.checkin-row {
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border);
}

.checkin-row:last-child {
  border-bottom: none;
}

.checkin-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}

.checkin-name {
  font-weight: 500;
  letter-spacing: -0.015em;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.checkin-dist {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  font-size: 0.82rem;
}

.checkin-sub {
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
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
