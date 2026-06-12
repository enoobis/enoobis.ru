import fs from "node:fs";
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

/** mp4 container: bytes 4–7 are "ftyp" */
export function verifyMp4Video(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  if (ext !== ".mp4") return false;
  try {
    return readFileHead(absPath, 8).toString("ascii", 4, 8) === "ftyp";
  } catch {
    return false;
  }
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

function readFileHead(absPath, bytes = 8) {
  const fd = fs.openSync(absPath, "r");
  try {
    const buf = Buffer.alloc(bytes);
    fs.readSync(fd, buf, 0, bytes, 0);
    return buf;
  } finally {
    fs.closeSync(fd);
  }
}

/** Real PDF files start with %PDF (sharp often fails on valid PDFs). */
function hasPdfMagic(absPath) {
  try {
    return readFileHead(absPath, 5).toString("utf8").startsWith("%PDF");
  } catch {
    return false;
  }
}

/** EPUB is a zip archive (PK). */
function hasEpubMagic(absPath) {
  try {
    const head = readFileHead(absPath, 2);
    return head[0] === 0x50 && head[1] === 0x4b;
  } catch {
    return false;
  }
}

export async function verifyLibraryBook(absPath, declaredMime) {
  const ext = path.extname(absPath).toLowerCase();
  const mime = String(declaredMime ?? "").toLowerCase();
  if (ext === ".pdf" || mime.includes("pdf")) {
    if (hasPdfMagic(absPath)) return true;
    const p = await probeFileFormats(absPath, new Set(["pdf"]));
    return p.ok;
  }
  if (ext === ".epub" || mime.includes("epub")) {
    return hasEpubMagic(absPath);
  }
  return false;
}

export const LIBRARY_ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/x-pdf",
  "application/epub+zip",
  "application/octet-stream",
  "binary/octet-stream",
]);
