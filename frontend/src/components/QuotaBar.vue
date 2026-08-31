<script setup lang="ts">
defineProps<{ percent: number }>();
</script>

<template>
  <div class="quota-bar">
    <span :style="{ width: `${Math.min(100, Math.max(0, percent))}%` }" />
  </div>
</template>

<style scoped>
.quota-bar {
  height: 3px;
  margin-top: calc(var(--space-2) * -1);
  border-radius: var(--radius-pill);
  background: var(--surface2);
  overflow: hidden;
}

.quota-bar > span {
  display: block;
  height: 100%;
  background: var(--text);
  transition: width var(--dur-2) var(--ease-out);
}
</style>
