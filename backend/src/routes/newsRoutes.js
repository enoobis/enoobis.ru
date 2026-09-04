import express from "express";
import { v4 as uuidv4 } from "uuid";
import { all, get, nowIso, run } from "../db.js";
import { authRequired } from "../auth.js";
import { isPanelStaff } from "../utils/roles.js";
import { unlinkUploadUrl } from "../utils/uploadSafe.js";
import { rateLimit } from "../utils/security.js";

const router = express.Router();
const COMMENT_MAX = 2000;

function toItem(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    image_url: row.image_url ?? "",
    source_url: row.source_url,
    source_name: row.source_name ?? "",
    created_at: row.created_at,
  };
}

function toComment(row) {
  return {
    id: row.id,
    news_id: row.news_id,
    user_id: row.user_id,
    author_nickname: row.author_nickname,
    body: row.body,
    created_at: row.created_at,
  };
}

function newsOr404(id) {
  return get("SELECT id FROM news WHERE id = ?", id);
}

router.get("/news", (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const total = get("SELECT COUNT(*) as v FROM news")?.v ?? 0;
  const rows = all(
    "SELECT * FROM news ORDER BY created_at DESC LIMIT ? OFFSET ?",
    limit,
    offset,
  );
  return res.json({ items: rows.map(toItem), total });
});

router.get("/news/:id/comments", (req, res) => {
  if (!newsOr404(req.params.id)) return res.status(404).json({ error: "not found" });
  const rows = all(
    `SELECT c.id, c.news_id, c.user_id, u.nickname as author_nickname, c.body, c.created_at
     FROM news_comments c JOIN users u ON u.id = c.user_id
     WHERE c.news_id = ?
     ORDER BY c.created_at ASC`,
    req.params.id,
  );
  return res.json(rows.map(toComment));
});

router.post(
  "/news/:id/comments",
  authRequired,
  rateLimit({
    keyPrefix: "news_comment",
    max: 20,
    windowMs: 10 * 60 * 1000,
    keyFn: (req) => req.user.id,
  }),
  (req, res) => {
    if (!newsOr404(req.params.id)) return res.status(404).json({ error: "not found" });
    const body = String(req.body?.body ?? "").trim();
    if (!body) return res.status(400).json({ error: "empty comment" });
    if (body.length > COMMENT_MAX) return res.status(400).json({ error: "too long" });
    const id = uuidv4();
    const now = nowIso();
    run(
      "INSERT INTO news_comments (id, news_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
      id,
      req.params.id,
      req.user.id,
      body,
      now,
    );
    const row = get(
      `SELECT c.id, c.news_id, c.user_id, u.nickname as author_nickname, c.body, c.created_at
       FROM news_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
      id,
    );
    return res.json(toComment(row));
  },
);

router.delete("/news/comments/:id", authRequired, (req, res) => {
  const row = get("SELECT id, user_id FROM news_comments WHERE id = ?", req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  if (row.user_id !== req.user.id && !isPanelStaff(req.user.role)) {
    return res.status(403).json({ error: "forbidden" });
  }
  run("DELETE FROM news_comments WHERE id = ?", row.id);
  return res.json({ ok: true });
});

router.get("/news/:id", (req, res) => {
  const row = get("SELECT * FROM news WHERE id = ?", req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  return res.json(toItem(row));
});

router.delete("/news/:id", authRequired, (req, res) => {
  if (!isPanelStaff(req.user.role)) return res.status(403).json({ error: "forbidden" });
  const row = get("SELECT id, image_url FROM news WHERE id = ?", req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  run("DELETE FROM news_comments WHERE news_id = ?", row.id);
  unlinkUploadUrl(row.image_url, ["news"]);
  run("DELETE FROM news WHERE id = ?", row.id);
  return res.json({ ok: true });
});

export default router;
