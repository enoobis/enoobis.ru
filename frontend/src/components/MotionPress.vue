<script setup lang="ts">
import { motion } from "motion-v";
import { pressHover, pressTap } from "../utils/motionPresets";

withDefaults(
  defineProps<{
    as?: "button" | "div" | "a";
    disabled?: boolean;
  }>(),
  { as: "div", disabled: false },
);
</script>

<template>
  <motion.button
    v-if="as === 'button'"
    type="button"
    class="motion-press"
    :disabled="disabled"
    :while-hover="disabled ? undefined : pressHover"
    :while-tap="disabled ? undefined : pressTap"
  >
    <slot />
  </motion.button>
  <motion.a
    v-else-if="as === 'a'"
    class="motion-press"
    :while-hover="pressHover"
    :while-tap="pressTap"
  >
    <slot />
  </motion.a>
  <motion.div
    v-else
    class="motion-press"
    :while-hover="pressHover"
    :while-tap="pressTap"
  >
    <slot />
  </motion.div>
</template>

<style scoped>
.motion-press {
  display: inline-flex;
}
</style>
