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

function dailyRoomNameForSlug(slug) {
  return `enoobis${slug}`;
}

async function createDailyRoom(slug) {
  const key = process.env.DAILY_API_KEY?.trim();
  if (!key) throw new Error("daily key missing");
  const name = dailyRoomNameForSlug(slug);
  const exp = Math.floor(Date.now() / 1000) + 6 * 3600;
  const res = await fetch("https://api.daily.co/v1/rooms", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      privacy: "public",
      properties: {
        exp,
        enable_prejoin_ui: false,
      },
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`daily: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = /** @type {{ url?: string }} */ (JSON.parse(text));
  if (!data.url) throw new Error("daily: no room url");
  return data.url;
}

async function deleteDailyRoom(slug) {
  const key = process.env.DAILY_API_KEY?.trim();
  if (!key) return;
  const name = dailyRoomNameForSlug(slug);
  try {
    await fetch(`https://api.daily.co/v1/rooms/${encodeURIComponent(name)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}` },
    });
  } catch {
    /* room exp may have already removed it */
  }
}

router.post("/calls", authRequired, async (req, res) => {
  const slug = randomSlug();
  const iso = nowIso();
  const useDaily = Boolean(process.env.DAILY_API_KEY?.trim());

  try {
    if (useDaily) {
      const embed_url = await createDailyRoom(slug);
      run(
        `INSERT INTO call_sessions (slug, jitsi_room, embed_url, active, created_by_user_id, created_at)
         VALUES (?, '', ?, 1, ?, ?)`,
        slug,
        embed_url,
        req.user.id,
        iso,
      );
    } else {
      const jitsi_room = randomJitsiRoom();
      run(
        `INSERT INTO call_sessions (slug, jitsi_room, embed_url, active, created_by_user_id, created_at)
         VALUES (?, ?, '', 1, ?, ?)`,
        slug,
        jitsi_room,
        req.user.id,
        iso,
      );
    }
    res.json({ slug });
  } catch (e) {
    console.error("create call session", e);
    res.status(500).json({
      error:
        useDaily
          ? "не удалось создать комнату (проверь DAILY_API_KEY)"
          : "не удалось создать звонок",
    });
  }
});

router.post("/calls/:slug/end", async (req, res) => {
  const row = get("SELECT slug, embed_url FROM call_sessions WHERE slug = ?", req.params.slug);
  if (!row) return res.status(404).json({ error: "not found" });
  run(
    "UPDATE call_sessions SET active = 0, ended_at = COALESCE(ended_at, ?) WHERE slug = ?",
    nowIso(),
    req.params.slug,
  );
  if (row.embed_url) await deleteDailyRoom(req.params.slug);
  res.json({ ok: true });
});

router.get("/calls/:slug", (req, res) => {
  const row = get(
    "SELECT active, jitsi_room, embed_url FROM call_sessions WHERE slug = ?",
    req.params.slug,
  );
  if (!row) return res.status(404).json({ error: "not found" });
  if (!row.active) return res.json({ active: false });
  if (row.embed_url) {
    res.json({ active: true, embed_url: row.embed_url });
    return;
  }
  res.json({ active: true, jitsi_room: row.jitsi_room, meet_base: meetBase() });
});

export default router;
