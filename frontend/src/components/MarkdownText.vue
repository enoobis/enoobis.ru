<script setup lang="ts">
import { computed } from "vue";
import { renderMarkdown } from "../utils/markdown";

const props = defineProps<{ text: string }>();
const html = computed(() => renderMarkdown(props.text));
</script>

<template>
  <div class="markdown-body" v-html="html" />
</template>

<style scoped>
.markdown-body {
  line-height: 1.7;
  min-width: 0;
}
.markdown-body :deep(> *:first-child) {
  margin-top: 0;
}
.markdown-body :deep(> *:last-child) {
  margin-bottom: 0;
}
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 1.5rem 0 0.6rem;
}
.markdown-body :deep(h1) {
  font-size: 1.3rem;
}
.markdown-body :deep(h2) {
  font-size: 1.15rem;
}
.markdown-body :deep(h3) {
  font-size: 1.02rem;
}
.markdown-body :deep(p) {
  margin: 0.6rem 0;
}
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0.6rem 0;
  padding-left: 1.2rem;
}
.markdown-body :deep(li) {
  margin: 0.2rem 0;
}
.markdown-body :deep(img),
.markdown-body :deep(video) {
  display: block;
  max-width: 100%;
  border-radius: var(--radius);
  margin: 1rem 0;
}
.markdown-body :deep(pre) {
  margin: 1rem 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow-x: auto;
  background: var(--surface);
}
.markdown-body :deep(pre code.hljs) {
  border-radius: var(--radius);
}
.markdown-body :deep(code) {
  font-family: var(--mono);
  font-size: 0.9em;
}
.markdown-body :deep(p code),
.markdown-body :deep(li code) {
  padding: 0.1em 0.3em;
  border-radius: 4px;
  background: var(--surface2);
}
.markdown-body :deep(blockquote) {
  margin: 1rem 0;
  padding: 0.1rem 0.9rem;
  border-left: 2px solid var(--border);
  color: var(--muted);
}
.markdown-body :deep(a) {
  color: var(--text);
  border-bottom: 1px solid var(--border);
}
.markdown-body :deep(hr) {
  margin: 1.4rem 0;
  border: none;
  border-top: 1px solid var(--border);
}
</style>
