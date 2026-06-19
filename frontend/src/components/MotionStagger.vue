<script setup lang="ts">
import { motion } from "motion-v";
import { listContainer } from "../utils/motionPresets";
import { useLiteMotion } from "../utils/reducedMotion";

defineOptions({ inheritAttrs: false });

defineProps<{
  listKey?: string;
}>();

const motionLite = useLiteMotion();
</script>

<template>
  <ul v-if="motionLite" class="motion-stagger" v-bind="$attrs">
    <slot />
  </ul>
  <motion.ul
    v-else
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
