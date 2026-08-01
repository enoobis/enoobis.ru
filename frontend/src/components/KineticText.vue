<script setup lang="ts">
import { computed } from "vue";
import { useLiteMotion } from "../utils/reducedMotion";

const props = defineProps<{ text: string }>();
const motionLite = useLiteMotion();
const words = computed(() => props.text.split(/\s+/).filter(Boolean));
</script>

<template>
  <span v-if="motionLite" class="kinetic kinetic--static">{{ text }}</span>
  <span v-else class="kinetic" :aria-label="text">
    <span v-for="(w, i) in words" :key="`${w}-${i}`" class="k-word" aria-hidden="true">
      <span class="k-inner" :style="{ animationDelay: `${Math.min(i * 45, 360)}ms` }">{{ w }}</span>
    </span>
  </span>
</template>

<style scoped>
.kinetic {
  display: inline;
}

.k-word {
  display: inline-block;
  overflow: hidden;
  vertical-align: bottom;
  padding-bottom: 0.08em;
  margin-bottom: -0.08em;
  margin-right: 0.28em;
}

.k-word:last-child {
  margin-right: 0;
}

.k-inner {
  display: inline-block;
  transform: translateY(110%);
  animation: kinetic-rise var(--dur-4) var(--ease-snap) forwards;
  will-change: transform;
}

@keyframes kinetic-rise {
  to {
    transform: translateY(0);
  }
}
</style>
