<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { tokenizeRich } from "../utils/richText";

const props = defineProps<{ text: string }>();
const tokens = computed(() => tokenizeRich(props.text));
</script>

<template>
  <span class="rich">
    <template v-for="(t, i) in tokens" :key="i">
      <RouterLink
        v-if="t.kind === 'tag'"
        :to="{ path: '/microblogs', query: { q: `#${t.value}` } }"
        class="r-tag"
        @click.stop
      >#{{ t.value }}</RouterLink>
      <RouterLink
        v-else-if="t.kind === 'mention'"
        :to="`/u/${t.value}`"
        class="r-mention"
        @click.stop
      >@{{ t.value }}</RouterLink>
      <a
        v-else-if="t.kind === 'link'"
        :href="t.href"
        target="_blank"
        rel="noopener noreferrer"
        class="r-link"
        @click.stop
      >{{ t.label }}</a>
      <template v-else>{{ t.value }}</template>
    </template>
  </span>
</template>

<style scoped>
.rich {
  white-space: pre-wrap;
  word-wrap: break-word;
}
.r-tag,
.r-mention {
  color: var(--text);
  border-bottom: 1px dotted var(--border);
}
.r-tag:hover,
.r-mention:hover {
  border-bottom-color: var(--text);
  text-decoration: none;
}
.r-link {
  color: var(--text);
  border-bottom: 1px solid var(--border);
}
.r-link:hover {
  border-bottom-color: var(--text);
  text-decoration: none;
}
</style>
