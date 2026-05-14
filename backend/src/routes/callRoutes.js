import crypto from "node:crypto";
import express from "express";
import { authRequired } from "../auth.js";
import { get, nowIso, run } from "../db.js";

const router = express.Router();

function randomSlug() {
  return crypto.randomBytes(16).toString("hex");
}

router.post("/calls", authRequired, (req, res) => {
  const slug = randomSlug();
  const iso = nowIso();
  try {
    run(
      `INSERT INTO call_sessions (slug, jitsi_room, embed_url, active, created_by_user_id, created_at)
       VALUES (?, '', '', 1, ?, ?)`,
      slug,
      req.user.id,
      iso,
    );
    res.json({ slug });
  } catch (e) {
    console.error("create call session", e);
    res.status(500).json({ error: "не удалось создать звонок" });
  }
});

router.post("/calls/:slug/end", (req, res) => {
  const row = get("SELECT slug FROM call_sessions WHERE slug = ?", req.params.slug);
  if (!row) return res.status(404).json({ error: "not found" });
  run(
    "UPDATE call_sessions SET active = 0, ended_at = COALESCE(ended_at, ?) WHERE slug = ?",
    nowIso(),
    req.params.slug,
  );
  res.json({ ok: true });
});

router.get("/calls/:slug", (req, res) => {
  const row = get("SELECT active FROM call_sessions WHERE slug = ?", req.params.slug);
  if (!row) return res.status(404).json({ error: "not found" });
  if (!row.active) return res.json({ active: false });
  res.json({ active: true });
});

export default router;
