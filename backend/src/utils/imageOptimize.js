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

const APNG_ACTL_SIG = Buffer.from([0, 0, 0, 8, 0x61, 0x63, 0x54, 0x4c]);

/** @param {Buffer} buf */
function pngHasApngActl(buf) {
  if (buf.length < 16 || buf.readUInt32BE(0) !== 0x89504e47) return false;
  if (buf.indexOf(APNG_ACTL_SIG) >= 0) return true;
  let o = 8;
  while (o + 12 <= buf.length) {
    const len = buf.readUInt32BE(o);
    if (len < 0 || o + 12 + len + 4 > buf.length) break;
    const type = buf.toString("ascii", o + 4, o + 8);
    if (type === "acTL") return true;
    o += 12 + len + 4;
  }
  return false;
}

/**
 * @param {string} absPath
 */
async function isAnimatedFrameSource(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  if (ext === ".gif") return true;
  let buf;
  try {
    buf = await fs.promises.readFile(absPath);
  } catch {
    return false;
  }
  if (ext === ".png" && pngHasApngActl(buf)) return true;
  try {
    const meta = await sharp(absPath, { failOn: "none", animated: true }).metadata();
    return (meta.pages ?? 1) > 1;
  } catch {
    return false;
  }
}

/**
 * @param {string} absPath
 * @param {{ maxWidth: number, maxHeight: number, quality: number, alphaQuality?: number }} opts
 * @returns {Promise<{ ok: true, filename: string, animated: boolean } | { ok: false, filename: string, animated?: boolean }>}
 */
async function optimizeShopFrameFile(absPath, opts) {
  const baseName = path.basename(absPath);
  const ext = path.extname(absPath).toLowerCase();
  const stem = path.basename(absPath, ext);
  const animated = await isAnimatedFrameSource(absPath);

  if (animated) {
    const outFilename = `${stem}.webp`;
    const outAbs = path.join(path.dirname(absPath), outFilename);
    try {
      const meta = await sharp(absPath, { failOn: "none", animated: true }).metadata();
      let pipeline = sharp(absPath, { failOn: "none", animated: true }).rotate();
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
      if (meta.loop !== undefined) webpOpts.loop = meta.loop;
      await pipeline.webp(webpOpts).toFile(outAbs);
      const outMeta = await sharp(outAbs, { failOn: "none", animated: true }).metadata();
      if ((outMeta.pages ?? 1) < 2) throw new Error("animated output has one frame");
      if (absPath !== outAbs && fs.existsSync(absPath)) fs.unlinkSync(absPath);
      return { ok: true, filename: outFilename, animated: true };
    } catch {
      try {
        if (fs.existsSync(outAbs)) fs.unlinkSync(outAbs);
      } catch {
        /* ignore */
      }
      if (ext === ".png" && (await fs.promises.readFile(absPath).then(pngHasApngActl).catch(() => false))) {
        return { ok: false, filename: baseName, animated: true };
      }
      return { ok: false, filename: baseName };
    }
  }

  const outFilename = `${stem}.webp`;
  const outAbs = path.join(path.dirname(absPath), outFilename);
  try {
    const meta = await sharp(absPath, { failOn: "none" }).metadata();
    const fmt = meta.format;
    if (!fmt || fmt === "svg") {
      return { ok: false, filename: baseName };
    }
    let pipeline = sharp(absPath, { failOn: "none" }).rotate();
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
    if (absPath !== outAbs && fs.existsSync(absPath)) fs.unlinkSync(absPath);
    return { ok: true, filename: outFilename, animated: false };
  } catch {
    try {
      if (fs.existsSync(outAbs)) fs.unlinkSync(outAbs);
    } catch {
      /* ignore */
    }
    return { ok: false, filename: baseName };
  }
}

/**
 * @param {string} absPath
 * @param {keyof typeof PRESETS} presetKey
 * @returns {Promise<{ ok: true, filename: string, animated?: boolean } | { ok: false, filename: string, animated?: boolean }>}
 */
export async function optimizeUploadedFile(absPath, presetKey) {
  if (presetKey === "shop_frame") {
    return optimizeShopFrameFile(absPath, PRESETS.shop_frame);
  }

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
