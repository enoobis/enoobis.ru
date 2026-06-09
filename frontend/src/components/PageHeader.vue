<script setup lang="ts">
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
        <h1>{{ title }}</h1>
        <p v-if="meta" class="page-head-meta">{{ meta }}</p>
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
