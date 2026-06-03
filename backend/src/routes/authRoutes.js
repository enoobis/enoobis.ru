import express from "express";
import { v4 as uuidv4 } from "uuid";
import { db, get, nowIso, run } from "../db.js";
import { hashPassword, mintToken, verifyPassword } from "../auth.js";
import { saveIdenticon } from "../utils/identicon.js";
import { ensureUserFollowsAdmins } from "../utils/adminFollow.js";
import { passwordPolicyError } from "../utils/passwordPolicy.js";
import { rateLimit } from "../utils/security.js";

const router = express.Router();
const loginLimit = rateLimit({ windowMs: 60_000, max: 20, keyPrefix: "login" });
const registerLimit = rateLimit({ windowMs: 60_000, max: 10, keyPrefix: "register" });

function validNickname(n) {
  return /^[A-Za-z0-9_]{3,32}$/.test(n ?? "");
}

router.post("/register", registerLimit, async (req, res) => {
  const { email = "", password = "", nickname = "", invite_code } = req.body ?? {};
  const normEmail = String(email).trim().toLowerCase();
  const policyErr = passwordPolicyError(password);
  if (!normEmail || policyErr) {
    return res.status(400).json({ error: policyErr ?? "invalid_email" });
  }
  if (!validNickname(nickname)) {
    return res.status(400).json({ error: "nickname: 3-32 chars, letters, digits, underscore" });
  }

  let role = "student";
  let status = "pending";
  let inviteId = null;
  if (invite_code && String(invite_code).trim()) {
    const invite = get(
      "SELECT id, max_uses, used_count, target_role FROM invite_links WHERE code = ?",
      String(invite_code).trim(),
    );
    if (!invite) return res.status(400).json({ error: "invalid invite code" });
    inviteId = invite.id;
    role = invite.target_role === "teacher" ? "teacher" : "student";
    status = "approved";
  }

  try {
    const hash = await hashPassword(password);
    const created = db.transaction(() => {
      if (inviteId) {
        const bumped = run(
          "UPDATE invite_links SET used_count = used_count + 1 WHERE id = ? AND used_count < max_uses",
          inviteId,
        );
        if (!bumped.changes) throw new Error("invite_exhausted");
      }
      const id = uuidv4();
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
        normEmail,
        hash,
        nickname,
        role,
        status,
        avatarUrl,
        nowIso(),
      );
      return { id, role, status, normEmail, nickname, avatarUrl };
    })();

    ensureUserFollowsAdmins(created.id);

    if (created.status === "pending") {
      return res.json({ pending: true, message: "Ожидайте одобрения администратора" });
    }
    const token = mintToken(created.id, created.role, 30);
    return res.json({
      pending: false,
      token,
      user: {
        id: created.id,
        email: created.normEmail,
        nickname: created.nickname,
        role: created.role,
        status: "approved",
        coins: 0,
      },
      message: null,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "invite_exhausted") {
      return res.status(400).json({ error: "invite exhausted" });
    }
    return res.status(409).json({ error: "registration_failed" });
  }
});

router.post("/login", loginLimit, async (req, res) => {
  const { email = "", password = "" } = req.body ?? {};
  const normEmail = String(email).trim().toLowerCase();
  const row = get(
    "SELECT id, email, nickname, role, status, password_hash, coins FROM users WHERE email = ?",
    normEmail,
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
