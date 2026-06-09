import crypto from "node:crypto";
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { db, get, nowIso, run } from "../db.js";
import { authRequired, hashPassword, mintToken, verifyPassword } from "../auth.js";
import { saveIdenticon } from "../utils/identicon.js";
import { ensureUserFollowsAdmins } from "../utils/adminFollow.js";
import { passwordPolicyError } from "../utils/passwordPolicy.js";
import { rateLimit } from "../utils/security.js";

const router = express.Router();
const loginLimit = rateLimit({ windowMs: 60_000, max: 20, keyPrefix: "login" });
const registerLimit = rateLimit({ windowMs: 60_000, max: 10, keyPrefix: "register" });
const qrIssueLimit = rateLimit({ windowMs: 60_000, max: 12, keyPrefix: "qr_issue" });
const qrClaimLimit = rateLimit({ windowMs: 60_000, max: 30, keyPrefix: "qr_claim" });

const QR_TTL_MS = 120_000;

function purgeExpiredQrCodes() {
  run("DELETE FROM qr_login_codes WHERE expires_at < ?", nowIso());
}

function userPayload(row) {
  return {
    id: row.id,
    email: row.email,
    nickname: row.nickname,
    role: row.role,
    status: row.status,
    coins: Math.max(0, Math.floor(Number(row.coins ?? 0))),
  };
}

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
    user: userPayload(row),
  });
});

router.post("/qr/issue", authRequired, qrIssueLimit, (req, res) => {
  purgeExpiredQrCodes();
  const code = crypto.randomBytes(24).toString("hex");
  const now = nowIso();
  const expiresAt = new Date(Date.now() + QR_TTL_MS).toISOString();
  run(
    "INSERT INTO qr_login_codes (code, user_id, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, NULL)",
    code,
    req.user.id,
    now,
    expiresAt,
  );
  return res.json({ code, expires_at: expiresAt, expires_in: Math.floor(QR_TTL_MS / 1000) });
});

router.post("/qr/claim", qrClaimLimit, async (req, res) => {
  const code = String(req.body?.code ?? "").trim();
  if (!/^[a-f0-9]{32,64}$/i.test(code)) {
    return res.status(400).json({ error: "invalid_code" });
  }
  purgeExpiredQrCodes();
  const row = get(
    "SELECT code, user_id, expires_at, used_at FROM qr_login_codes WHERE code = ?",
    code,
  );
  if (!row) return res.status(404).json({ error: "invalid_code" });
  if (row.used_at) return res.status(410).json({ error: "code_used" });
  if (String(row.expires_at) < nowIso()) return res.status(410).json({ error: "code_expired" });

  const user = get(
    "SELECT id, email, nickname, role, status, coins FROM users WHERE id = ?",
    row.user_id,
  );
  if (!user) return res.status(404).json({ error: "invalid_code" });
  if (user.status !== "approved" && user.role !== "admin") {
    return res.status(403).json({ error: "forbidden" });
  }

  run("UPDATE qr_login_codes SET used_at = ? WHERE code = ?", nowIso(), code);
  const token = mintToken(user.id, user.role, 30);
  return res.json({ token, user: userPayload(user) });
});

export default router;
