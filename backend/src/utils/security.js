import path from "node:path";

/**
 * @param {string} rootDir
 * @param {string} relative
 * @returns {string | null}
 */
export function safePathUnder(rootDir, relative) {
  const root = path.resolve(rootDir);
  const base = path.basename(String(relative ?? ""));
  if (!base || base === "." || base === "..") return null;
  const abs = path.resolve(root, base);
  if (!abs.startsWith(root + path.sep)) return null;
  return abs;
}

/**
 * @param {import("express").Request} req
 */
function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.trim()) {
    return fwd.split(",")[0].trim();
  }
  return req.socket?.remoteAddress ?? "unknown";
}

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export function securityHeaders(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=(self)");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'self'; base-uri 'none'",
  );
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

function allowedOrigins() {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * CSRF mitigation for browser clients: mutating requests must match CORS_ORIGIN.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export function apiOriginGuard(req, res, next) {
  const allowed = allowedOrigins();
  if (!allowed.length) return next();
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return next();
  }
  const origin = req.headers.origin;
  if (!origin || !allowed.includes(origin)) {
    return res.status(403).json({ error: "forbidden" });
  }
  next();
}

const BLOCKED_UPLOAD_EXT = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".com",
  ".msi",
  ".sh",
  ".php",
  ".js",
  ".mjs",
  ".html",
  ".htm",
  ".svg",
  ".jar",
]);

/**
 * @param {string} originalName
 */
export function assertSafeUploadExtension(originalName) {
  const ext = path.extname(String(originalName ?? "")).toLowerCase();
  if (!ext || BLOCKED_UPLOAD_EXT.has(ext)) throw new Error("blocked file type");
}

/**
 * @returns {import("cors").CorsOptions | boolean}
 */
export function corsOptions() {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (raw) {
    const origins = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (origins.length) return { origin: origins, credentials: true };
  }
  if (process.env.NODE_ENV === "production") {
    return { origin: false };
  }
  return true;
}

const buckets = new Map();

/**
 * @param {{ windowMs?: number, max?: number, keyPrefix?: string, keyFn?: (req: import("express").Request) => string }} opts
 */
export function rateLimit(opts = {}) {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 30;
  const keyPrefix = opts.keyPrefix ?? "rl";

  return (req, res, next) => {
    const suffix = opts.keyFn ? opts.keyFn(req) : clientIp(req);
    const key = `${keyPrefix}:${suffix}`;
    const now = Date.now();
    let entry = buckets.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json({ error: "too_many_requests" });
    }
    next();
  };
}
