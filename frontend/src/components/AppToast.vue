<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";

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
    <div
      v-for="t in toasts"
      :key="t.id"
      class="toast"
      :class="`toast-${t.type}`"
    >
      {{ t.text }}
    </div>
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
  padding: 0.7rem 0.95rem;
  border-radius: 12px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
  min-width: 200px;
  max-width: 360px;
  pointer-events: auto;
}

.toast-success {
  border-color: #2f7a4a;
  background: #08210f;
}

.toast-error {
  border-color: #8b2a2a;
  background: #2a0c0c;
}

.toast-info {
  border-color: var(--border);
}
</style>
