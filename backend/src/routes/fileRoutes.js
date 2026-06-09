import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import { all, get, nowIso, run } from "../db.js";
import { authRequired } from "../auth.js";
import { assertSafeUploadExtension, safePathUnder } from "../utils/security.js";
import { TEACHER_QUOTA_BYTES, enforceTeacherStorageQuota } from "../utils/teacherStorageQuota.js";
import { isStaffRole } from "../utils/roles.js";

const router = express.Router();

const FILES_ROOT = path.resolve(process.env.PRIVATE_FILES_DIR ?? "./data/private-files");
fs.mkdirSync(FILES_ROOT, { recursive: true });

const ADMIN_QUOTA_BYTES = 3 * 1024 * 1024 * 1024;
const STAFF_FILE_MAX_BYTES = 200 * 1024 * 1024;

function quotaBytesForRole(role) {
  return role === "admin" ? ADMIN_QUOTA_BYTES : TEACHER_QUOTA_BYTES;
}

function staffOnly(req, res, next) {
  if (!isStaffRole(req.user?.role)) {
    return res.status(403).json({ error: "forbidden" });
  }
  next();
}

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, FILES_ROOT),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || ".bin").toLowerCase();
    cb(null, `${req.user.id}-${uuidv4().replace(/-/g, "")}${ext}`);
  },
});

function totalUsed(userId) {
  const row = get(
    "SELECT COALESCE(SUM(size_bytes), 0) AS total FROM user_files WHERE owner_id = ?",
    userId,
  );
  return Number(row?.total ?? 0);
}

router.get("/files", authRequired, staffOnly, (req, res) => {
  if (req.user.role === "teacher" || req.user.role === "master") {
    enforceTeacherStorageQuota(req.user.id);
  }
  const items = all(
    `SELECT id, original_name, mime_type, size_bytes, created_at
     FROM user_files WHERE owner_id = ? ORDER BY created_at DESC`,
    req.user.id,
  );
  res.json({
    items,
    used: totalUsed(req.user.id),
    quota: quotaBytesForRole(req.user.role),
  });
});

router.post("/files", authRequired, staffOnly, (req, res, next) => {
  const cap = quotaBytesForRole(req.user.role);
  const perFileMax = Math.min(cap, STAFF_FILE_MAX_BYTES);
  multer({
    storage: diskStorage,
    limits: { fileSize: perFileMax },
  }).single("file")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "file_too_large" });
      }
      return next(err);
    }
    if (!req.file) return res.status(400).json({ error: "no_file" });
    try {
      assertSafeUploadExtension(req.file.originalname);
    } catch {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
      return res.status(400).json({ error: "blocked_file_type" });
    }
    const used = totalUsed(req.user.id);
    if (used + req.file.size > cap) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
      return res.status(413).json({ error: "quota_exceeded" });
    }
    const id = uuidv4();
    run(
      `INSERT INTO user_files (id, owner_id, storage_path, original_name, mime_type, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      req.user.id,
      req.file.filename,
      req.file.originalname,
      req.file.mimetype || "",
      req.file.size,
      nowIso(),
    );
    return res.json({
      id,
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      size_bytes: req.file.size,
      created_at: nowIso(),
    });
  });
});

router.get("/files/:id/download", authRequired, (req, res) => {
  const row = get(
    "SELECT id, owner_id, storage_path, original_name FROM user_files WHERE id = ?",
    req.params.id,
  );
  if (!row) return res.status(404).json({ error: "not_found" });
  if (row.owner_id !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ error: "forbidden" });
  }
  const abs = safePathUnder(FILES_ROOT, row.storage_path);
  if (!abs || !fs.existsSync(abs)) return res.status(404).json({ error: "not_found" });
  return res.download(abs, row.original_name);
});

router.delete("/files/:id", authRequired, staffOnly, (req, res) => {
  const row = get(
    "SELECT id, owner_id, storage_path FROM user_files WHERE id = ?",
    req.params.id,
  );
  if (!row) return res.status(404).json({ error: "not_found" });
  if (row.owner_id !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ error: "forbidden" });
  }
  const abs = safePathUnder(FILES_ROOT, row.storage_path);
  if (abs) {
    try {
      fs.unlinkSync(abs);
    } catch {
      /* ignore */
    }
  }
  run("DELETE FROM user_files WHERE id = ?", row.id);
  return res.json({ ok: true });
});

export default router;
