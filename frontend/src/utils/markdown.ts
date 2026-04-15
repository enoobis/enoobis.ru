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
  },
});

function convertLegacyImageLines(md: string): string {
  return md.replace(
    /(^|\n)(https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp)|\/uploads\/\S+\.(?:png|jpg|jpeg|gif|webp))(\n|$)/gi,
    (_m, pre: string, url: string, post: string) => `${pre}![image](${url})${post}`,
  );
}

export function renderMarkdown(md: string): string {
  const normalized = convertLegacyImageLines(md ?? "");
  const html = marked.parse(normalized);
  const asString = typeof html === "string" ? html : "";
  return DOMPurify.sanitize(asString, { USE_PROFILES: { html: true } });
}
