import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { marked } from "marked";
import type { Tokens } from "marked";

import "highlight.js/styles/github-dark.min.css";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("zsh", bash);
hljs.registerLanguage("c", c);
hljs.registerLanguage("h", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("cxx", cpp);
hljs.registerLanguage("css", css);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("md", markdown);
hljs.registerLanguage("plaintext", plaintext);
hljs.registerLanguage("text", plaintext);
hljs.registerLanguage("txt", plaintext);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("rs", rust);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("vue", xml);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("yml", yaml);

const HL_AUTO_SUBSET = Object.keys(hljs.listLanguages());

marked.setOptions({
  gfm: true,
  breaks: true,
});

function safeFenceLang(lang: string | undefined): string | undefined {
  const t = lang?.trim().toLowerCase();
  if (!t || t.length > 40) return undefined;
  if (!/^[a-z0-9+#.-]+$/.test(t)) return undefined;
  return t;
}

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(String(url ?? "").trim());
}

function safeMediaSrc(url: string): string | null {
  const u = String(url ?? "").trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (/^\/uploads\/[a-z0-9-]+\/[^/\s]+$/i.test(u)) return u;
  return null;
}

marked.use({
  renderer: {
    code({ text, lang }: Tokens.Code) {
      const name = safeFenceLang(lang);
      try {
        if (name && hljs.getLanguage(name)) {
          const { value } = hljs.highlight(text, { language: name });
          return `<pre><code class="hljs language-${name}">${value}</code></pre>\n`;
        }
      } catch {
        /* fall through */
      }
      const { value } = hljs.highlightAuto(text, HL_AUTO_SUBSET);
      return `<pre><code class="hljs">${value}</code></pre>\n`;
    },
    image({ href, title, text }: Tokens.Image) {
      const src = safeMediaSrc(href);
      if (!src) return escapeHtmlText(text || href || "");
      if (isVideoUrl(src)) {
        return `<video class="md-video" src="${escapeHtmlAttr(src)}" controls playsinline loop muted></video>\n`;
      }
      const alt = escapeHtmlAttr(text || "");
      const titleAttr = title ? ` title="${escapeHtmlAttr(title)}"` : "";
      return `<img src="${escapeHtmlAttr(src)}" alt="${alt}"${titleAttr} loading="lazy" />\n`;
    },
  },
});

function convertLegacyVideoLines(md: string): string {
  return md.replace(
    /(^|\n)((?:https?:\/\/\S+|\/uploads\/\S+)\.(?:mp4|webm|mov|m4v))(\n|$)/gi,
    (_m, pre: string, url: string, post: string) => `${pre}![video](${url})${post}`,
  );
}

function convertLegacyImageLines(md: string): string {
  return md.replace(
    /(^|\n)(https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp)|\/uploads\/\S+\.(?:png|jpg|jpeg|gif|webp))(\n|$)/gi,
    (_m, pre: string, url: string, post: string) => `${pre}![image](${url})${post}`,
  );
}

export function renderMarkdown(md: string): string {
  const normalized = convertLegacyImageLines(convertLegacyVideoLines(md ?? ""));
  const html = marked.parse(normalized);
  const asString = typeof html === "string" ? html : "";
  return DOMPurify.sanitize(asString, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["video"],
    ADD_ATTR: ["controls", "playsinline", "loop", "muted", "preload", "src", "class"],
  });
}
