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

/** база своего jitsi (docker), без слэша в конце — не meet.jit.si */
function jitsiBaseOrNull() {
  const raw = process.env.JITSI_MEET_BASE?.trim() ?? process.env.CALL_MEET_BASE?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

router.post("/calls", authRequired, (req, res) => {
  const base = jitsiBaseOrNull();
  if (!base) {
    res.status(503).json({
      error:
        "звонки: укажите JITSI_MEET_BASE — url своего jitsi meet (docker), например https://meet.твой-домен",
    });
    return;
  }

  const slug = randomSlug();
  const jitsi_room = randomJitsiRoom();
  const iso = nowIso();
  try {
    run(
      `INSERT INTO call_sessions (slug, jitsi_room, embed_url, active, created_by_user_id, created_at)
       VALUES (?, ?, '', 1, ?, ?)`,
      slug,
      jitsi_room,
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
  const row = get(
    "SELECT active, jitsi_room FROM call_sessions WHERE slug = ?",
    req.params.slug,
  );
  if (!row) return res.status(404).json({ error: "not found" });
  if (!row.active || !row.jitsi_room) return res.json({ active: false });
  const meet_base = jitsiBaseOrNull();
  if (!meet_base) return res.json({ active: false });
  res.json({ active: true, jitsi_room: row.jitsi_room, meet_base });
});

export default router;
