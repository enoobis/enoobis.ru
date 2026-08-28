<script setup lang="ts">
import { AnimatePresence, motion } from "motion-v";
import { computed, onMounted, ref, watch } from "vue";
import { springPop } from "../utils/motionPresets";
import { useLiteMotion } from "../utils/reducedMotion";

const props = defineProps<{ value: number }>();

const motionLite = useLiteMotion();
const dir = ref(1);
const ready = ref(false);

watch(
  () => props.value,
  (next, prev) => {
    dir.value = next >= (prev ?? next) ? 1 : -1;
  },
);

onMounted(() => {
  requestAnimationFrame(() => {
    ready.value = true;
  });
});

const enter = computed(() =>
  ready.value ? { opacity: 0, y: dir.value * 9 } : { opacity: 1, y: 0 },
);
const exit = computed(() => ({ opacity: 0, y: dir.value * -9 }));
</script>

<template>
  <span class="num">
    <AnimatePresence v-if="!motionLite" mode="popLayout">
      <motion.span
        :key="value"
        class="num-val"
        :initial="enter"
        :animate="{ opacity: 1, y: 0 }"
        :exit="exit"
        :transition="springPop"
      >
        {{ value }}
      </motion.span>
    </AnimatePresence>
    <span v-else class="num-val">{{ value }}</span>
  </span>
</template>

<style scoped>
.num {
  display: inline-flex;
  align-items: center;
  font-variant-numeric: tabular-nums;
}
.num-val {
  display: inline-block;
}
</style>
