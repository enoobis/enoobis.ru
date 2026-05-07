import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import { all, get, nowIso, run } from "../db.js";
import { authRequired } from "../auth.js";

const router = express.Router();

const LIBRARY_ROOT = path.resolve(process.env.LIBRARY_DIR ?? "./data/library");
fs.mkdirSync(LIBRARY_ROOT, { recursive: true });

const BOOK_MAX_BYTES = 150 * 1024 * 1024;

function staffOnly(req, res, next) {
  if (req.user?.role !== "admin" && req.user?.role !== "teacher") {
    return res.status(403).json({ error: "forbidden" });
  }
  next();
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, LIBRARY_ROOT),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || ".bin").toLowerCase();
      cb(null, `${req.user.id}-${uuidv4().replace(/-/g, "")}${ext}`);
    },
  }),
  limits: { fileSize: BOOK_MAX_BYTES },
});

router.get("/library", authRequired, (req, res) => {
  const q = String(req.query?.q ?? "").trim().toLowerCase();
  const category = String(req.query?.category ?? "").trim();
  const sort = String(req.query?.sort ?? "new");
  const where = [];
  const params = [];
  if (q) {
    where.push(
      "(LOWER(b.title) LIKE ? OR LOWER(b.author) LIKE ? OR LOWER(b.description) LIKE ?)",
    );
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (category) {
    where.push("b.category = ?");
    params.push(category);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderSql = sort === "title" ? "ORDER BY b.title COLLATE NOCASE" : "ORDER BY b.created_at DESC";
  const rows = all(
    `SELECT b.id, b.title, b.author, b.description, b.category, b.original_name,
            b.mime_type, b.size_bytes, b.uploaded_by, b.created_at,
            u.nickname AS uploader_nickname
     FROM library_books b
     LEFT JOIN users u ON u.id = b.uploaded_by
     ${whereSql}
     ${orderSql}`,
    ...params,
  );
  res.json({ items: rows });
});

router.get("/library/categories", authRequired, (_req, res) => {
  const rows = all(
    `SELECT category, COUNT(*) AS count
     FROM library_books
     WHERE category != ''
     GROUP BY category
     ORDER BY category COLLATE NOCASE`,
  );
  res.json({ items: rows });
});

router.post("/library", authRequired, staffOnly, (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "file_too_large" });
      }
      return next(err);
    }
    if (!req.file) return res.status(400).json({ error: "no_file" });
    const title = String(req.body?.title ?? "").trim().slice(0, 200);
    const author = String(req.body?.author ?? "").trim().slice(0, 200);
    const description = String(req.body?.description ?? "").trim().slice(0, 4000);
    const category = String(req.body?.category ?? "").trim().slice(0, 80);
    if (!title) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      return res.status(400).json({ error: "title_required" });
    }
    const id = uuidv4();
    run(
      `INSERT INTO library_books
        (id, title, author, description, category, storage_path, original_name, mime_type, size_bytes, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      title,
      author,
      description,
      category,
      req.file.filename,
      req.file.originalname,
      req.file.mimetype || "",
      req.file.size,
      req.user.id,
      nowIso(),
    );
    res.json({
      id,
      title,
      author,
      description,
      category,
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      size_bytes: req.file.size,
      uploaded_by: req.user.id,
      uploader_nickname: req.user.nickname ?? "",
      created_at: nowIso(),
    });
  });
});

router.get("/library/:id/download", authRequired, (req, res) => {
  const book = get(
    "SELECT storage_path, original_name FROM library_books WHERE id = ?",
    req.params.id,
  );
  if (!book) return res.status(404).json({ error: "not_found" });
  const abs = path.join(LIBRARY_ROOT, book.storage_path);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: "not_found" });
  res.download(abs, book.original_name);
});

router.delete("/library/:id", authRequired, staffOnly, (req, res) => {
  const book = get(
    "SELECT id, uploaded_by, storage_path FROM library_books WHERE id = ?",
    req.params.id,
  );
  if (!book) return res.status(404).json({ error: "not_found" });
  if (book.uploaded_by !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ error: "forbidden" });
  }
  try {
    fs.unlinkSync(path.join(LIBRARY_ROOT, book.storage_path));
  } catch {
    /* ignore */
  }
  run("DELETE FROM library_books WHERE id = ?", book.id);
  res.json({ ok: true });
});

export default router;
