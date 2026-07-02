<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string;
    center?: boolean;
    inline?: boolean;
  }>(),
  {
    label: "загрузка",
    center: false,
    inline: false,
  },
);
</script>

<template>
  <p
    class="app-loading"
    :class="{
      'app-loading--center': center,
      'app-loading--inline': inline,
    }"
  >
    <span class="spinner" aria-hidden="true" />
    {{ label }}
  </p>
</template>

<style scoped>
.app-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin: 0;
  color: var(--muted);
}

.app-loading--center {
  margin: auto;
}

.app-loading--inline {
  display: inline-flex;
}
</style>
