<script setup lang="ts">
import { RouterLink } from "vue-router";
import AppIcon from "./AppIcon.vue";

withDefaults(
  defineProps<{
    to?: string;
    href?: string;
    forward?: boolean;
  }>(),
  { forward: false },
);
</script>

<template>
  <RouterLink v-if="to" :to="to" class="back-link" :class="{ 'back-link--fwd': forward }">
    <AppIcon v-if="!forward" name="back" :size="22" />
    <span v-if="$slots.default"><slot /></span>
    <AppIcon v-if="forward" name="forward" :size="22" />
  </RouterLink>
  <a
    v-else-if="href"
    :href="href"
    class="back-link"
    :class="{ 'back-link--fwd': forward }"
    target="_blank"
    rel="noopener noreferrer"
  >
    <AppIcon v-if="!forward" name="back" :size="22" />
    <span v-if="$slots.default"><slot /></span>
    <AppIcon v-if="forward" name="forward" :size="22" />
  </a>
  <button v-else type="button" class="back-link" :class="{ 'back-link--fwd': forward }">
    <AppIcon v-if="!forward" name="back" :size="22" />
    <span v-if="$slots.default"><slot /></span>
    <AppIcon v-if="forward" name="forward" :size="22" />
  </button>
</template>
