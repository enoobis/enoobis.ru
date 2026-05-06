import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import { all, get, nowIso, run } from "../db.js";
import { authRequired } from "../auth.js";
import { awardAchievement } from "../utils/achievements.js";
import { saveIdenticon } from "../utils/identicon.js";

const router = express.Router();

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "forbidden" });
  next();
}

router.use(authRequired, adminOnly);

const UPLOAD_ROOT = path.resolve(process.env.UPLOADS_DIR ?? "./data/uploads");
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
fs.mkdirSync(path.join(UPLOAD_ROOT, "avatars"), { recursive: true });

const adminAvatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_ROOT, "avatars")),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || ".bin").toLowerCase();
      cb(null, `${req.params.id}-${uuidv4().replace(/-/g, "")}${ext}`);
    },
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIMES.has(file.mimetype)) cb(null, true);
    else cb(new Error("only jpeg, png, gif, webp"));
  },
});

function uploadSingle(upload, field) {
  return (req, res, next) => {
    upload.single(field)(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message ?? "upload error" });
      next();
    });
  };
}

router.get("/admin/pending", (_req, res) => {
  const rows = all(
    "SELECT id, email, nickname, role, created_at FROM users WHERE status = 'pending' ORDER BY created_at",
  );
  return res.json(rows);
});

router.get("/admin/users", (_req, res) => {
  const rows = all(
    `SELECT id, email, nickname, role, status, created_at, bio, avatar_url, wallpaper_url
     FROM users ORDER BY created_at DESC`,
  );
  return res.json(rows);
});

router.patch("/admin/users/:id/profile", (req, res) => {
  const id = req.params.id;
  const target = get("SELECT id, nickname FROM users WHERE id = ?", id);
  if (!target) return res.status(404).json({ error: "not found" });
  const body = req.body ?? {};
  if (body.bio !== undefined) {
    const bio = String(body.bio);
    if (bio.length > 4000) return res.status(400).json({ error: "bio too long" });
    run("UPDATE users SET bio = ? WHERE id = ?", bio, id);
  }
  if (body.wallpaper_url !== undefined) {
    run("UPDATE users SET wallpaper_url = ? WHERE id = ?", String(body.wallpaper_url ?? ""), id);
  }
  if (body.avatar_url !== undefined) {
    const v = body.avatar_url;
    if (v === null || v === "") {
      const url = saveIdenticon(target.nickname || target.id, target.id);
      run("UPDATE users SET avatar_url = ? WHERE id = ?", url, target.id);
    } else {
      run("UPDATE users SET avatar_url = ? WHERE id = ?", String(v), id);
    }
  }
  return res.json({ ok: true });
});

router.post(
  "/admin/users/:id/avatar",
  uploadSingle(adminAvatarUpload, "file"),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: "no file" });
    const target = get("SELECT id FROM users WHERE id = ?", req.params.id);
    if (!target) return res.status(404).json({ error: "not found" });
    const url = `/uploads/avatars/${req.file.filename}`;
    run("UPDATE users SET avatar_url = ? WHERE id = ?", url, req.params.id);
    return res.json({ avatar_url: url });
  },
);

router.post("/admin/users/:id/approve", (req, res) => {
  run("UPDATE users SET status = 'approved' WHERE id = ?", req.params.id);
  return res.json({ ok: true });
});

router.post("/admin/users/:id/reject", (req, res) => {
  run("UPDATE users SET status = 'rejected' WHERE id = ?", req.params.id);
  return res.json({ ok: true });
});

router.post("/admin/users/:id/role", (req, res) => {
  const role = String(req.body?.role ?? "");
  if (!["student", "teacher", "admin"].includes(role)) return res.status(400).json({ error: "bad role" });
  run("UPDATE users SET role = ? WHERE id = ?", role, req.params.id);
  if (role === "teacher" || role === "admin") {
    awardAchievement(req.params.id, "mentor");
  }
  return res.json({ ok: true });
});

function purgeUserCourses(userId) {
  const owned = all("SELECT id FROM courses WHERE teacher_id = ?", userId);
  for (const c of owned) {
    const lectures = all("SELECT id FROM course_lectures WHERE course_id = ?", c.id);
    for (const l of lectures) {
      run("DELETE FROM course_lecture_attachments WHERE lecture_id = ?", l.id);
    }
    run(
      "DELETE FROM course_submission_attachments WHERE submission_id IN (SELECT s.id FROM course_assignment_submissions s JOIN course_assignments a ON a.id = s.assignment_id WHERE a.course_id = ?)",
      c.id,
    );
    run(
      "DELETE FROM course_assignment_submissions WHERE assignment_id IN (SELECT id FROM course_assignments WHERE course_id = ?)",
      c.id,
    );
    run("DELETE FROM course_assignments WHERE course_id = ?", c.id);
    run("DELETE FROM course_lectures WHERE course_id = ?", c.id);
    run(
      "DELETE FROM course_stream_comments WHERE post_id IN (SELECT id FROM course_stream_posts WHERE course_id = ?)",
      c.id,
    );
    run("DELETE FROM course_stream_posts WHERE course_id = ?", c.id);
    run("DELETE FROM course_students WHERE course_id = ?", c.id);
    run("DELETE FROM course_co_teachers WHERE course_id = ?", c.id);
    run("DELETE FROM user_favorite_courses WHERE course_id = ?", c.id);
    run("DELETE FROM courses WHERE id = ?", c.id);
  }
}

