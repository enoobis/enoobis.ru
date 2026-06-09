import express from "express";
import { all } from "../db.js";

const router = express.Router();

router.get("/search", (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json({ blog: [], micro: [], users: [] });
  const like = `%${q}%`;
  const limit = Math.min(20, Math.max(1, Number(req.query.limit ?? 8)));

  const blog = all(
    `SELECT p.id, p.title, p.slug, p.excerpt, p.published_at, p.created_at,
            u.nickname as author_nickname
     FROM blog_posts p
     JOIN users u ON u.id = p.author_id
     WHERE p.status = 'published' AND p.is_deleted = 0
       AND (p.title LIKE ? OR p.excerpt LIKE ? OR p.body LIKE ?)
     ORDER BY p.published_at DESC
     LIMIT ?`,
    like,
    like,
    like,
    limit,
  );

  const micro = all(
    `SELECT m.id, m.body, m.created_at,
            u.nickname as author_nickname, u.avatar_url as author_avatar
     FROM microposts m
     JOIN users u ON u.id = m.author_id
     WHERE m.is_deleted = 0 AND m.body LIKE ?
     ORDER BY m.created_at DESC
     LIMIT ?`,
    like,
    limit,
  );

  const users = all(
    `SELECT nickname, full_name, avatar_url
     FROM users
     WHERE status = 'approved' AND (nickname LIKE ? OR full_name LIKE ?)
     ORDER BY nickname
     LIMIT ?`,
    like,
    like,
    limit,
  );

  return res.json({ blog, micro, users });
});

export default router;
