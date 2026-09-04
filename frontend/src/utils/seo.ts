import { SITE_DESCRIPTION, SITE_TITLE } from "../config/site";

const DOC_TITLE = SITE_TITLE;

function setMeta(name: string, content: string, attr: "name" | "property" = "name") {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.content = content;
}

export function applyDocumentSeo(
  title = DOC_TITLE,
  description = SITE_DESCRIPTION,
  robots = "index, follow",
) {
  if (typeof document === "undefined") return;
  document.title = title;
  setMeta("description", description);
  setMeta("robots", robots);
  setMeta("og:title", title, "property");
  setMeta("og:description", description, "property");
}
