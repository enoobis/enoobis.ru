<script setup lang="ts">
import { computed } from "vue";
import { renderMarkdown } from "../utils/markdown";

const props = defineProps<{ text: string; variant?: "doc" }>();
const html = computed(() => renderMarkdown(props.text));
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

/* лекции — режим чтения: шрифт интерфейса, крупнее основного текста */
.markdown-body.doc {
  font-size: 1.12rem;
  line-height: 1.75;
}
.markdown-body.doc :deep(p) {
  margin: 0 0 1rem;
}
.markdown-body.doc :deep(ul),
.markdown-body.doc :deep(ol) {
  margin: 1rem 0;
  padding-left: 1.4rem;
}
.markdown-body.doc :deep(li) {
  margin: 0.35rem 0;
}
.markdown-body.doc :deep(h1),
.markdown-body.doc :deep(h2),
.markdown-body.doc :deep(h3) {
  margin: 2rem 0 0.75rem;
}
.markdown-body.doc :deep(h1) {
  font-size: 1.5rem;
}
.markdown-body.doc :deep(h2) {
  font-size: 1.28rem;
}
.markdown-body.doc :deep(h3) {
  font-size: 1.12rem;
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
