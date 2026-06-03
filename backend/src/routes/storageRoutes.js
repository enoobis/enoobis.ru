import express from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { all, get, nowIso, run } from "../db.js";
import { authRequired } from "../auth.js";
import { contentDispositionInline } from "../utils/contentDisposition.js";
import { rateLimit, safePathUnder } from "../utils/security.js";

const router = express.Router();

const FILES_ROOT = path.resolve(process.env.PRIVATE_FILES_DIR ?? "./data/private-files");

const NOTE_BODY_MAX = 64 * 1024;
const NOTE_TITLE_MAX = 200;

function staffOnly(req, res, next) {
  if (req.user?.role !== "admin" && req.user?.role !== "teacher") {
    return res.status(403).json({ error: "forbidden" });
  }
  next();
}

const SHARE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const SHARE_TOKEN_LEN = 24;

function genToken() {
  const bytes = crypto.randomBytes(SHARE_TOKEN_LEN);
  let out = "";
  for (let i = 0; i < SHARE_TOKEN_LEN; i++) {
    out += SHARE_ALPHABET[bytes[i] % SHARE_ALPHABET.length];
  }
  return out;
}

function uniqueToken() {
  for (let i = 0; i < 8; i++) {
    const t = genToken();
    if (!get("SELECT 1 FROM share_links WHERE token = ?", t)) return t;
  }
  return crypto.randomBytes(8).toString("base64url");
}

function ttlToExpiresAt(ttl) {
  if (ttl === "forever") return null;
  const map = {
    "1h": 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
  };
  const ms = map[ttl];
  if (!ms) return null;
  return new Date(Date.now() + ms).toISOString();
}

function isExpired(iso) {
  if (!iso) return false;
  return Date.parse(iso) <= Date.now();
}

router.get("/notes", authRequired, staffOnly, (req, res) => {
  const items = all(
    `SELECT id, title, body, created_at, updated_at
     FROM user_notes WHERE owner_id = ? ORDER BY updated_at DESC`,
    req.user.id,
  );
  res.json({ items });
});

router.post("/notes", authRequired, staffOnly, (req, res) => {
  const title = String(req.body?.title ?? "").slice(0, NOTE_TITLE_MAX);
  const body = String(req.body?.body ?? "");
  if (body.length > NOTE_BODY_MAX) {
    return res.status(400).json({ error: "note_too_long" });
  }
  const id = uuidv4();
  const now = nowIso();
  run(
    `INSERT INTO user_notes (id, owner_id, title, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    req.user.id,
    title,
    body,
    now,
    now,
  );
  res.json({ id, title, body, created_at: now, updated_at: now });
});

router.patch("/notes/:id", authRequired, staffOnly, (req, res) => {
  const row = get("SELECT id, owner_id FROM user_notes WHERE id = ?", req.params.id);
  if (!row) return res.status(404).json({ error: "not_found" });
  if (row.owner_id !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ error: "forbidden" });
  }
  const title = req.body?.title !== undefined ? String(req.body.title).slice(0, NOTE_TITLE_MAX) : null;
  const body = req.body?.body !== undefined ? String(req.body.body) : null;
  if (body !== null && body.length > NOTE_BODY_MAX) {
    return res.status(400).json({ error: "note_too_long" });
  }
  const now = nowIso();
  if (title !== null) run("UPDATE user_notes SET title = ?, updated_at = ? WHERE id = ?", title, now, row.id);
  if (body !== null) run("UPDATE user_notes SET body = ?, updated_at = ? WHERE id = ?", body, now, row.id);
  const updated = get(
    "SELECT id, title, body, created_at, updated_at FROM user_notes WHERE id = ?",
    row.id,
  );
  res.json(updated);
});

router.delete("/notes/:id", authRequired, staffOnly, (req, res) => {
  const row = get("SELECT id, owner_id FROM user_notes WHERE id = ?", req.params.id);
  if (!row) return res.status(404).json({ error: "not_found" });
  if (row.owner_id !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ error: "forbidden" });
  }
  run("DELETE FROM share_links WHERE target_type = 'note' AND target_id = ?", row.id);
  run("DELETE FROM user_notes WHERE id = ?", row.id);
  res.json({ ok: true });
});

router.get("/shares", authRequired, staffOnly, (req, res) => {
  const rows = all(
    `SELECT id, token, target_type, target_id, expires_at, created_at
     FROM share_links WHERE owner_id = ?
     ORDER BY created_at DESC`,
    req.user.id,
  );
  const active = [];
  for (const r of rows) {
    if (isExpired(r.expires_at)) {
      run("DELETE FROM share_links WHERE id = ?", r.id);
      continue;
    }
    let label = "";
    if (r.target_type === "file") {
      const f = get("SELECT original_name FROM user_files WHERE id = ?", r.target_id);
      label = f?.original_name ?? "(удалено)";
    } else if (r.target_type === "note") {
      const n = get("SELECT title FROM user_notes WHERE id = ?", r.target_id);
      label = n?.title || "(заметка)";
    }
    active.push({ ...r, label });
  }
  res.json({ items: active });
});

router.post("/shares", authRequired, staffOnly, (req, res) => {
  const target_type = req.body?.target_type;
  const target_id = req.body?.target_id;
  const ttl = req.body?.ttl ?? "1d";
  if (!["file", "note"].includes(target_type) || !target_id) {
    return res.status(400).json({ error: "bad_target" });
  }
  if (target_type === "file") {
    const f = get("SELECT id, owner_id FROM user_files WHERE id = ?", target_id);
    if (!f) return res.status(404).json({ error: "not_found" });
    if (f.owner_id !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "forbidden" });
    }
  } else {
    const n = get("SELECT id, owner_id FROM user_notes WHERE id = ?", target_id);
    if (!n) return res.status(404).json({ error: "not_found" });
    if (n.owner_id !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "forbidden" });
    }
  }
  const id = uuidv4();
  const tok = uniqueToken();
  const expires = ttlToExpiresAt(ttl);
  run(
    `INSERT INTO share_links (id, token, owner_id, target_type, target_id, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    tok,
    req.user.id,
    target_type,
    target_id,
    expires,
    nowIso(),
  );
  res.json({ id, token: tok, target_type, target_id, expires_at: expires });
});

router.delete("/shares/:id", authRequired, staffOnly, (req, res) => {
  const row = get("SELECT id, owner_id FROM share_links WHERE id = ?", req.params.id);
  if (!row) return res.status(404).json({ error: "not_found" });
  if (row.owner_id !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ error: "forbidden" });
  }
  run("DELETE FROM share_links WHERE id = ?", row.id);
  res.json({ ok: true });
});

