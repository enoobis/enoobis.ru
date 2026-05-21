import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const PRESETS = {
  blog: { maxWidth: 1920, maxHeight: 1920, quality: 82 },
  micro: { maxWidth: 1200, maxHeight: 1200, quality: 80 },
  chat: { maxWidth: 1280, maxHeight: 1280, quality: 80 },
  avatar: { maxWidth: 512, maxHeight: 512, quality: 82 },
  lecture: { maxWidth: 1920, maxHeight: 1920, quality: 82 },
  course_icon: { maxWidth: 256, maxHeight: 256, quality: 82 },
  submission: { maxWidth: 1600, maxHeight: 1600, quality: 80 },
  wallpaper: { maxWidth: 1920, maxHeight: 1080, quality: 82 },
  shop_wallpaper: { maxWidth: 1920, maxHeight: 1080, quality: 82 },
  shop_cover: { maxWidth: 1200, maxHeight: 480, quality: 82 },
  shop_frame: { maxWidth: 512, maxHeight: 512, quality: 90, alphaQuality: 100 },
};

/**
 * @param {string} absPath
 * @param {keyof typeof PRESETS} presetKey
 * @returns {Promise<{ ok: true, filename: string } | { ok: false, filename: string }>}
 */
export async function optimizeUploadedFile(absPath, presetKey) {
  const baseName = path.basename(absPath);
  const opts = PRESETS[presetKey] ?? PRESETS.micro;
  const ext = path.extname(absPath).toLowerCase();
  const stem = path.basename(absPath, ext);
  const outFilename = `${stem}.webp`;
  const outAbs = path.join(path.dirname(absPath), outFilename);

  try {
    const probe = sharp(absPath, { failOn: "none" });
    const meta = await probe.metadata();
    const fmt = meta.format;
    if (!fmt || fmt === "svg") {
      return { ok: false, filename: baseName };
    }

    let pipeline =
      (meta.pages ?? 1) > 1
        ? sharp(absPath, { failOn: "none", pages: 1 })
        : sharp(absPath, { failOn: "none" });

    pipeline = pipeline.rotate();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w > opts.maxWidth || h > opts.maxHeight) {
      pipeline = pipeline.resize(opts.maxWidth, opts.maxHeight, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    const webpOpts = { quality: opts.quality, effort: 4 };
    if (typeof opts.alphaQuality === "number") webpOpts.alphaQuality = opts.alphaQuality;
    await pipeline.webp(webpOpts).toFile(outAbs);

    if (absPath !== outAbs && fs.existsSync(absPath)) {
      fs.unlinkSync(absPath);
    }
    return { ok: true, filename: outFilename };
  } catch {
    try {
      if (fs.existsSync(outAbs)) fs.unlinkSync(outAbs);
    } catch {
      /* ignore */
    }
    return { ok: false, filename: baseName };
  }
}

export function isRasterImageMimetype(mime) {
  if (!mime || typeof mime !== "string") return false;
  return ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mime);
}
