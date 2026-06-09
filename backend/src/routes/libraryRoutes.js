import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import { all, get, nowIso, run } from "../db.js";
import {
  authRequired,
  mintScopedAccessToken,
  verifyScopedAccessToken,
} from "../auth.js";
import { rateLimit, safePathUnder } from "../utils/security.js";
import { LIBRARY_ALLOWED_MIMES, verifyLibraryBook } from "../utils/mimeVerify.js";
import { contentDispositionAttachment, contentDispositionInline } from "../utils/contentDisposition.js";
import { isStaffRole } from "../utils/roles.js";

const router = express.Router();

const LIBRARY_ROOT = path.resolve(process.env.LIBRARY_DIR ?? "./data/library");
fs.mkdirSync(LIBRARY_ROOT, { recursive: true });

const BOOK_MAX_BYTES = 150 * 1024 * 1024;

function staffOnly(req, res, next) {
  if (!isStaffRole(req.user?.role)) {
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
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (![".pdf", ".epub"].includes(ext)) return cb(new Error("only pdf or epub"));
    const mime = String(file.mimetype ?? "").toLowerCase();
    if (LIBRARY_ALLOWED_MIMES.has(mime)) return cb(null, true);
    // Browsers on Windows often send octet-stream for real PDF/EPUB files.
    if (ext === ".pdf" && (!mime || mime === "application/octet-stream" || mime === "binary/octet-stream")) {
      return cb(null, true);
    }
    if (
      ext === ".epub" &&
      (!mime ||
        mime === "application/octet-stream" ||
        mime === "binary/octet-stream" ||
        mime === "application/zip" ||
        mime === "application/x-zip-compressed")
    ) {
      return cb(null, true);
    }
    return cb(new Error("only pdf or epub"));
  },
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
  const usage = get("SELECT COALESCE(SUM(size_bytes), 0) AS total FROM library_books");
  const storageBytesUsed = Number(usage?.total ?? 0);
  res.json({ items: rows, storage_bytes_used: storageBytesUsed });
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
  upload.single("file")(req, res, async (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "file_too_large" });
      }
      return res.status(400).json({ error: err.message ?? "upload_error" });
    }
    if (!req.file) return res.status(400).json({ error: "no_file" });
    const valid = await verifyLibraryBook(req.file.path, req.file.mimetype || "");
    if (!valid) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
      return res.status(400).json({ error: "invalid_file" });
    }
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

function resolveMime(stored, originalName) {
  const s = String(stored ?? "").trim();
  if (s) return s;
  const ext = path.extname(String(originalName ?? "")).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".epub") return "application/epub+zip";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function isPdfMime(mime, originalName) {
  const m = String(mime ?? "").toLowerCase();
  if (m.includes("pdf")) return true;
  return path.extname(String(originalName ?? "")).toLowerCase() === ".pdf";
}

router.patch("/library/:id", authRequired, staffOnly, (req, res) => {
  const book = get(
    "SELECT id, uploaded_by FROM library_books WHERE id = ?",
    req.params.id,
  );
  if (!book) return res.status(404).json({ error: "not_found" });
  if (book.uploaded_by !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ error: "forbidden" });
  }
  const title = String(req.body?.title ?? "").trim().slice(0, 200);
  const author = String(req.body?.author ?? "").trim().slice(0, 200);
  const description = String(req.body?.description ?? "").trim().slice(0, 4000);
  const category = String(req.body?.category ?? "").trim().slice(0, 80);
  if (!title) return res.status(400).json({ error: "title_required" });
  run(
    "UPDATE library_books SET title = ?, author = ?, description = ?, category = ? WHERE id = ?",
    title,
    author,
    description,
    category,
    req.params.id,
  );
  const updated = get(
    `SELECT b.id, b.title, b.author, b.description, b.category, b.original_name,
            b.mime_type, b.size_bytes, b.uploaded_by, b.created_at,
            u.nickname AS uploader_nickname
     FROM library_books b
     LEFT JOIN users u ON u.id = b.uploaded_by
     WHERE b.id = ?`,
    req.params.id,
  );
  res.json(updated);
});

const shareReadLimit = rateLimit({ windowMs: 60_000, max: 120, keyPrefix: "lib-read" });

router.post("/library/:id/read-access", authRequired, (req, res) => {
  const book = get(
    "SELECT id, original_name, mime_type FROM library_books WHERE id = ?",
    req.params.id,
  );
  if (!book) return res.status(404).json({ error: "not_found" });
  if (!isPdfMime(book.mime_type, book.original_name)) {
    return res.status(415).json({ error: "read_only_pdf" });
  }
  const access = mintScopedAccessToken(req.user.id, "library_read", book.id, 900);
  return res.json({ access, expires_in: 900 });
});

router.get("/library/:id/read", shareReadLimit, (req, res) => {
  const access = typeof req.query?.access === "string" ? req.query.access.trim() : "";
  if (!access) return res.status(401).json({ error: "unauthorized" });
  try {
    verifyScopedAccessToken(access, "library_read", req.params.id);
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
  const book = get(
    "SELECT storage_path, original_name, mime_type FROM library_books WHERE id = ?",
    req.params.id,
  );
  if (!book) return res.status(404).json({ error: "not_found" });
  if (!isPdfMime(book.mime_type, book.original_name)) {
    return res.status(415).json({ error: "read_only_pdf" });
  }
  const abs = safePathUnder(LIBRARY_ROOT, book.storage_path);
  if (!abs || !fs.existsSync(abs)) return res.status(404).json({ error: "not_found" });
  const mime = resolveMime(book.mime_type, book.original_name);
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", contentDispositionInline(book.original_name));
  fs.createReadStream(abs)
    .on("error", () => {
      if (!res.headersSent) res.sendStatus(500);
    })
    .pipe(res);
});

router.get("/library/:id/download", authRequired, (req, res) => {
  const book = get(
    "SELECT storage_path, original_name, mime_type FROM library_books WHERE id = ?",
    req.params.id,
  );
  if (!book) return res.status(404).json({ error: "not_found" });
  const abs = safePathUnder(LIBRARY_ROOT, book.storage_path);
  if (!abs || !fs.existsSync(abs)) return res.status(404).json({ error: "not_found" });
  const mime = resolveMime(book.mime_type, book.original_name);
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", contentDispositionAttachment(book.original_name));
  fs.createReadStream(abs)
    .on("error", () => {
      if (!res.headersSent) res.sendStatus(500);
    })
    .pipe(res);
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
  const abs = safePathUnder(LIBRARY_ROOT, book.storage_path);
  if (abs) {
    try {
      fs.unlinkSync(abs);
    } catch {
      /* ignore */
    }
  }
  run("DELETE FROM library_books WHERE id = ?", book.id);
  res.json({ ok: true });
});

export default router;
