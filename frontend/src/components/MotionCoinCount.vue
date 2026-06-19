<script setup lang="ts">
defineProps<{ value: number }>();
</script>

<template>
  <span
    :key="value"
    v-motion
    class="motion-coin-count"
    :initial="{ opacity: 0, y: 5 }"
    :enter="{
      opacity: 1,
      y: 0,
      transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
    }"
  >
    {{ value }}
  </span>
</template>

<style scoped>
.motion-coin-count {
  display: inline-block;
}
</style>
