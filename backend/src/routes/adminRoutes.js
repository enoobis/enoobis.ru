import express from "express";
import { v4 as uuidv4 } from "uuid";
import { all, get, nowIso, run } from "../db.js";
import { authRequired } from "../auth.js";

const router = express.Router();

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "forbidden" });
  next();
}

router.use(authRequired, adminOnly);

router.get("/admin/pending", (_req, res) => {
  const rows = all(
    "SELECT id, email, nickname, role, created_at FROM users WHERE status = 'pending' ORDER BY created_at",
  );
  return res.json(rows);
});

router.get("/admin/users", (_req, res) => {
  const rows = all(
    "SELECT id, email, nickname, role, status, created_at FROM users ORDER BY created_at DESC",
  );
  return res.json(rows);
});

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
