import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import jwtLib from "jsonwebtoken";
import { all, get, nowIso, run } from "../db.js";
import { authRequired } from "../auth.js";
import {
  awardAchievement,
  checkMicroLikeMilestone,
} from "../utils/achievements.js";
import { assertMicroPublish } from "../utils/contentLimits.js";

const router = express.Router();
const MAX_BODY = 480;

const UPLOAD_ROOT = path.resolve(process.env.UPLOADS_DIR ?? "./data/uploads");
fs.mkdirSync(path.join(UPLOAD_ROOT, "micro"), { recursive: true });
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const microUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_ROOT, "micro")),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || ".bin").toLowerCase();
      cb(null, `${req.user?.id ?? "anon"}-${uuidv4().replace(/-/g, "")}${ext}`);
    },
  }),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIMES.has(file.mimetype)) cb(null, true);
    else cb(new Error("only jpeg, png, gif, webp"));
  },
});

function authorizeBearer(req) {
  const auth = req.headers.authorization ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  try {
    const token = auth.slice(7);
    const claims = jwtLib.verify(token, process.env.JWT_SECRET ?? "dev-secret-change-me");
    return claims?.sub ?? null;
  } catch {
    return null;
  }
}

function userLimitsJson(userId) {
  return get("SELECT content_limits_json FROM users WHERE id = ?", userId)?.content_limits_json ?? "{}";
}

function likeCount(id) {
  return get("SELECT COUNT(*) as v FROM micropost_likes WHERE micropost_id = ?", id)?.v ?? 0;
}

function replyCount(id) {
  return (
    get("SELECT COUNT(*) as v FROM microposts WHERE parent_id = ? AND is_deleted = 0", id)?.v ?? 0
  );
}

function likedByUser(id, userId) {
  if (!userId) return false;
  return !!get(
    "SELECT 1 FROM micropost_likes WHERE micropost_id = ? AND user_id = ?",
    id,
    userId,
  );
}

function bookmarkedByUser(id, userId) {
  if (!userId) return false;
  return !!get(
    "SELECT 1 FROM micropost_bookmarks WHERE micropost_id = ? AND user_id = ?",
    id,
    userId,
  );
}

function rowToItem(row, viewerId) {
  return {
    id: row.id,
    body: row.body,
    image_url: row.image_url ?? "",
    parent_id: row.parent_id ?? null,
    author_id: row.author_id,
    author_nickname: row.author_nickname ?? "",
    author_avatar: row.author_avatar ?? "",
    created_at: row.created_at,
    like_count: likeCount(row.id),
    reply_count: replyCount(row.id),
    liked_by_me: likedByUser(row.id, viewerId),
    bookmarked_by_me: bookmarkedByUser(row.id, viewerId),
  };
}

function fetchById(id, viewerId) {
  const row = get(
    `SELECT m.*, u.nickname as author_nickname, u.avatar_url as author_avatar
     FROM microposts m JOIN users u ON u.id = m.author_id
     WHERE m.id = ? AND m.is_deleted = 0`,
    id,
  );
  return row ? rowToItem(row, viewerId) : null;
}

