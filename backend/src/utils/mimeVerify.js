import path from "node:path";
import sharp from "sharp";

const RASTER = new Set(["jpeg", "png", "gif", "webp"]);
const LECTURE = new Set([...RASTER, "pdf"]);
const LIBRARY = new Set(["pdf", "epub"]);

const MIME_BY_FORMAT = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
};

/**
 * @param {string} absPath
 * @param {Set<string>} allowedFormats
 */
export async function probeFileFormats(absPath, allowedFormats) {
  try {
    const meta = await sharp(absPath, { failOn: "none", animated: true }).metadata();
    const fmt = meta.format;
    if (!fmt) return { ok: false };
    if (!allowedFormats.has(fmt)) return { ok: false, format: fmt };
    return { ok: true, format: fmt, mime: MIME_BY_FORMAT[fmt] ?? null };
  } catch {
    return { ok: false };
  }
}

export async function verifyRasterImage(absPath) {
  return probeFileFormats(absPath, RASTER);
}

export async function verifyLectureFile(absPath, declaredMime) {
  const mime = String(declaredMime ?? "").toLowerCase();
  const ext = path.extname(absPath).toLowerCase();
  if (mime.startsWith("video/")) {
    if (mime.includes("mp4")) return ext === ".mp4";
    if (mime.includes("webm")) return ext === ".webm";
    return false;
  }
  const probe = await probeFileFormats(absPath, LECTURE);
  if (!probe.ok) return false;
  if (probe.format === "pdf") {
    return mime.includes("pdf") || mime === "application/octet-stream";
  }
  return probe.mime ? mime.startsWith("image/") : false;
}

export async function verifyLibraryBook(absPath, declaredMime) {
  if (declaredMime.includes("pdf")) {
    const p = await probeFileFormats(absPath, new Set(["pdf"]));
    return p.ok;
  }
  if (declaredMime.includes("epub") || absPath.toLowerCase().endsWith(".epub")) {
    return absPath.toLowerCase().endsWith(".epub");
  }
  return false;
}

export const LIBRARY_ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/epub+zip",
]);