router.delete("/admin/users/:id", (req, res) => {
  const id = req.params.id;
  if (id === req.user.id) {
    return res.status(400).json({ error: "нельзя удалить самого себя" });
  }
  const u = get("SELECT id, role FROM users WHERE id = ?", id);
  if (!u) return res.status(404).json({ error: "не найдено" });
  if (u.role === "admin") {
    return res.status(400).json({ error: "нельзя удалить другого админа" });
  }

  purgeUserCourses(id);

  try {
    run(
      "DELETE FROM course_assignment_submissions WHERE student_id = ?",
      id,
    );
  } catch {}
  try {
    run("DELETE FROM course_students WHERE student_id = ?", id);
  } catch {}
  try {
    run("DELETE FROM course_co_teachers WHERE user_id = ?", id);
  } catch {}
  try {
    run("DELETE FROM user_favorite_courses WHERE user_id = ?", id);
  } catch {}

  try {
    run(
      "DELETE FROM micropost_likes WHERE user_id = ? OR micropost_id IN (SELECT id FROM microposts WHERE author_id = ?)",
      id,
      id,
    );
  } catch {}
  try {
    run("DELETE FROM microposts WHERE author_id = ?", id);
  } catch {}

  try {
    run("DELETE FROM blog_post_likes WHERE user_id = ?", id);
  } catch {}
  try {
    run("DELETE FROM blog_post_bookmarks WHERE user_id = ?", id);
  } catch {}
  try {
    run("DELETE FROM blog_comments WHERE user_id = ?", id);
  } catch {}
  try {
    run("DELETE FROM blog_posts WHERE author_id = ?", id);
  } catch {}
  try {
    run("DELETE FROM blog_reports WHERE reporter_id = ?", id);
  } catch {}

  try {
    run("DELETE FROM chat_messages WHERE thread_id IN (SELECT id FROM chat_threads WHERE user_a_id = ? OR user_b_id = ?)", id, id);
  } catch {}
  try {
    run("DELETE FROM chat_threads WHERE user_a_id = ? OR user_b_id = ?", id, id);
  } catch {}

  try {
    run(
      "DELETE FROM user_follows WHERE follower_user_id = ? OR following_user_id = ?",
      id,
      id,
    );
  } catch {}

  try {
    run("DELETE FROM invite_links WHERE owner_user_id = ?", id);
  } catch {}
  try {
    run("DELETE FROM user_files WHERE owner_id = ?", id);
  } catch {}
  try {
    run("DELETE FROM user_notes WHERE owner_id = ?", id);
  } catch {}
  try {
    run("DELETE FROM share_links WHERE owner_id = ?", id);
  } catch {}
  try {
    run("DELETE FROM library_books WHERE uploaded_by = ?", id);
  } catch {}
  try {
    run("DELETE FROM user_privacy_settings WHERE user_id = ?", id);
  } catch {}
  try {
    run("DELETE FROM user_notification_settings WHERE user_id = ?", id);
  } catch {}

  run("DELETE FROM users WHERE id = ?", id);
  return res.json({ ok: true });
});

router.post("/admin/users/:id/invites", (req, res) => {
  const count = Math.max(1, Math.min(50, Number(req.body?.count ?? 1) | 0));
  const targetRole = ["teacher", "student"].includes(req.body?.target_role) ? req.body.target_role : "student";
  const created = [];
  for (let i = 0; i < count; i++) {
    const id = uuidv4();
    const code = uuidv4().replace(/-/g, "");
    run(
      `INSERT INTO invite_links (id, code, owner_user_id, max_uses, used_count, created_at, target_role)
       VALUES (?, ?, ?, 1, 0, ?, ?)`,
      id,
      code,
      req.params.id,
      nowIso(),
      targetRole,
    );
    created.push(code);
  }
  return res.json({ ok: true, created });
});

router.get("/admin/blog/reports", (_req, res) => {
  const rows = all(
    "SELECT * FROM blog_reports ORDER BY created_at DESC",
  );
  return res.json(rows);
});

router.post("/admin/blog/reports/:id/resolve", (req, res) => {
  const status = ["resolved", "dismissed"].includes(req.body?.status) ? req.body.status : "resolved";
  run(
    "UPDATE blog_reports SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?",
    status,
    nowIso(),
    req.user.id,
    req.params.id,
  );
  return res.json({ ok: true });
});

router.post("/admin/blog/posts/:id/hide", (req, res) => {
  run("UPDATE blog_posts SET status = 'archived' WHERE id = ?", req.params.id);
  return res.json({ ok: true });
});

router.post("/admin/blog/comments/:id/hide", (req, res) => {
  run("UPDATE blog_comments SET status = 'hidden' WHERE id = ?", req.params.id);
  return res.json({ ok: true });
});

router.post("/admin/blog/comments/:id/restore", (req, res) => {
  run("UPDATE blog_comments SET status = 'visible' WHERE id = ?", req.params.id);
  return res.json({ ok: true });
});

export default router;
