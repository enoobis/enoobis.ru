import express from "express";
import { v4 as uuidv4 } from "uuid";
import { get, nowIso, run } from "../db.js";
import { hashPassword, mintToken, verifyPassword } from "../auth.js";
import { saveIdenticon } from "../utils/identicon.js";

const router = express.Router();

function validNickname(n) {
  return /^[A-Za-z0-9_]{3,32}$/.test(n ?? "");
}

router.post("/register", async (req, res) => {
  const { email = "", password = "", nickname = "", invite_code } = req.body ?? {};
  if (!email || password.length < 8) {
    return res.status(400).json({ error: "нужен email, пароль минимум 8 символов" });
  }
  if (!validNickname(nickname)) {
    return res.status(400).json({ error: "nickname: 3-32 chars, letters, digits, underscore" });
  }

  let role = "student";
  let status = "pending";
  if (invite_code && String(invite_code).trim()) {
    const invite = get(
      "SELECT id, max_uses, used_count, target_role FROM invite_links WHERE code = ?",
      String(invite_code).trim(),
    );
    if (!invite) return res.status(400).json({ error: "invalid invite code" });
    if (invite.used_count >= invite.max_uses) return res.status(400).json({ error: "invite exhausted" });
    run("UPDATE invite_links SET used_count = used_count + 1 WHERE id = ?", invite.id);
    role = invite.target_role === "teacher" ? "teacher" : "student";
    status = "approved";
  }

  try {
    const id = uuidv4();
    const hash = await hashPassword(password);
    let avatarUrl = "";
    try {
      avatarUrl = saveIdenticon(nickname, id);
    } catch {
      avatarUrl = "";
    }
    run(
      `INSERT INTO users
      (id, email, password_hash, nickname, role, status, bio, wallpaper_url, avatar_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, '', '', ?, ?)`,
      id,
      email,
      hash,
      nickname,
      role,
      status,
      avatarUrl,
      nowIso(),
    );

    if (status === "pending") {
      return res.json({ pending: true, message: "Ожидайте одобрения администратора" });
    }
    const token = mintToken(id, role, 30);
    return res.json({
      pending: false,
      token,
      user: { id, email, nickname, role, status: "approved", coins: 0 },
      message: null,
    });
  } catch {
    return res.status(409).json({ error: "email or nickname taken" });
  }
});

router.post("/login", async (req, res) => {
  const { email = "", password = "" } = req.body ?? {};
  const row = get(
    "SELECT id, email, nickname, role, status, password_hash, coins FROM users WHERE email = ?",
    email,
  );
  if (!row) return res.status(401).json({ error: "unauthorized" });
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return res.status(401).json({ error: "unauthorized" });
  if (row.status !== "approved") return res.status(403).json({ error: "forbidden" });
  const token = mintToken(row.id, row.role, 30);
  return res.json({
    token,
    user: {
      id: row.id,
      email: row.email,
      nickname: row.nickname,
      role: row.role,
      status: row.status,
      coins: Math.max(0, Math.floor(Number(row.coins ?? 0))),
    },
  });
});

export default router;
