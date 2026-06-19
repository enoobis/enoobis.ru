<script setup lang="ts">
import { AnimatePresence, motion } from "motion-v";
import { springPop } from "../utils/motionPresets";

defineProps<{ value: number }>();
</script>

<template>
  <AnimatePresence mode="popLayout">
    <motion.span
      :key="value"
      class="motion-coin-count"
      :initial="{ opacity: 0, y: 18, scale: 0.45, rotate: -12, filter: 'blur(6px)' }"
      :animate="{ opacity: 1, y: 0, scale: 1, rotate: 0, filter: 'blur(0px)' }"
      :exit="{ opacity: 0, y: -14, scale: 1.45, rotate: 8, filter: 'blur(4px)' }"
      :transition="springPop"
    >
      {{ value }}
    </motion.span>
  </AnimatePresence>
</template>

<style scoped>
.motion-coin-count {
  display: inline-block;
  color: var(--text);
}
</style>
