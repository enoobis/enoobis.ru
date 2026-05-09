import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import { nowIso, run, get } from "../db.js";
import { authRequired } from "../auth.js";

const router = express.Router();

const UPLOAD_ROOT = path.resolve(process.env.UPLOADS_DIR ?? "./data/uploads");
const SUBDIRS = ["avatars", "blog", "course-lectures"];
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

router.post("/me/avatar", authRequired, uploadSingle(avatarUpload, "file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  const url = `/uploads/avatars/${req.file.filename}`;
  run("UPDATE users SET avatar_url = ? WHERE id = ?", url, req.user.id);
  return res.json({ avatar_url: url });
});

router.post("/blog/upload-image", authRequired, uploadSingle(blogUpload, "file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
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
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: "no file" });
    const url = `/uploads/course-lectures/${req.file.filename}`;
    return res.json({ url, file_name: req.file.originalname });
  },
);

export default router;
