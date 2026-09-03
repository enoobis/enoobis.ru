<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { haptic } from "../utils/haptics";

const props = withDefaults(
  defineProps<{
    refresh: () => Promise<void> | void;
    threshold?: number;
    disabled?: boolean;
  }>(),
  { threshold: 72, disabled: false },
);

const pull = ref(0);
const refreshing = ref(false);
const armed = ref(false);
const dragging = ref(false);

let startY = 0;
let tracking = false;
let notified = false;

const canPull = computed(
  () => !props.disabled && typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
);

/** резиновое затухание: чем дальше тянешь, тем меньше отклик */
function rubber(distance: number): number {
  const max = props.threshold * 2;
  return max * (1 - Math.exp(-distance / max));
}

const offset = computed(() => (refreshing.value ? props.threshold * 0.6 : pull.value));
const ratio = computed(() => Math.min(1, offset.value / props.threshold));

function pageScrollTop() {
  return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
}

function innerScrolled(target: EventTarget | null) {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.documentElement) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollTop > 0) return true;
    el = el.parentElement;
  }
  return false;
}

function onTouchStart(e: TouchEvent) {
  if (!canPull.value || refreshing.value || e.touches.length !== 1) return;
  if (pageScrollTop() > 0 || innerScrolled(e.target)) return;
  startY = e.touches[0].clientY;
  tracking = true;
  notified = false;
}

function onTouchMove(e: TouchEvent) {
  if (!tracking || refreshing.value) return;
  const delta = e.touches[0].clientY - startY;
  if (delta <= 0 || pageScrollTop() > 0 || innerScrolled(e.target)) {
    reset();
    return;
  }
  if (e.cancelable) e.preventDefault();
  dragging.value = true;
  pull.value = rubber(delta);
  armed.value = pull.value >= props.threshold;
  if (armed.value && !notified) {
    notified = true;
    haptic("tap");
  }
}

async function onTouchEnd() {
  if (!tracking) return;
  tracking = false;
  dragging.value = false;
  const shouldRefresh = armed.value;
  armed.value = false;
  pull.value = 0;
  if (!shouldRefresh) return;

  refreshing.value = true;
  haptic("toggle");
  try {
    await props.refresh();
  } finally {
    refreshing.value = false;
  }
}

function reset() {
  tracking = false;
  dragging.value = false;
  armed.value = false;
  pull.value = 0;
}

onMounted(() => {
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("touchcancel", reset, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener("touchstart", onTouchStart);
  window.removeEventListener("touchmove", onTouchMove);
  window.removeEventListener("touchend", onTouchEnd);
  window.removeEventListener("touchcancel", reset);
});
</script>

<template>
  <div class="ptr">
    <div
      class="ptr-slot"
      :class="{ settle: !dragging, live: dragging || refreshing }"
      :style="{ transform: `translateY(${offset}px)` }"
    >
      <div
        v-if="offset > 1"
        class="ptr-head"
        :style="{ height: `${offset}px`, opacity: ratio }"
        aria-hidden="true"
      >
        <span
          class="spinner ptr-spinner"
          :class="{ 'ptr-spinner--spin': refreshing }"
          :style="
            refreshing
              ? undefined
              : { transform: `scale(${0.6 + ratio * 0.4}) rotate(${ratio * 270}deg)` }
          "
        />
      </div>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.ptr {
  position: relative;
}
.ptr-slot.live {
  will-change: transform;
}
.ptr-slot.settle {
  transition: transform var(--dur-4) var(--ease-spring);
}
.ptr-head {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ptr-spinner {
  width: 20px;
  height: 20px;
  animation: none;
}

.ptr-spinner--spin {
  animation: spin 0.7s linear infinite;
}
</style>
