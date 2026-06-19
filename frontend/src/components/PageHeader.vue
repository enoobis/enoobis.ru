<script setup lang="ts">
import MotionReveal from "./MotionReveal.vue";

defineProps<{
  title: string;
  meta?: string;
}>();
</script>

<template>
  <header class="page-head">
    <div class="page-head-lead">
      <slot name="back" />
      <div class="page-head-main">
        <MotionReveal as="h1">{{ title }}</MotionReveal>
        <MotionReveal v-if="meta" as="p" class="page-head-meta" :delay="0.06">{{ meta }}</MotionReveal>
      </div>
    </div>
    <div v-if="$slots.actions" class="page-head-actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-head-lead {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
</style>
