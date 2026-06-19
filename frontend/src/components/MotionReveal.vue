<script setup lang="ts">
import { computed } from "vue";
import { motion } from "motion-v";
import { revealHidden, revealVisible } from "../utils/motionPresets";
import { prefersReducedMotion } from "../utils/reducedMotion";

const props = withDefaults(
  defineProps<{
    as?: "div" | "span" | "h1" | "h2" | "p";
    delay?: number;
  }>(),
  { as: "div", delay: 0 },
);

defineOptions({ inheritAttrs: false });

const reduced = computed(() => prefersReducedMotion());
const transition = computed(() => ({ ...revealVisible.transition, delay: props.delay }));
</script>

<template>
  <component v-if="reduced" :is="as" v-bind="$attrs">
    <slot />
  </component>
  <motion.h1
    v-else-if="as === 'h1'"
    v-bind="$attrs"
    :initial="revealHidden"
    :while-in-view="revealVisible"
    :viewport="{ once: true, margin: '-48px 0px' }"
    :transition="transition"
  >
    <slot />
  </motion.h1>
  <motion.h2
    v-else-if="as === 'h2'"
    v-bind="$attrs"
    :initial="revealHidden"
    :while-in-view="revealVisible"
    :viewport="{ once: true, margin: '-48px 0px' }"
    :transition="transition"
  >
    <slot />
  </motion.h2>
  <motion.p
    v-else-if="as === 'p'"
    v-bind="$attrs"
    :initial="revealHidden"
    :while-in-view="revealVisible"
    :viewport="{ once: true, margin: '-48px 0px' }"
    :transition="transition"
  >
    <slot />
  </motion.p>
  <motion.span
    v-else-if="as === 'span'"
    v-bind="$attrs"
    :initial="revealHidden"
    :while-in-view="revealVisible"
    :viewport="{ once: true, margin: '-48px 0px' }"
    :transition="transition"
  >
    <slot />
  </motion.span>
  <motion.div
    v-else
    v-bind="$attrs"
    :initial="revealHidden"
    :while-in-view="revealVisible"
    :viewport="{ once: true, margin: '-48px 0px' }"
    :transition="transition"
  >
    <slot />
  </motion.div>
</template>
