<script setup lang="ts">
import { motion } from "motion-v";
import { listContainer } from "../utils/motionPresets";

defineOptions({ inheritAttrs: false });

defineProps<{
  listKey?: string;
}>();
</script>

<template>
  <motion.ul
    :key="listKey"
    class="motion-stagger"
    v-bind="$attrs"
    initial="hidden"
    animate="visible"
    :variants="listContainer"
  >
    <slot />
  </motion.ul>
</template>

<style scoped>
.motion-stagger {
  list-style: none;
  margin: 0;
  padding: 0;
}
</style>
