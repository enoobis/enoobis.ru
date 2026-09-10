<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from "vue";
import { AnimatePresence, motion } from "motion-v";
import AppIcon from "./AppIcon.vue";
import { springSnappy } from "../utils/motionPresets";
import { prefersReducedMotion } from "../utils/reducedMotion";

const open = defineModel<boolean>("open", { default: false });
const query = defineModel<string>("query", { default: "" });

defineProps<{
  placeholder: string;
}>();

const triggerEl = ref<HTMLButtonElement | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);
const fieldWidth = ref(46);
const fieldTop = ref(0);
const fieldLeft = ref(0);
const collapsedWidth = ref(46);
const reduced = prefersReducedMotion();

const leftGap = 16;

function leftNavRightEdge(bar: HTMLElement, fallbackLeft: number) {
  const nodes = bar.querySelectorAll<HTMLElement>(
    ".nav-menu-anchor, .brand-link, .nav-guest-links",
  );
  let right = fallbackLeft;
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0) right = Math.max(right, rect.right);
  }
  return right + leftGap;
}

function syncLayout() {
  if (typeof window === "undefined") return;
  const trigger = triggerEl.value;
  const bar = trigger?.closest(".nav-bar") as HTMLElement | null;
  if (!trigger || !bar) {
    fieldWidth.value = 280;
    return;
  }

  const triggerRect = trigger.getBoundingClientRect();
  const barRect = bar.getBoundingClientRect();
  const leftEdge = leftNavRightEdge(bar, barRect.left + 12);
  collapsedWidth.value = triggerRect.width;
  const width = Math.max(collapsedWidth.value, triggerRect.right - leftEdge);

  fieldTop.value = triggerRect.top + triggerRect.height / 2;
  fieldLeft.value = triggerRect.right;
  fieldWidth.value = width;
}

function focusInput() {
  void nextTick(() => inputEl.value?.focus());
}

function openSearch() {
  syncLayout();
  open.value = true;
}

function closeSearch() {
  open.value = false;
}

function toggleSearch() {
  if (open.value) closeSearch();
  else openSearch();
}

function onResize() {
  if (open.value) syncLayout();
}

watch(open, (v) => {
  if (v) {
    syncLayout();
    focusInput();
    window.addEventListener("resize", onResize);
    return;
  }
  window.removeEventListener("resize", onResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", onResize);
});

defineExpose({ focus: focusInput });
</script>

<template>
  <div class="nav-search-expand">
    <Teleport to="body">
      <AnimatePresence>
        <motion.div
          v-if="open"
          key="field"
          class="nav-search-expand__field"
          :style="{ top: `${fieldTop}px`, left: `${fieldLeft}px` }"
          :initial="reduced ? false : { width: collapsedWidth }"
          :animate="{ width: fieldWidth }"
          :exit="
            reduced
              ? undefined
              : { width: collapsedWidth, opacity: 0, transition: { duration: 0.18 } }
          "
          :transition="springSnappy"
        >
          <input
            ref="inputEl"
            v-model="query"
            type="search"
            class="nav-search-expand__input"
            :placeholder="placeholder"
            autocomplete="off"
            @keydown.esc.stop="closeSearch"
          />
          <span class="nav-search-expand__icon" aria-hidden="true">
            <AppIcon name="search" :size="20" />
          </span>
        </motion.div>
      </AnimatePresence>
    </Teleport>
    <button
      ref="triggerEl"
      type="button"
      class="icon-btn nav-search-trigger"
      :class="{ 'nav-search-trigger--ghost': open }"
      aria-label="поиск"
      title="поиск"
      :aria-expanded="open"
      @click.stop="toggleSearch"
    >
      <AppIcon name="search" :size="20" />
    </button>
  </div>
</template>

<style scoped>
.nav-search-expand {
  position: relative;
  flex-shrink: 0;
  width: var(--control-h);
  height: var(--control-h);
}

.nav-search-expand__field {
  position: fixed;
  z-index: 120;
  translate: -100% -50%;
  display: flex;
  align-items: center;
  height: var(--control-h);
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--muted);
  transform-origin: right center;
}

.nav-search-expand__input {
  flex: 1 1 0;
  width: 0;
  min-width: 0;
  border: none;
  background: transparent;
  padding: 0 0 0 0.85rem;
  min-height: 0;
  color: var(--text);
  font-size: var(--text-sm);
}

.nav-search-expand__input:focus {
  outline: none;
}

.nav-search-expand__input::placeholder {
  color: var(--muted);
}

.nav-search-expand__icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: calc(var(--control-h) - 2px);
  height: calc(var(--control-h) - 2px);
  color: var(--muted);
}

.nav-search-trigger {
  position: relative;
  z-index: 121;
}

.nav-search-trigger--ghost {
  opacity: 0;
  pointer-events: none;
}
</style>
