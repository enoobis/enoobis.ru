import fs from "node:fs";
import path from "node:path";
import { safePathUnder } from "./security.js";

const UPLOAD_ROOT = path.resolve(process.env.UPLOADS_DIR ?? "./data/uploads");

export const UPLOAD_SUBDIRS = [
  "avatars",
  "blog",
  "chat",
  "course-lectures",
  "course-icons",
  "library-covers",
  "wallpapers",
  "shop-avatars",
  "shop-items",
  "micro",
  "submissions",
  "news",
];

/**
 * @param {string} url
 * @param {readonly string[]} allowedSubdirs
 * @returns {string | null}
 */
export function safeResolveUploadUrl(url, allowedSubdirs) {
  const m = String(url ?? "").trim().match(/^\/uploads\/([a-z0-9-]+)\/([^/]+)$/i);
  if (!m) return null;
  const sub = m[1];
  const file = m[2];
  if (!allowedSubdirs.includes(sub)) return null;
  if (file.includes("..")) return null;
  return safePathUnder(path.join(UPLOAD_ROOT, sub), file);
}

/**
 * @param {string} url
 * @param {readonly string[]} [allowedSubdirs]
 */
export function unlinkUploadUrl(url, allowedSubdirs = UPLOAD_SUBDIRS) {
  const abs = safeResolveUploadUrl(url, allowedSubdirs);
  if (!abs) return;
  try {
    fs.unlinkSync(abs);
  } catch {
    /* ignore */
  }
}

export { UPLOAD_ROOT };
