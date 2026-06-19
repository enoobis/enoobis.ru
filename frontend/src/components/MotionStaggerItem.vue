<script setup lang="ts">
import { motion } from "motion-v";
import { cardHover, cardTap, listItem, pressHover, pressTap } from "../utils/motionPresets";
import { useLiteMotion } from "../utils/reducedMotion";

const props = withDefaults(
  defineProps<{
    as?: "li" | "div";
    interactive?: boolean;
  }>(),
  { as: "li", interactive: true },
);

const motionLite = useLiteMotion();
const hover = props.interactive ? cardHover : pressHover;
const tap = props.interactive ? cardTap : pressTap;
</script>

<template>
  <li v-if="motionLite && as === 'li'" class="motion-stagger-item">
    <slot />
  </li>
  <div v-else-if="motionLite" class="motion-stagger-item">
    <slot />
  </div>
  <motion.li
    v-else-if="as === 'li'"
    class="motion-stagger-item"
    :variants="listItem"
    :while-hover="interactive ? hover : undefined"
    :while-tap="interactive ? tap : undefined"
  >
    <slot />
  </motion.li>
  <motion.div
    v-else
    class="motion-stagger-item"
    :variants="listItem"
    :while-hover="interactive ? hover : undefined"
    :while-tap="interactive ? tap : undefined"
  >
    <slot />
  </motion.div>
</template>
