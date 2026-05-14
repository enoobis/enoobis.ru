import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import { nowIso, run, get } from "../db.js";
import { authRequired } from "../auth.js";
import { isRasterImageMimetype, optimizeUploadedFile } from "../utils/imageOptimize.js";

const router = express.Router();

const UPLOAD_ROOT = path.resolve(process.env.UPLOADS_DIR ?? "./data/uploads");
const SUBDIRS = ["avatars", "blog", "course-lectures", "wallpapers", "shop-avatars", "shop-items"];
for (const d of SUBDIRS) fs.mkdirSync(path.join(UPLOAD_ROOT, d), { recursive: true });

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function imageFileFilter(_req, file, cb) {
  if (IMAGE_MIMES.has(file.mimetype)) cb(null, true);
  else cb(new Error("only jpeg, png, gif, webp"));
}

function uploadSingle(upload, field) {
  return (req, res, next) => {
    upload.single(field)(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message ?? "upload error" });
      next();
    });
  };
}

function makeStorage(subdir) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_ROOT, subdir)),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || ".bin").toLowerCase();
      cb(null, `${req.user?.id ?? "anon"}-${uuidv4().replace(/-/g, "")}${ext}`);
    },
  });
}

const avatarUpload = multer({
  storage: makeStorage("avatars"),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});
const blogUpload = multer({
  storage: makeStorage("blog"),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});
const lectureUpload = multer({
  storage: makeStorage("course-lectures"),
  limits: { fileSize: 32 * 1024 * 1024 },
});

router.post("/me/avatar", authRequired, uploadSingle(avatarUpload, "file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  if (isRasterImageMimetype(req.file.mimetype)) {
    const r = await optimizeUploadedFile(req.file.path, "avatar");
    if (r.ok) req.file.filename = r.filename;
  }
  const url = `/uploads/avatars/${req.file.filename}`;
  run("UPDATE users SET avatar_url = ? WHERE id = ?", url, req.user.id);
  return res.json({ avatar_url: url });
});

router.post("/blog/upload-image", authRequired, uploadSingle(blogUpload, "file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  if (isRasterImageMimetype(req.file.mimetype)) {
    const r = await optimizeUploadedFile(req.file.path, "blog");
    if (r.ok) req.file.filename = r.filename;
  }
  const url = `/uploads/blog/${req.file.filename}`;
  const postId = req.body?.post_id ? String(req.body.post_id).trim() : "";
  if (postId) {
    const post = get("SELECT id, author_id FROM blog_posts WHERE id = ?", postId);
    if (
      post &&
      (post.author_id === req.user.id || req.user.role === "admin")
    ) {
      run(
        "INSERT INTO blog_post_images (id, post_id, uploader_user_id, url, created_at) VALUES (?, ?, ?, ?, ?)",
        uuidv4(),
        postId,
        req.user.id,
        url,
        nowIso(),
      );
    }
  }
  return res.json({ url });
});

router.post(
  "/courses/:id/lectures/upload",
  authRequired,
  lectureUpload.single("file"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "no file" });
    if (isRasterImageMimetype(req.file.mimetype)) {
      const r = await optimizeUploadedFile(req.file.path, "lecture");
      if (r.ok) req.file.filename = r.filename;
    }
    const url = `/uploads/course-lectures/${req.file.filename}`;
    return res.json({ url, file_name: req.file.originalname });
  },
);

const wallpaperUpload = multer({
  storage: makeStorage("wallpapers"),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

const SHOP_KINDS = new Set(["avatar", "frame", "wallpaper", "cover"]);

const shopItemUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_ROOT, "shop-items")),
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || ".bin").toLowerCase();
      cb(null, `shop-${uuidv4().replace(/-/g, "")}${ext}`);
    },
  }),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

router.post("/me/wallpaper", authRequired, uploadSingle(wallpaperUpload, "file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  if (isRasterImageMimetype(req.file.mimetype) && req.file.mimetype !== "image/gif") {
    const r = await optimizeUploadedFile(req.file.path, "wallpaper");
    if (r.ok) req.file.filename = r.filename;
  }
  const url = `/uploads/wallpapers/${req.file.filename}`;
  run("UPDATE users SET wallpaper_url = ? WHERE id = ?", url, req.user.id);
  return res.json({ wallpaper_url: url });
});

router.delete("/me/wallpaper", authRequired, (req, res) => {
  const row = get("SELECT wallpaper_url FROM users WHERE id = ?", req.user.id);
  if (row?.wallpaper_url?.startsWith("/uploads/wallpapers/")) {
    try {
      fs.unlinkSync(path.join(UPLOAD_ROOT, row.wallpaper_url.replace(/^\/uploads\//, "")));
    } catch { /* ignore */ }
  }
  run("UPDATE users SET wallpaper_url = '' WHERE id = ?", req.user.id);
  return res.json({ ok: true });
});

router.post("/admin/shop/items", authRequired, uploadSingle(shopItemUpload, "file"), async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "forbidden" });
  if (!req.file) return res.status(400).json({ error: "no file" });
  const kind = String(req.body?.kind ?? "avatar").trim();
  if (!SHOP_KINDS.has(kind)) return res.status(400).json({ error: "bad kind" });
  const name = String(req.body?.name ?? "").trim() || req.file.originalname;
  const price = Math.max(0, parseInt(req.body?.price ?? "0", 10) || 0);
  const rawStock = req.body?.stock_limit;
  /** @type {number | null} */
  let stockLimit = null;
  if (rawStock !== undefined && rawStock !== null && String(rawStock).trim() !== "") {
    const n = parseInt(String(rawStock), 10);
    if (!Number.isFinite(n) || n < 1) return res.status(400).json({ error: "bad stock_limit" });
    stockLimit = n;
  }
  const isAnimated = req.file.mimetype === "image/gif" ? 1 : 0;
  let presetKey = "avatar";
  if (kind === "frame") presetKey = "shop_frame";
  else if (kind === "wallpaper") presetKey = "shop_wallpaper";
  else if (kind === "cover") presetKey = "shop_cover";
  if (isRasterImageMimetype(req.file.mimetype) && req.file.mimetype !== "image/gif") {
    const r = await optimizeUploadedFile(req.file.path, /** @type {"avatar"|"shop_frame"|"shop_wallpaper"|"shop_cover"} */ (presetKey));
    if (r.ok) req.file.filename = r.filename;
  }
  const url = `/uploads/shop-items/${req.file.filename}`;
  const id = uuidv4();
  run(
    "INSERT INTO shop_items (id, kind, name, url, price, is_animated, stock_limit, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    kind,
    name,
    url,
    price,
    isAnimated,
    stockLimit,
    req.user.id,
    nowIso(),
  );
  return res.json({ ok: true, id, url, name, price, kind, is_animated: isAnimated, stock_limit: stockLimit });
});

router.delete("/admin/shop/items/:id", authRequired, (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "forbidden" });
  const row = get("SELECT url FROM shop_items WHERE id = ?", req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  run("DELETE FROM user_owned_shop_items WHERE item_id = ?", req.params.id);
  if (row.url?.startsWith("/uploads/shop-items/") || row.url?.startsWith("/uploads/shop-avatars/")) {
    try {
      fs.unlinkSync(path.join(UPLOAD_ROOT, row.url.replace(/^\/uploads\//, "")));
    } catch {
      /* ignore */
    }
  }
  run("DELETE FROM shop_items WHERE id = ?", req.params.id);
  return res.json({ ok: true });
});

export default router;
