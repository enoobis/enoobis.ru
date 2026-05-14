import express from "express";
import { run, get, all, nowIso } from "../db.js";
import { authRequired } from "../auth.js";

const router = express.Router();

/** @type {Set<string>} */
const SHOP_KINDS = new Set(["avatar", "frame", "wallpaper", "cover"]);

function ownedIdsForUser(userId) {
  return new Set(
    all("SELECT item_id FROM user_owned_shop_items WHERE user_id = ?", userId).map((r) => r.item_id),
  );
}

/** @param {string[]} kinds */
function listItemsQuery(kinds) {
  const placeholders = kinds.map(() => "?").join(", ");
  return all(
    `SELECT id, kind, name, url, price, is_animated, created_at FROM shop_items
     WHERE kind IN (${placeholders}) ORDER BY created_at DESC`,
    ...kinds,
  );
}

function cosmeticRow(userId) {
  return get(
    "SELECT avatar_url, wallpaper_url, avatar_frame_url, profile_cover_url FROM users WHERE id = ?",
    userId,
  );
}

router.get("/shop/items", authRequired, (req, res) => {
  const raw = String(req.query.kind ?? "").trim();
  const kinds = raw && SHOP_KINDS.has(raw) ? [raw] : ["avatar", "frame", "wallpaper", "cover"];
  const items = listItemsQuery(kinds);
  const owned = ownedIdsForUser(req.user.id);
  return res.json(items.map((i) => ({ ...i, owned: owned.has(i.id) })));
});

router.get("/shop/avatars", authRequired, (req, res) => {
  const items = listItemsQuery(["avatar"]);
  const owned = ownedIdsForUser(req.user.id);
  return res.json(items.map((i) => ({ ...i, owned: owned.has(i.id) })));
});

router.get("/shop/my-items", authRequired, (req, res) => {
  const rows = all(
    `SELECT si.id, si.kind, si.name, si.url, si.price, si.is_animated, uoi.acquired_at
     FROM user_owned_shop_items uoi
     JOIN shop_items si ON si.id = uoi.item_id
     WHERE uoi.user_id = ?
     ORDER BY uoi.acquired_at DESC`,
    req.user.id,
  );
  return res.json(rows);
});

router.get("/shop/my-avatars", authRequired, (req, res) => {
  const rows = all(
    `SELECT si.id, si.name, si.url, si.price, si.is_animated, uoi.acquired_at
     FROM user_owned_shop_items uoi
     JOIN shop_items si ON si.id = uoi.item_id
     WHERE uoi.user_id = ? AND si.kind = 'avatar'
     ORDER BY uoi.acquired_at DESC`,
    req.user.id,
  );
  return res.json(rows);
});

router.post("/shop/items/:id/buy", authRequired, (req, res) => {
  const item = get("SELECT id, kind, name, url, price FROM shop_items WHERE id = ?", req.params.id);
  if (!item) return res.status(404).json({ error: "not found" });
  if (!SHOP_KINDS.has(item.kind)) return res.status(400).json({ error: "bad kind" });

  const already = get("SELECT 1 FROM user_owned_shop_items WHERE user_id = ? AND item_id = ?", req.user.id, item.id);
  if (already) return res.status(400).json({ error: "already owned" });

  const user = get("SELECT coins FROM users WHERE id = ?", req.user.id);
  const coins = Math.max(0, Math.floor(Number(user?.coins ?? 0)));
  if (coins < item.price) return res.status(400).json({ error: "not enough coins" });

  run("UPDATE users SET coins = coins - ? WHERE id = ?", item.price, req.user.id);
  run(
    "INSERT INTO user_owned_shop_items (user_id, item_id, acquired_at) VALUES (?, ?, ?)",
    req.user.id,
    item.id,
    nowIso(),
  );

  const newCoins = Math.max(0, coins - item.price);
  return res.json({ ok: true, coins: newCoins });
});

router.post("/shop/avatars/:id/buy", authRequired, (req, res) => {
  const item = get("SELECT id, kind, name, url, price FROM shop_items WHERE id = ? AND kind = 'avatar'", req.params.id);
  if (!item) return res.status(404).json({ error: "not found" });
  const already = get("SELECT 1 FROM user_owned_shop_items WHERE user_id = ? AND item_id = ?", req.user.id, item.id);
  if (already) return res.status(400).json({ error: "already owned" });
  const user = get("SELECT coins FROM users WHERE id = ?", req.user.id);
  const coins = Math.max(0, Math.floor(Number(user?.coins ?? 0)));
  if (coins < item.price) return res.status(400).json({ error: "not enough coins" });
  run("UPDATE users SET coins = coins - ? WHERE id = ?", item.price, req.user.id);
  run(
    "INSERT INTO user_owned_shop_items (user_id, item_id, acquired_at) VALUES (?, ?, ?)",
    req.user.id,
    item.id,
    nowIso(),
  );
  return res.json({ ok: true, coins: Math.max(0, coins - item.price) });
});

/** @param {{ kind: string; url: string }} item */
function applyEquip(userId, item) {
  if (item.kind === "avatar") {
    run("UPDATE users SET avatar_url = ? WHERE id = ?", item.url, userId);
  } else if (item.kind === "frame") {
    run("UPDATE users SET avatar_frame_url = ? WHERE id = ?", item.url, userId);
  } else if (item.kind === "wallpaper") {
    run("UPDATE users SET wallpaper_url = ? WHERE id = ?", item.url, userId);
  } else if (item.kind === "cover") {
    run("UPDATE users SET profile_cover_url = ? WHERE id = ?", item.url, userId);
  }
}

router.post("/shop/items/:id/equip", authRequired, (req, res) => {
  const item = get("SELECT id, kind, url FROM shop_items WHERE id = ?", req.params.id);
  if (!item) return res.status(404).json({ error: "not found" });

  const owned = get("SELECT 1 FROM user_owned_shop_items WHERE user_id = ? AND item_id = ?", req.user.id, item.id);
  if (!owned) return res.status(403).json({ error: "not owned" });

  applyEquip(req.user.id, item);
  const row = cosmeticRow(req.user.id);
  return res.json({
    ok: true,
    avatar_url: row?.avatar_url ?? "",
    wallpaper_url: row?.wallpaper_url ?? "",
    avatar_frame_url: row?.avatar_frame_url ?? "",
    profile_cover_url: row?.profile_cover_url ?? "",
  });
});

router.post("/shop/avatars/:id/equip", authRequired, (req, res) => {
  const item = get("SELECT id, kind, url FROM shop_items WHERE id = ? AND kind = 'avatar'", req.params.id);
  if (!item) return res.status(404).json({ error: "not found" });
  const owned = get("SELECT 1 FROM user_owned_shop_items WHERE user_id = ? AND item_id = ?", req.user.id, item.id);
  if (!owned) return res.status(403).json({ error: "not owned" });
  applyEquip(req.user.id, item);
  const row = cosmeticRow(req.user.id);
  return res.json({
    ok: true,
    avatar_url: row?.avatar_url ?? "",
    wallpaper_url: row?.wallpaper_url ?? "",
    avatar_frame_url: row?.avatar_frame_url ?? "",
    profile_cover_url: row?.profile_cover_url ?? "",
  });
});

export default router;