const publicShareLimit = rateLimit({ windowMs: 60_000, max: 60, keyPrefix: "share" });

router.get("/share/:token", publicShareLimit, (req, res) => {
  const link = get("SELECT * FROM share_links WHERE token = ?", req.params.token);
  if (!link) return res.status(404).json({ error: "not_found" });
  if (isExpired(link.expires_at)) {
    run("DELETE FROM share_links WHERE id = ?", link.id);
    return res.status(410).json({ error: "expired" });
  }
  const owner = get("SELECT nickname FROM users WHERE id = ?", link.owner_id);
  if (link.target_type === "file") {
    const f = get(
      "SELECT id, original_name, mime_type, size_bytes, created_at FROM user_files WHERE id = ?",
      link.target_id,
    );
    if (!f) return res.status(404).json({ error: "not_found" });
    return res.json({
      kind: "file",
      owner_nickname: owner?.nickname ?? "",
      expires_at: link.expires_at,
      file: f,
    });
  }
  if (link.target_type === "note") {
    const n = get(
      "SELECT id, title, body, created_at, updated_at FROM user_notes WHERE id = ?",
      link.target_id,
    );
    if (!n) return res.status(404).json({ error: "not_found" });
    return res.json({
      kind: "note",
      owner_nickname: owner?.nickname ?? "",
      expires_at: link.expires_at,
      note: n,
    });
  }
  return res.status(404).json({ error: "not_found" });
});

function isPdfFile(mime, originalName) {
  const m = String(mime ?? "").toLowerCase();
  if (m.includes("pdf")) return true;
  return path.extname(String(originalName ?? "")).toLowerCase() === ".pdf";
}

router.get("/share/:token/read", publicShareLimit, (req, res) => {
  const link = get("SELECT * FROM share_links WHERE token = ?", req.params.token);
  if (!link || link.target_type !== "file") return res.status(404).json({ error: "not_found" });
  if (isExpired(link.expires_at)) {
    run("DELETE FROM share_links WHERE id = ?", link.id);
    return res.status(410).json({ error: "expired" });
  }
  const f = get(
    "SELECT storage_path, original_name, mime_type FROM user_files WHERE id = ?",
    link.target_id,
  );
  if (!f) return res.status(404).json({ error: "not_found" });
  if (!isPdfFile(f.mime_type, f.original_name)) {
    return res.status(415).json({ error: "read_only_pdf" });
  }
  const abs = safePathUnder(FILES_ROOT, f.storage_path);
  if (!abs || !fs.existsSync(abs)) return res.status(404).json({ error: "not_found" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", contentDispositionInline(f.original_name));
  fs.createReadStream(abs)
    .on("error", () => {
      if (!res.headersSent) res.sendStatus(500);
    })
    .pipe(res);
});

router.get("/share/:token/download", publicShareLimit, (req, res) => {
  const link = get("SELECT * FROM share_links WHERE token = ?", req.params.token);
  if (!link || link.target_type !== "file") return res.status(404).json({ error: "not_found" });
  if (isExpired(link.expires_at)) {
    run("DELETE FROM share_links WHERE id = ?", link.id);
    return res.status(410).json({ error: "expired" });
  }
  const f = get(
    "SELECT storage_path, original_name FROM user_files WHERE id = ?",
    link.target_id,
  );
  if (!f) return res.status(404).json({ error: "not_found" });
  const abs = safePathUnder(FILES_ROOT, f.storage_path);
  if (!abs || !fs.existsSync(abs)) return res.status(404).json({ error: "not_found" });
  return res.download(abs, f.original_name);
});

export default router;
