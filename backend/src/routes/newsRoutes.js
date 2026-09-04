import express from "express";
import { all, get, run } from "../db.js";
import { authRequired } from "../auth.js";
import { isPanelStaff } from "../utils/roles.js";
import { unlinkUploadUrl } from "../utils/uploadSafe.js";

const router = express.Router();

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

router.get("/news/:id", (req, res) => {
  const row = get("SELECT * FROM news WHERE id = ?", req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  return res.json(toItem(row));
});

router.delete("/news/:id", authRequired, (req, res) => {
  if (!isPanelStaff(req.user.role)) return res.status(403).json({ error: "forbidden" });
  const row = get("SELECT id, image_url FROM news WHERE id = ?", req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  unlinkUploadUrl(row.image_url, ["news"]);
  run("DELETE FROM news WHERE id = ?", row.id);
  return res.json({ ok: true });
});

export default router;
