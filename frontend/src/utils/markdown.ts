import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: true,
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
