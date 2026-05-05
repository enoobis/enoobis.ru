import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import { all, get, nowIso, run } from "../db.js";
import { authRequired } from "../auth.js";

const router = express.Router();

const UPLOAD_ROOT = path.resolve(process.env.UPLOADS_DIR ?? "./data/uploads");
const SUBDIRS = ["avatars", "wallpapers", "blog", "course-lectures"];
for (const d of SUBDIRS) fs.mkdirSync(path.join(UPLOAD_ROOT, d), { recursive: true });

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
});
const wallpaperUpload = multer({
  storage: makeStorage("wallpapers"),
  limits: { fileSize: 6 * 1024 * 1024 },
});
const blogUpload = multer({
  storage: makeStorage("blog"),
  limits: { fileSize: 8 * 1024 * 1024 },
});
const lectureUpload = multer({
  storage: makeStorage("course-lectures"),
  limits: { fileSize: 32 * 1024 * 1024 },
});

router.post("/me/avatar", authRequired, avatarUpload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  const url = `/uploads/avatars/${req.file.filename}`;
  run("UPDATE users SET avatar_url = ? WHERE id = ?", url, req.user.id);
  return res.json({ avatar_url: url });
});

router.post("/me/wallpaper", authRequired, wallpaperUpload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  const url = `/uploads/wallpapers/${req.file.filename}`;
  run("UPDATE users SET wallpaper_url = ? WHERE id = ?", url, req.user.id);
  return res.json({ wallpaper_url: url });
});

router.post("/blog/upload-image", authRequired, blogUpload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  const url = `/uploads/blog/${req.file.filename}`;
  const id = uuidv4();
  run(
    "INSERT INTO blog_post_images (id, post_id, uploader_user_id, url, created_at) VALUES (?, ?, ?, ?, ?)",
    id,
    req.body?.post_id ? String(req.body.post_id) : null,
    req.user.id,
    url,
    nowIso(),
  );
  return res.json({ url });
});

router.post(
  "/courses/:id/lectures/upload",
  authRequired,
  lectureUpload.single("file"),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: "no file" });
    const url = `/uploads/course-lectures/${req.file.filename}`;
    return res.json({ url, file_name: req.file.originalname });
  },
);

export default router;
