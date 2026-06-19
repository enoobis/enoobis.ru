<script setup lang="ts">
import { motion } from "motion-v";
import { cardHover, cardTap, listItem, pressHover, pressTap } from "../utils/motionPresets";

const props = withDefaults(
  defineProps<{
    as?: "li" | "div";
    interactive?: boolean;
  }>(),
  { as: "li", interactive: true },
);

const hover = props.interactive ? cardHover : pressHover;
const tap = props.interactive ? cardTap : pressTap;
</script>

<template>
  <motion.li
    v-if="as === 'li'"
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
