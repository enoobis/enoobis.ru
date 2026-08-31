<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { AnimatePresence, motion } from "motion-v";
import { toastActiveLite, toastEnterLite, toastExitLite } from "../utils/motionPresets";

type Toast = { id: number; type: "success" | "error" | "info"; text: string };

const toasts = ref<Toast[]>([]);
let counter = 0;

function show(text: string, type: Toast["type"] = "info") {
  const id = ++counter;
  toasts.value.push({ id, type, text });
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, 3500);
}

function onToastEvent(e: Event) {
  const detail = (e as CustomEvent<{ type?: Toast["type"]; text: string }>).detail;
  if (!detail?.text) return;
  show(detail.text, detail.type ?? "info");
}

onMounted(() => {
  window.addEventListener("app:toast", onToastEvent as EventListener);
});

onUnmounted(() => {
  window.removeEventListener("app:toast", onToastEvent as EventListener);
});
</script>

<template>
  <div class="toast-stack" aria-live="polite">
    <AnimatePresence>
      <motion.div
        v-for="t in toasts"
        :key="t.id"
        class="toast"
        :class="`toast-${t.type}`"
        :layout="false"
        :initial="toastEnterLite"
        :animate="toastActiveLite"
        :exit="toastExitLite"
      >
        {{ t.text }}
      </motion.div>
    </AnimatePresence>
  </div>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  display: grid;
  gap: 0.5rem;
  z-index: 9999;
  pointer-events: none;
}

.toast {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  min-width: 200px;
  max-width: 360px;
  pointer-events: auto;
  font-size: var(--text-sm);
  font-weight: 500;
  line-height: 1.35;
}
</style>
