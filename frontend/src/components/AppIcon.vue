<script setup lang="ts">
import { computed } from "vue";
import { doodleIconData, type DoodleIconName } from "../icons/doodleIconData";

const props = withDefaults(
  defineProps<{
    name: DoodleIconName;
    size?: number;
  }>(),
  { size: 16 },
);

const icon = computed(() => doodleIconData[props.name]);
</script>

<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    :viewBox="icon.viewBox"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path v-for="(d, i) in icon.paths" :key="i" :d="d" />
  </svg>
</template>

<style scoped>
.app-icon {
  display: block;
  flex-shrink: 0;
}
</style>
