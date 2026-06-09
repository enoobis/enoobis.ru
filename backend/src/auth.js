import jwt from "jsonwebtoken";
import argon2 from "argon2";
import { get, run } from "./db.js";

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  if (process.env.NODE_ENV === "production") {
    if (!secret || secret.length < 32) {
      throw new Error("JWT_SECRET must be set in production (min 32 chars)");
    }
    return secret;
  }
  return secret || "dev-secret-change-me";
}

export async function hashPassword(password) {
  return argon2.hash(password);
}

export async function verifyPassword(password, hash) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

function tokenVersionFor(userId) {
  return Number(get("SELECT token_version FROM users WHERE id = ?", userId)?.token_version ?? 0);
}

export function bumpTokenVersion(userId) {
  run(
    "UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = ?",
    userId,
  );
}

export function mintToken(userId, role, days = 30) {
  const tv = tokenVersionFor(userId);
  const expSec = Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
  return jwt.sign({ sub: userId, role, tv, exp: expSec }, getJwtSecret());
}

/**
 * @param {string} userId
 * @param {string} scope
 * @param {string} resourceId
 * @param {number} [ttlSec]
 */
export function mintScopedAccessToken(userId, scope, resourceId, ttlSec = 900) {
  return jwt.sign({ sub: userId, scope, rid: resourceId }, getJwtSecret(), {
    expiresIn: ttlSec,
  });
}

/**
 * @param {string} token
 * @param {string} scope
 * @param {string} resourceId
 */
export function verifyScopedAccessToken(token, scope, resourceId) {
  const claims = jwt.verify(token, getJwtSecret());
  if (typeof claims !== "object" || claims === null) throw new Error("invalid");
  const c = /** @type {{ sub?: string; scope?: string; rid?: string }} */ (claims);
  if (c.scope !== scope || c.rid !== resourceId || !c.sub) throw new Error("invalid scope");
  return c.sub;
}

function bearerFromHeader(req) {
  const auth = req.headers.authorization ?? "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return "";
}

function attachUserFromToken(req, res, next, token) {
  if (!token) return res.status(401).json({ error: "unauthorized" });

  let claims;
  try {
    claims = jwt.verify(token, getJwtSecret());
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }

  const c = typeof claims === "object" && claims ? claims : {};
  const sub = "sub" in c ? String(c.sub) : "";
  const tvClaim = "tv" in c ? Number(c.tv) : 0;
  const row = get("SELECT id, role, status, token_version FROM users WHERE id = ?", sub);
  if (!row) return res.status(401).json({ error: "unauthorized" });
  if (Number(row.token_version ?? 0) !== tvClaim) {
    return res.status(401).json({ error: "unauthorized" });
  }
  if (row.status !== "approved" && row.role !== "admin") {
    return res.status(403).json({ error: "not approved" });
  }
  req.user = { id: row.id, role: row.role, status: row.status };
  next();
}

export function authRequired(req, res, next) {
  attachUserFromToken(req, res, next, bearerFromHeader(req));
}

/**
 * Resolve a viewer id from an optional Bearer token. Returns null when the
 * token is missing, invalid, the user no longer exists, or the token was
 * revoked via token_version bump. Never throws.
 * @param {import("express").Request} req
 * @returns {string | null}
 */
export function optionalUserId(req) {
  const token = bearerFromHeader(req);
  if (!token) return null;
  try {
    const claims = jwt.verify(token, getJwtSecret());
    const c = typeof claims === "object" && claims ? claims : {};
    const sub = "sub" in c ? String(c.sub) : "";
    if (!sub) return null;
    const tvClaim = "tv" in c ? Number(c.tv) : 0;
    const row = get("SELECT token_version FROM users WHERE id = ?", sub);
    if (!row) return null;
    if (Number(row.token_version ?? 0) !== tvClaim) return null;
    return sub;
  } catch {
    return null;
  }
}
