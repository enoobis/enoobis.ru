import crypto from "node:crypto";
import express from "express";
import { authRequired } from "../auth.js";
import { get, nowIso, run } from "../db.js";

const router = express.Router();

function randomSlug() {
  return crypto.randomBytes(16).toString("hex");
}

function randomJitsiRoom() {
  return `enoobis-${crypto.randomBytes(12).toString("hex")}`;
}

function meetBase() {
  const raw = process.env.JITSI_MEET_BASE ?? process.env.CALL_MEET_BASE ?? "https://meet.jit.si";
  return raw.trim().replace(/\/+$/, "");
}

router.post("/calls", authRequired, (req, res) => {
  const slug = randomSlug();
  const jitsi_room = randomJitsiRoom();
  const iso = nowIso();
  run(
    `INSERT INTO call_sessions (slug, jitsi_room, active, created_by_user_id, created_at)
     VALUES (?, ?, 1, ?, ?)`,
    slug,
    jitsi_room,
    req.user.id,
    iso,
  );
  res.json({ slug });
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
  const row = get(
    "SELECT active, jitsi_room FROM call_sessions WHERE slug = ?",
    req.params.slug,
  );
  if (!row) return res.status(404).json({ error: "not found" });
  if (!row.active) return res.json({ active: false });
  res.json({ active: true, jitsi_room: row.jitsi_room, meet_base: meetBase() });
});

export default router;
