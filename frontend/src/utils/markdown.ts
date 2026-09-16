import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cmake from "highlight.js/lib/languages/cmake";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import dart from "highlight.js/lib/languages/dart";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import fsharp from "highlight.js/lib/languages/fsharp";
import go from "highlight.js/lib/languages/go";
import graphql from "highlight.js/lib/languages/graphql";
import http from "highlight.js/lib/languages/http";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import less from "highlight.js/lib/languages/less";
import lua from "highlight.js/lib/languages/lua";
import makefile from "highlight.js/lib/languages/makefile";
import markdown from "highlight.js/lib/languages/markdown";
import nginx from "highlight.js/lib/languages/nginx";
import objectivec from "highlight.js/lib/languages/objectivec";
import php from "highlight.js/lib/languages/php";
import plaintext from "highlight.js/lib/languages/plaintext";
import powershell from "highlight.js/lib/languages/powershell";
import properties from "highlight.js/lib/languages/properties";
import protobuf from "highlight.js/lib/languages/protobuf";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import scss from "highlight.js/lib/languages/scss";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import vbnet from "highlight.js/lib/languages/vbnet";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { marked } from "marked";
import type { Tokens } from "marked";
import "../assets/codeHighlight.css";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("zsh", bash);
hljs.registerLanguage("c", c);
hljs.registerLanguage("h", c);
hljs.registerLanguage("cmake", cmake);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("c++", cpp);
hljs.registerLanguage("cxx", cpp);
hljs.registerLanguage("hpp", cpp);
hljs.registerLanguage("cc", cpp);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("cs", csharp);
hljs.registerLanguage("c#", csharp);
hljs.registerLanguage("css", css);
hljs.registerLanguage("dart", dart);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("docker", dockerfile);
hljs.registerLanguage("fsharp", fsharp);
hljs.registerLanguage("fs", fsharp);
hljs.registerLanguage("f#", fsharp);
hljs.registerLanguage("go", go);
hljs.registerLanguage("golang", go);
hljs.registerLanguage("graphql", graphql);
hljs.registerLanguage("http", http);
hljs.registerLanguage("ini", ini);
hljs.registerLanguage("toml", ini);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("kotlin", kotlin);
hljs.registerLanguage("kt", kotlin);
hljs.registerLanguage("kts", kotlin);
hljs.registerLanguage("less", less);
hljs.registerLanguage("lua", lua);
hljs.registerLanguage("makefile", makefile);
hljs.registerLanguage("make", makefile);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("md", markdown);
hljs.registerLanguage("nginx", nginx);
hljs.registerLanguage("objectivec", objectivec);
hljs.registerLanguage("objc", objectivec);
hljs.registerLanguage("php", php);
hljs.registerLanguage("plaintext", plaintext);
hljs.registerLanguage("text", plaintext);
hljs.registerLanguage("txt", plaintext);
hljs.registerLanguage("powershell", powershell);
hljs.registerLanguage("ps1", powershell);
hljs.registerLanguage("properties", properties);
hljs.registerLanguage("protobuf", protobuf);
hljs.registerLanguage("proto", protobuf);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("rb", ruby);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("rs", rust);
hljs.registerLanguage("scss", scss);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("swift", swift);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("vbnet", vbnet);
hljs.registerLanguage("vb", vbnet);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("vue", xml);
hljs.registerLanguage("svg", xml);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("yml", yaml);

const HL_AUTO_SUBSET = hljs.listLanguages();

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
  if (/^\/api\/share\/[a-z0-9]+\/read$/i.test(u)) return u;
  return null;
}

type VideoFlags = {
  autoplay: boolean;
  loop: boolean;
  controls: boolean;
  muted: boolean;
};

function parseVideoFlags(alt: string, title?: string | null): VideoFlags {
  const raw = `${alt} ${title ?? ""}`.toLowerCase();
  const has = (w: string) => new RegExp(`\\b${w.replace(/-/g, "[-_]?")}\\b`).test(raw);
  const autoplay = has("autoplay");
  const unmuted = has("sound") || has("unmuted") || has("audio");
  return {
    autoplay,
    loop: has("noloop") || has("no-loop") ? false : true,
    controls: has("nocontrols") || has("no-controls") ? false : true,
    muted: unmuted ? false : true,
  };
}

function isVideoMarkdown(href: string, alt: string, title?: string | null): boolean {
  if (isVideoUrl(href)) return true;
  return /\bvideo\b/i.test(`${alt} ${title ?? ""}`);
}

function renderVideoTag(src: string, alt: string, title?: string | null): string {
  const flags = parseVideoFlags(alt, title);
  const attrs = [`class="md-video"`, `src="${escapeHtmlAttr(src)}"`, "playsinline"];
  if (flags.controls) attrs.push("controls");
  if (flags.loop) attrs.push("loop");
  if (flags.muted) attrs.push("muted");
  if (flags.autoplay) attrs.push("autoplay");
  return `<video ${attrs.join(" ")}></video>\n`;
}

marked.use({
  renderer: {
    code({ text, lang }: Tokens.Code) {
      const name = safeFenceLang(lang);
      try {
        if (name && hljs.getLanguage(name)) {
          const { value } = hljs.highlight(text, { language: name, ignoreIllegals: true });
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
      if (isVideoMarkdown(src, text, title)) {
        return renderVideoTag(src, text, title);
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
    ADD_ATTR: ["controls", "playsinline", "loop", "muted", "autoplay", "preload", "src", "class"],
  });
}
