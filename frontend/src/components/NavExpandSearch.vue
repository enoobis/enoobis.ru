<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from "vue";
import { AnimatePresence, motion } from "motion-v";
import AppIcon from "./AppIcon.vue";
import { searchTween, springSnappy } from "../utils/motionPresets";
import { prefersReducedMotion } from "../utils/reducedMotion";

const open = defineModel<boolean>("open", { default: false });
const query = defineModel<string>("query", { default: "" });

defineProps<{
  placeholder: string;
}>();

const triggerEl = ref<HTMLButtonElement | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);
const fieldWidth = ref(44);
const fieldTop = ref(0);
const fieldRight = ref(0);
const reduced = prefersReducedMotion();

const collapsedWidth = 44;

function syncLayout() {
  if (typeof window === "undefined") return;
  const trigger = triggerEl.value;
  const bar = trigger?.closest(".nav-bar");
  if (!trigger || !bar) {
    fieldWidth.value = 280;
    return;
  }

  const triggerRect = trigger.getBoundingClientRect();
  const barRect = bar.getBoundingClientRect();
  const anchor =
    bar.querySelector<HTMLElement>(".nav-menu-anchor") ??
    bar.querySelector<HTMLElement>(".brand-link");

  const leftEdge = anchor
    ? anchor.getBoundingClientRect().right + 10
    : barRect.left + 12;
  const width = Math.max(collapsedWidth, triggerRect.right - leftEdge);

  fieldTop.value = triggerRect.top + triggerRect.height / 2;
  fieldRight.value = window.innerWidth - triggerRect.right;
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
          :style="{ top: `${fieldTop}px`, right: `${fieldRight}px` }"
          :initial="reduced ? false : { width: collapsedWidth, opacity: 0.7 }"
          :animate="{ width: fieldWidth, opacity: 1 }"
          :exit="reduced ? undefined : { width: collapsedWidth, opacity: 0, transition: { duration: 0.14 } }"
          :transition="reduced ? searchTween : springSnappy"
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
          <AppIcon name="search" :size="18" class="nav-search-expand__icon" />
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
  translate: 0 -50%;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  height: var(--control-h);
  overflow: hidden;
  padding: 0 0.55rem 0 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--muted);
  transform-origin: right center;
}

.nav-search-expand__input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  padding: 0;
  min-height: 0;
  color: var(--text);
  font-size: 0.92rem;
}

.nav-search-expand__input:focus {
  outline: none;
}

.nav-search-expand__input::placeholder {
  color: var(--muted);
}

.nav-search-expand__icon {
  flex-shrink: 0;
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
