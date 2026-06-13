import path from "node:path";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".m4v"]);

const IMAGE_MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};

const VIDEO_MIME = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
};

/**
 * @param {string | null | undefined} mime
 * @param {string | null | undefined} originalName
 * @returns {"pdf" | "image" | "video" | null}
 */
export function previewKind(mime, originalName) {
  const m = String(mime ?? "").toLowerCase();
  const ext = path.extname(String(originalName ?? "")).toLowerCase();
  if (m.includes("pdf") || ext === ".pdf") return "pdf";
  if (m.startsWith("image/") || IMAGE_EXT.has(ext)) return "image";
  if (m.startsWith("video/") || VIDEO_EXT.has(ext)) return "video";
  return null;
}

/**
 * @param {"pdf" | "image" | "video"} kind
 * @param {string | null | undefined} mime
 * @param {string | null | undefined} originalName
 */
export function previewMime(kind, mime, originalName) {
  const stored = String(mime ?? "").trim();
  if (stored && stored !== "application/octet-stream") return stored;
  const ext = path.extname(String(originalName ?? "")).toLowerCase();
  if (kind === "pdf") return "application/pdf";
  if (kind === "image") return IMAGE_MIME[ext] ?? "image/jpeg";
  if (kind === "video") return VIDEO_MIME[ext] ?? "video/mp4";
  return "application/octet-stream";
}
