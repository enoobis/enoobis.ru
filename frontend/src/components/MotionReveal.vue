<script setup lang="ts">
import { computed } from "vue";
import { motion } from "motion-v";
import { revealHidden, revealHiddenLite, revealVisible, revealVisibleLite } from "../utils/motionPresets";
import { useLiteMotion } from "../utils/reducedMotion";

const props = withDefaults(
  defineProps<{
    as?: "div" | "span" | "h1" | "h2" | "p";
    delay?: number;
  }>(),
  { as: "div", delay: 0 },
);

defineOptions({ inheritAttrs: false });

const motionLite = useLiteMotion();
const hidden = computed(() => (motionLite.value ? revealHiddenLite : revealHidden));
const visible = computed(() => (motionLite.value ? revealVisibleLite : revealVisible));
const transition = computed(() => ({ ...visible.value.transition, delay: props.delay }));
</script>

<template>
  <component v-if="motionLite" :is="as" v-bind="$attrs">
    <slot />
  </component>
  <motion.h1
    v-else-if="as === 'h1'"
    v-bind="$attrs"
    :initial="hidden"
    :while-in-view="visible"
    :viewport="{ once: true, margin: '-48px 0px' }"
    :transition="transition"
  >
    <slot />
  </motion.h1>
  <motion.h2
    v-else-if="as === 'h2'"
    v-bind="$attrs"
    :initial="hidden"
    :while-in-view="visible"
    :viewport="{ once: true, margin: '-48px 0px' }"
    :transition="transition"
  >
    <slot />
  </motion.h2>
  <motion.p
    v-else-if="as === 'p'"
    v-bind="$attrs"
    :initial="hidden"
    :while-in-view="visible"
    :viewport="{ once: true, margin: '-48px 0px' }"
    :transition="transition"
  >
    <slot />
  </motion.p>
  <motion.span
    v-else-if="as === 'span'"
    v-bind="$attrs"
    :initial="hidden"
    :while-in-view="visible"
    :viewport="{ once: true, margin: '-48px 0px' }"
    :transition="transition"
  >
    <slot />
  </motion.span>
  <motion.div
    v-else
    v-bind="$attrs"
    :initial="hidden"
    :while-in-view="visible"
    :viewport="{ once: true, margin: '-48px 0px' }"
    :transition="transition"
  >
    <slot />
  </motion.div>
</template>
