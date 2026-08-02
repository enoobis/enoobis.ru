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
}

/* гост: times new roman 14pt, по ширине, красная строка 1.25 см, интервал 1.5 */
.markdown-body.doc {
  font-family: "Times New Roman", Times, serif;
  font-size: 14pt;
  line-height: 1.5;
  text-align: justify;
  hyphens: auto;
}
.markdown-body.doc :deep(p) {
  margin: 0;
  text-indent: 1.25cm;
}
.markdown-body.doc :deep(p + p) {
  margin-top: 0.2rem;
}
.markdown-body.doc :deep(li p),
.markdown-body.doc :deep(blockquote p) {
  text-indent: 0;
}
.markdown-body.doc :deep(ul),
.markdown-body.doc :deep(ol) {
  padding-left: 1.25cm;
}
.markdown-body.doc :deep(h1),
.markdown-body.doc :deep(h2),
.markdown-body.doc :deep(h3) {
  font-family: inherit;
  font-weight: 700;
  letter-spacing: 0;
  text-align: left;
  text-indent: 1.25cm;
  margin: 1.4rem 0 0.6rem;
}
.markdown-body.doc :deep(h1) {
  font-size: 16pt;
}
.markdown-body.doc :deep(h2) {
  font-size: 15pt;
}
.markdown-body.doc :deep(h3) {
  font-size: 14pt;
}
.markdown-body.doc :deep(pre),
.markdown-body.doc :deep(code) {
  font-size: 0.85em;
  text-align: left;
  text-indent: 0;
  hyphens: none;
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

/* подсветка кода — монохром, без цветных токенов */
.markdown-body :deep(.hljs) {
  background: transparent;
  color: var(--text);
}
.markdown-body :deep(.hljs-comment),
.markdown-body :deep(.hljs-quote),
.markdown-body :deep(.hljs-meta) {
  color: var(--muted);
  font-style: italic;
}
.markdown-body :deep(.hljs-keyword),
.markdown-body :deep(.hljs-selector-tag),
.markdown-body :deep(.hljs-built_in),
.markdown-body :deep(.hljs-name),
.markdown-body :deep(.hljs-title),
.markdown-body :deep(.hljs-section),
.markdown-body :deep(.hljs-strong) {
  color: var(--text);
  font-weight: 600;
}
.markdown-body :deep(.hljs-string),
.markdown-body :deep(.hljs-number),
.markdown-body :deep(.hljs-literal),
.markdown-body :deep(.hljs-symbol),
.markdown-body :deep(.hljs-attr),
.markdown-body :deep(.hljs-attribute),
.markdown-body :deep(.hljs-variable),
.markdown-body :deep(.hljs-type),
.markdown-body :deep(.hljs-params),
.markdown-body :deep(.hljs-regexp),
.markdown-body :deep(.hljs-template-variable),
.markdown-body :deep(.hljs-selector-class),
.markdown-body :deep(.hljs-selector-id),
.markdown-body :deep(.hljs-tag),
.markdown-body :deep(.hljs-emphasis),
.markdown-body :deep(.hljs-addition),
.markdown-body :deep(.hljs-deletion),
.markdown-body :deep(.hljs-bullet),
.markdown-body :deep(.hljs-link),
.markdown-body :deep(.hljs-doctag) {
  color: var(--muted);
  font-weight: inherit;
  font-style: normal;
  text-decoration: none;
  background: transparent;
}
</style>
