<script setup lang="ts">
import { computed } from "vue";
import { renderMarkdown } from "../utils/markdown";

const props = defineProps<{ text: string; variant?: "doc" }>();

/* пустые строки между пунктами списка → «рыхлый» список с <p> внутри li */
function tightenLists(md: string): string {
  return md
    .replace(/\r\n/g, "\n")
    .replace(/(\n(?:[-*]|\d+\.) [^\n]*)\n{2,}(?=(?:[-*]|\d+\.) )/g, "$1\n");
}

const html = computed(() =>
  renderMarkdown(props.variant === "doc" ? tightenLists(props.text) : props.text),
);
</script>

<template>
  <div class="markdown-body" :class="{ doc: variant === 'doc' }" v-html="html" />
</template>

<style scoped>
.markdown-body {
  line-height: 1.7;
  min-width: 0;
  overflow-wrap: break-word;
}

/* широкие таблицы не растягивают колонку */
.markdown-body :deep(table) {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  font-size: 0.9em;
}
.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--border);
  text-align: left;
}

/* лекции — как учебник: плотнее, без дыр между пунктами */
.markdown-body.doc {
  font-size: 1.05rem;
  line-height: 1.55;
}
.markdown-body.doc :deep(p) {
  margin: 0 0 0.65em;
}
.markdown-body.doc :deep(ul),
.markdown-body.doc :deep(ol) {
  margin: 0.55em 0;
  padding-left: 1.25rem;
}
.markdown-body.doc :deep(li) {
  margin: 0.12em 0;
}
.markdown-body.doc :deep(li p) {
  margin: 0;
}
.markdown-body.doc :deep(li ul),
.markdown-body.doc :deep(li ol) {
  margin: 0.2em 0;
}
.markdown-body.doc :deep(h1),
.markdown-body.doc :deep(h2),
.markdown-body.doc :deep(h3) {
  margin: 1.25rem 0 0.4rem;
}
.markdown-body.doc :deep(h1) {
  font-size: 1.35rem;
}
.markdown-body.doc :deep(h2) {
  font-size: 1.18rem;
}
.markdown-body.doc :deep(h3) {
  font-size: 1.05rem;
}
.markdown-body.doc :deep(pre),
.markdown-body.doc :deep(code) {
  font-size: 0.9em;
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
  background: transparent;
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
