import { SITE_TITLE } from "../config/site";

export function applyDocumentSeo(title = SITE_TITLE) {
  if (typeof document === "undefined") return;
  document.title = title;
}