router.get("/micro", (req, res) => {
  const viewerId = authorizeBearer(req);
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size ?? 20)));
  const offset = (page - 1) * pageSize;
  const where = ["m.is_deleted = 0", "m.parent_id IS NULL"];
  const params = [];
  if (req.query.q) {
    where.push("m.body LIKE ?");
    params.push(`%${String(req.query.q)}%`);
  }
  if (req.query.author) {
    where.push("u.nickname = ?");
    params.push(String(req.query.author));
  }
  if (req.query.feed === "following" && viewerId) {
    where.push(
      "m.author_id IN (SELECT following_user_id FROM user_follows WHERE follower_user_id = ?)",
    );
    params.push(viewerId);
  }
  const whereSql = where.join(" AND ");
  const total = get(
    `SELECT COUNT(*) as v FROM microposts m JOIN users u ON u.id = m.author_id WHERE ${whereSql}`,
    ...params,
  )?.v ?? 0;
  const rows = all(
    `SELECT m.*, u.nickname as author_nickname, u.avatar_url as author_avatar
     FROM microposts m JOIN users u ON u.id = m.author_id
     WHERE ${whereSql}
     ORDER BY m.created_at DESC
     LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    offset,
  );
  res.json({
    items: rows.map((r) => rowToItem(r, viewerId)),
    page,
    page_size: pageSize,
    total,
  });
});

router.get("/micro/bookmarks/me", authRequired, (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size ?? 20)));
  const offset = (page - 1) * pageSize;
  const userId = req.user.id;
  const total = get(
    "SELECT COUNT(*) as v FROM micropost_bookmarks WHERE user_id = ?",
    userId,
  )?.v ?? 0;
  const rows = all(
    `SELECT m.*, u.nickname as author_nickname, u.avatar_url as author_avatar, b.created_at as bookmarked_at
     FROM micropost_bookmarks b
     JOIN microposts m ON m.id = b.micropost_id
     JOIN users u ON u.id = m.author_id
     WHERE b.user_id = ? AND m.is_deleted = 0
     ORDER BY b.created_at DESC
     LIMIT ? OFFSET ?`,
    userId,
    pageSize,
    offset,
  );
  res.json({
    items: rows.map((r) => rowToItem(r, userId)),
    page,
    page_size: pageSize,
    total,
  });
});

router.post("/micro/:id/bookmark", authRequired, (req, res) => {
  const post = get(
    "SELECT id FROM microposts WHERE id = ? AND is_deleted = 0",
    req.params.id,
  );
  if (!post) return res.status(404).json({ error: "не найдено" });
  run(
    "INSERT OR IGNORE INTO micropost_bookmarks (micropost_id, user_id, created_at) VALUES (?, ?, ?)",
    req.params.id,
    req.user.id,
    nowIso(),
  );
  res.json({ ok: true });
});

router.delete("/micro/:id/bookmark", authRequired, (req, res) => {
  run(
    "DELETE FROM micropost_bookmarks WHERE micropost_id = ? AND user_id = ?",
    req.params.id,
    req.user.id,
  );
  res.json({ ok: true });
});

router.get("/micro/by/:nickname", (req, res) => {
  const viewerId = authorizeBearer(req);
  const rows = all(
    `SELECT m.*, u.nickname as author_nickname, u.avatar_url as author_avatar
     FROM microposts m JOIN users u ON u.id = m.author_id
     WHERE u.nickname = ? AND m.is_deleted = 0 AND m.parent_id IS NULL
     ORDER BY m.created_at DESC
     LIMIT 50`,
    req.params.nickname,
  );
  res.json({ items: rows.map((r) => rowToItem(r, viewerId)) });
});

router.get("/micro/:id", (req, res) => {
  const viewerId = authorizeBearer(req);
  const post = fetchById(req.params.id, viewerId);
  if (!post) return res.status(404).json({ error: "not found" });
  const replies = all(
    `SELECT m.*, u.nickname as author_nickname, u.avatar_url as author_avatar
     FROM microposts m JOIN users u ON u.id = m.author_id
     WHERE m.parent_id = ? AND m.is_deleted = 0
     ORDER BY m.created_at ASC`,
    req.params.id,
  );
  res.json({ post, replies: replies.map((r) => rowToItem(r, viewerId)) });
});

router.post("/micro", authRequired, (req, res) => {
  if (req.user.status !== "approved" && req.user.role !== "admin") {
    return res.status(403).json({ error: "not approved" });
  }
  const lim = userLimitsJson(req.user.id);
  const a = assertMicroPublish(req.user.id, lim);
  if (!a.ok) return res.status(403).json({ error: a.error });
  const body = String(req.body?.body ?? "").trim();
  const imageUrl = String(req.body?.image_url ?? "").trim();
  const parentId = req.body?.parent_id ? String(req.body.parent_id) : null;
  if (!body && !imageUrl) return res.status(400).json({ error: "empty" });
  if (body.length > MAX_BODY) return res.status(400).json({ error: "too long" });
  let parentRow = null;
  if (parentId) {
    parentRow = get(
      "SELECT id, author_id FROM microposts WHERE id = ? AND is_deleted = 0",
      parentId,
    );
    if (!parentRow) return res.status(404).json({ error: "parent not found" });
  }
  const id = uuidv4();
  run(
    `INSERT INTO microposts (id, author_id, body, image_url, parent_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    req.user.id,
    body,
    imageUrl,
    parentId,
    nowIso(),
  );
  if (!parentId) {
    awardAchievement(req.user.id, "first_micro");
  }
  return res.status(201).json(fetchById(id, req.user.id));
});

router.post(
  "/micro/upload-image",
  authRequired,
  (req, res, next) => {
    microUpload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message ?? "upload error" });
      next();
    });
  },
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: "no file" });
    return res.json({ url: `/uploads/micro/${req.file.filename}` });
  },
);

router.delete("/micro/:id", authRequired, (req, res) => {
  const post = get(
    "SELECT author_id FROM microposts WHERE id = ? AND is_deleted = 0",
    req.params.id,
  );
  if (!post) return res.status(404).json({ error: "not found" });
  if (post.author_id !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ error: "forbidden" });
  }
  run("UPDATE microposts SET is_deleted = 1 WHERE id = ?", req.params.id);
  res.json({ ok: true });
});

const EDIT_WINDOW_MS = 5 * 60 * 1000;
router.patch("/micro/:id", authRequired, (req, res) => {
  const row = get(
    "SELECT author_id, created_at FROM microposts WHERE id = ? AND is_deleted = 0",
    req.params.id,
  );
  if (!row) return res.status(404).json({ error: "not found" });
  if (row.author_id !== req.user.id) return res.status(403).json({ error: "forbidden" });
  if (Date.now() - Date.parse(row.created_at) > EDIT_WINDOW_MS) {
    return res.status(403).json({ error: "edit window expired" });
  }
  const body = String(req.body?.body ?? "").trim();
  if (!body) return res.status(400).json({ error: "empty" });
  if (body.length > MAX_BODY) return res.status(400).json({ error: "too long" });
  run("UPDATE microposts SET body = ? WHERE id = ?", body, req.params.id);
  return res.json(fetchById(req.params.id, req.user.id));
});

router.post("/micro/:id/like", authRequired, (req, res) => {
  const post = get(
    "SELECT id, author_id FROM microposts WHERE id = ? AND is_deleted = 0",
    req.params.id,
  );
  if (!post) return res.status(404).json({ error: "not found" });
  run(
    "INSERT OR IGNORE INTO micropost_likes (micropost_id, user_id, created_at) VALUES (?, ?, ?)",
    req.params.id,
    req.user.id,
    nowIso(),
  );
  checkMicroLikeMilestone(req.params.id);
  res.json({ ok: true });
});

router.delete("/micro/:id/like", authRequired, (req, res) => {
  run(
    "DELETE FROM micropost_likes WHERE micropost_id = ? AND user_id = ?",
    req.params.id,
    req.user.id,
  );
  res.json({ ok: true });
});

export default router;
