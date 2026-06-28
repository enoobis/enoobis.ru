import express from "express";
import crypto from "node:crypto";
import ExcelJS from "exceljs";
import { v4 as uuidv4 } from "uuid";
import { all, get, nowIso, run } from "../db.js";
import { authRequired } from "../auth.js";
import { rateLimit } from "../utils/security.js";

const router = express.Router();

/* запас к радиусу — погрешность gps */
const GPS_SLACK_M = 60;
/* не чаще одной отметки на точку за этот интервал */
const CHECKIN_COOLDOWN_MS = 10 * 60 * 1000;

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "forbidden" });
  next();
}

function canCheckin(req, res, next) {
  if (req.user.role !== "master" && req.user.role !== "admin") {
    return res.status(403).json({ error: "forbidden" });
  }
  next();
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function parseCoord(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/* ---------- админ: точки ---------- */

router.get("/admin/work/points", authRequired, adminOnly, (_req, res) => {
  const rows = all(
    `SELECT p.id, p.name, p.lat, p.lng, p.radius_m, p.qr_secret, p.created_at,
       (SELECT COUNT(*) FROM work_checkins c WHERE c.point_id = p.id) AS checkin_count
     FROM work_points p ORDER BY p.created_at DESC`,
  );
  return res.json({ items: rows });
});

router.post("/admin/work/points", authRequired, adminOnly, (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "нужно название" });
  const lat = parseCoord(req.body?.lat, -90, 90);
  const lng = parseCoord(req.body?.lng, -180, 180);
  if (lat === null || lng === null) return res.status(400).json({ error: "нужна точка на карте" });
  const radius = Math.max(50, Math.min(2000, Math.round(Number(req.body?.radius_m) || 250)));
  const id = uuidv4();
  const secret = crypto.randomBytes(18).toString("hex");
  run(
    `INSERT INTO work_points (id, name, lat, lng, radius_m, qr_secret, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    name,
    lat,
    lng,
    radius,
    secret,
    nowIso(),
  );
  const row = get("SELECT id, name, lat, lng, radius_m, qr_secret, created_at FROM work_points WHERE id = ?", id);
  return res.json({ ...row, checkin_count: 0 });
});

router.patch("/admin/work/points/:id", authRequired, adminOnly, (req, res) => {
  const row = get("SELECT id FROM work_points WHERE id = ?", req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  const sets = [];
  const params = [];
  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) return res.status(400).json({ error: "нужно название" });
    sets.push("name = ?");
    params.push(name);
  }
  if (req.body?.lat !== undefined || req.body?.lng !== undefined) {
    const lat = parseCoord(req.body?.lat, -90, 90);
    const lng = parseCoord(req.body?.lng, -180, 180);
    if (lat === null || lng === null) return res.status(400).json({ error: "bad coords" });
    sets.push("lat = ?", "lng = ?");
    params.push(lat, lng);
  }
  if (req.body?.radius_m !== undefined) {
    const radius = Math.max(50, Math.min(2000, Math.round(Number(req.body.radius_m) || 0)));
    sets.push("radius_m = ?");
    params.push(radius);
  }
  if (!sets.length) return res.status(400).json({ error: "nothing to update" });
  params.push(req.params.id);
  run(`UPDATE work_points SET ${sets.join(", ")} WHERE id = ?`, ...params);
  const updated = get(
    "SELECT id, name, lat, lng, radius_m, qr_secret, created_at FROM work_points WHERE id = ?",
    req.params.id,
  );
  return res.json(updated);
});

router.delete("/admin/work/points/:id", authRequired, adminOnly, (req, res) => {
  run("DELETE FROM work_checkins WHERE point_id = ?", req.params.id);
  run("DELETE FROM work_points WHERE id = ?", req.params.id);
  return res.json({ ok: true });
});

/* ---------- админ: отметки ---------- */

function checkinsBetween(fromIso, toIso, pointId = null) {
  const params = [fromIso, toIso];
  let pointSql = "";
  if (pointId) {
    pointSql = " AND c.point_id = ?";
    params.push(pointId);
  }
  return all(
    `SELECT c.id, c.created_at, c.distance_m, c.point_id,
       u.nickname, u.full_name, p.name AS point_name
     FROM work_checkins c
     JOIN users u ON u.id = c.user_id
     JOIN work_points p ON p.id = c.point_id
     WHERE c.created_at >= ? AND c.created_at < ?${pointSql}
     ORDER BY c.created_at DESC`,
    ...params,
  );
}

function parseRange(req) {
  const from = String(req.query?.from ?? "").trim();
  const to = String(req.query?.to ?? "").trim();
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return {
    fromIso: new Date(fromMs).toISOString(),
    toIso: new Date(toMs).toISOString(),
  };
}

router.get("/admin/work/checkins", authRequired, adminOnly, (req, res) => {
  const range = parseRange(req);
  if (!range) return res.status(400).json({ error: "bad range" });
  const pointId = String(req.query?.point_id ?? "").trim() || null;
  if (pointId && !get("SELECT id FROM work_points WHERE id = ?", pointId)) {
    return res.status(400).json({ error: "bad point" });
  }
  return res.json({ items: checkinsBetween(range.fromIso, range.toIso, pointId) });
});

function fmtWorkDate(d) {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${d.getFullYear()}`;
}

function fmtWorkTime(d) {
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function datesInRange(fromIso, toIso) {
  const dates = [];
  const cur = new Date(fromIso);
  const end = new Date(toIso);
  cur.setHours(0, 0, 0, 0);
  while (cur < end) {
    dates.push(fmtWorkDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function personLabel(row) {
  const name = String(row.full_name ?? "").trim();
  if (name && name.toLowerCase() !== row.nickname.toLowerCase()) {
    return `${name} · ${row.nickname}`;
  }
  return name || row.nickname;
}

router.get("/admin/work/export", authRequired, adminOnly, async (req, res) => {
  const range = parseRange(req);
  if (!range) return res.status(400).json({ error: "bad range" });
  const pointId = String(req.query?.point_id ?? "").trim() || null;
  if (pointId && !get("SELECT id FROM work_points WHERE id = ?", pointId)) {
    return res.status(400).json({ error: "bad point" });
  }
  const rows = checkinsBetween(range.fromIso, range.toIso, pointId);
  const dateCols = datesInRange(range.fromIso, range.toIso);

  const byUser = new Map();
  for (const r of rows) {
    const key = r.nickname;
    if (!byUser.has(key)) {
      byUser.set(key, { label: personLabel(r), byDate: {} });
    }
    const entry = byUser.get(key);
    const dk = fmtWorkDate(new Date(r.created_at));
    if (!entry.byDate[dk]) entry.byDate[dk] = [];
    entry.byDate[dk].push(fmtWorkTime(new Date(r.created_at)));
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("отметки");
  ws.addRow(["имя", ...dateCols]);
  ws.getRow(1).font = { bold: true };
  ws.getColumn(1).width = 28;
  dateCols.forEach((_, i) => {
    ws.getColumn(i + 2).width = 12;
  });

  const users = [...byUser.values()].sort((a, b) => a.label.localeCompare(b.label, "ru"));
  for (const u of users) {
    const line = [u.label];
    for (const d of dateCols) {
      const times = u.byDate[d];
      line.push(times?.length ? times.join(", ") : "");
    }
    ws.addRow(line);
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", 'attachment; filename="checkins.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

/* ---------- мастер: отметка ---------- */

router.post(
  "/work/checkin",
  rateLimit({ keyPrefix: "work_checkin", max: 12, windowMs: 60_000 }),
  authRequired,
  canCheckin,
  (req, res) => {
    const code = String(req.body?.code ?? "").trim();
    if (!code) return res.status(400).json({ error: "нет кода" });
    const lat = parseCoord(req.body?.lat, -90, 90);
    const lng = parseCoord(req.body?.lng, -180, 180);
    if (lat === null || lng === null) {
      return res.status(400).json({ error: "нет геолокации" });
    }

    const point = get(
      "SELECT id, name, lat, lng, radius_m FROM work_points WHERE qr_secret = ?",
      code,
    );
    if (!point) return res.status(404).json({ error: "qr не распознан" });

    const distance = haversineMeters(lat, lng, point.lat, point.lng);
    if (distance > point.radius_m + GPS_SLACK_M) {
      return res.status(403).json({
        error: `вы не на месте (${distance} м от точки)`,
        distance_m: distance,
      });
    }

    const last = get(
      `SELECT created_at FROM work_checkins
       WHERE user_id = ? AND point_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      req.user.id,
      point.id,
    );
    if (last && Date.now() - Date.parse(last.created_at) < CHECKIN_COOLDOWN_MS) {
      return res.status(409).json({ error: "уже отмечено" });
    }

    const id = uuidv4();
    const now = nowIso();
    run(
      `INSERT INTO work_checkins (id, point_id, user_id, lat, lng, distance_m, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      point.id,
      req.user.id,
      lat,
      lng,
      distance,
      now,
    );
    return res.json({
      ok: true,
      point_name: point.name,
      distance_m: distance,
      created_at: now,
    });
  },
);

export default router;
