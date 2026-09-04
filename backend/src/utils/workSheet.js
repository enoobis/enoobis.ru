import crypto from "node:crypto";
import { all, get, nowIso, run } from "../db.js";

export const WORK_TZ = "Europe/Moscow";

export function workDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: WORK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function nextDayKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function enumerateDays(fromKey, toKey) {
  const days = [];
  let cur = fromKey;
  for (let i = 0; i < 4000; i += 1) {
    days.push(cur);
    if (cur === toKey) break;
    cur = nextDayKey(cur);
  }
  return days;
}

export function ensureSheetToken() {
  const row = get("SELECT token FROM work_sheet WHERE id = 1");
  if (row?.token) return row.token;
  const token = crypto.randomBytes(24).toString("hex");
  run("INSERT INTO work_sheet (id, token, created_at) VALUES (1, ?, ?)", token, nowIso());
  return token;
}

export function sheetTokenValid(token) {
  const expected = ensureSheetToken();
  return Boolean(token) && token === expected;
}

function startDayKey() {
  const firstCheckin = get("SELECT created_at FROM work_checkins ORDER BY created_at ASC LIMIT 1");
  const firstPoint = get("SELECT created_at FROM work_points ORDER BY created_at ASC LIMIT 1");
  const candidates = [firstCheckin?.created_at, firstPoint?.created_at].filter(Boolean);
  if (!candidates.length) return workDayKey();
  return candidates.map((iso) => workDayKey(new Date(iso))).sort()[0];
}

export function buildWorkSheet() {
  const today = workDayKey();
  const days = enumerateDays(startDayKey(), today);
  const masters = all(
    `SELECT id, nickname, full_name
     FROM users
     WHERE role = 'master' AND status = 'approved'
     ORDER BY nickname COLLATE NOCASE`,
  );
  const hits = all("SELECT user_id, created_at FROM work_checkins");
  const byUser = new Map();
  for (const h of hits) {
    const day = workDayKey(new Date(h.created_at));
    if (!byUser.has(h.user_id)) byUser.set(h.user_id, new Set());
    byUser.get(h.user_id).add(day);
  }

  const rows = masters.map((u) => {
    const seen = byUser.get(u.id) ?? new Set();
    return {
      nickname: u.nickname,
      name: String(u.full_name ?? "").trim(),
      marks: days.map((day) => {
        if (day === today) return "";
        return seen.has(day) ? "1" : "0";
      }),
    };
  });

  return {
    days: days.map((date, i) => ({ n: i + 1, date, done: date !== today })),
    rows,
  };
}
