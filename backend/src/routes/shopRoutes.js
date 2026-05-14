import express from "express";
import { v4 as uuidv4 } from "uuid";
import { run, get, all, nowIso } from "../db.js";
import { authRequired } from "../auth.js";

const router = express.Router();

router.get("/shop/avatars", authRequired, (req, res) => {
  const avatars = all("SELECT id, name, url, price, is_animated, created_at FROM shop_avatars ORDER BY created_at DESC");
  const owned = new Set(
    all("SELECT avatar_id FROM user_owned_avatars WHERE user_id = ?", req.user.id).map((r) => r.avatar_id),
  );
  return res.json(avatars.map((a) => ({ ...a, owned: owned.has(a.id) })));
});

router.get("/shop/my-avatars", authRequired, (req, res) => {
  const rows = all(
    `SELECT sa.id, sa.name, sa.url, sa.price, sa.is_animated, uoa.acquired_at
     FROM user_owned_avatars uoa
     JOIN shop_avatars sa ON sa.id = uoa.avatar_id
     WHERE uoa.user_id = ?
     ORDER BY uoa.acquired_at DESC`,
    req.user.id,
  );
  return res.json(rows);
});

router.post("/shop/avatars/:id/buy", authRequired, (req, res) => {
  const avatar = get("SELECT id, name, url, price FROM shop_avatars WHERE id = ?", req.params.id);
  if (!avatar) return res.status(404).json({ error: "not found" });

  const already = get("SELECT 1 FROM user_owned_avatars WHERE user_id = ? AND avatar_id = ?", req.user.id, avatar.id);
  if (already) return res.status(400).json({ error: "already owned" });

  const user = get("SELECT coins FROM users WHERE id = ?", req.user.id);
  const coins = Math.max(0, Math.floor(Number(user?.coins ?? 0)));
  if (coins < avatar.price) return res.status(400).json({ error: "not enough coins" });

  run("UPDATE users SET coins = coins - ? WHERE id = ?", avatar.price, req.user.id);
  run(
    "INSERT INTO user_owned_avatars (user_id, avatar_id, acquired_at) VALUES (?, ?, ?)",
    req.user.id, avatar.id, nowIso(),
  );

  const newCoins = Math.max(0, coins - avatar.price);
  return res.json({ ok: true, coins: newCoins });
});

router.post("/shop/avatars/:id/equip", authRequired, (req, res) => {
  const avatar = get("SELECT id, url FROM shop_avatars WHERE id = ?", req.params.id);
  if (!avatar) return res.status(404).json({ error: "not found" });

  const owned = get("SELECT 1 FROM user_owned_avatars WHERE user_id = ? AND avatar_id = ?", req.user.id, avatar.id);
  if (!owned) return res.status(403).json({ error: "not owned" });

  run("UPDATE users SET avatar_url = ? WHERE id = ?", avatar.url, req.user.id);
  return res.json({ ok: true, avatar_url: avatar.url });
});

export default router;
