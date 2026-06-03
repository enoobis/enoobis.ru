import jwt from "jsonwebtoken";
import argon2 from "argon2";
import { get } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

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

export function mintToken(userId, role, days = 30) {
  const expSec = Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
  return jwt.sign({ sub: userId, role, exp: expSec }, JWT_SECRET);
}

function bearerTokenFromRequest(req) {
  const auth = req.headers.authorization ?? "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  const q = req.query?.token;
  if (typeof q === "string" && q.trim()) return q.trim();
  return "";
}

function attachUserFromToken(req, res, next, token) {
  if (!token) return res.status(401).json({ error: "unauthorized" });

  let claims;
  try {
    claims = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }

  const row = get("SELECT id, role, status FROM users WHERE id = ?", claims.sub);
  if (!row) return res.status(401).json({ error: "unauthorized" });
  req.user = row;
  next();
}

export function authRequired(req, res, next) {
  attachUserFromToken(req, res, next, bearerTokenFromRequest(req));
}

/** для встроенного просмотра pdf (iframe/embed не шлёт Authorization) */
export function authFromBearerOrQuery(req, res, next) {
  attachUserFromToken(req, res, next, bearerTokenFromRequest(req));
}
