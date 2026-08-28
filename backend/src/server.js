import "dotenv/config";
import http from "node:http";
import express from "express";
import cors from "cors";
import path from "node:path";
import { all, db, get, nowIso, run } from "./db.js";
import { getJwtSecret, hashPassword } from "./auth.js";
import { v4 as uuidv4 } from "uuid";
import { isCurrentIdenticon, saveIdenticon } from "./utils/identicon.js";
import { unlinkUploadUrl } from "./utils/uploadSafe.js";
import { scheduleChatRetention } from "./utils/chatRetention.js";
import { apiOriginGuard, corsOptions, rateLimit, securityHeaders } from "./utils/security.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import blogRoutes from "./routes/blogRoutes.js";
import microRoutes from "./routes/microRoutes.js";
import courseRoutes from "./routes/courseRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import storageRoutes from "./routes/storageRoutes.js";
import libraryRoutes from "./routes/libraryRoutes.js";
import shopRoutes from "./routes/shopRoutes.js";
import workRoutes from "./routes/workRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";

getJwtSecret();

const app = express();
app.set("trust proxy", 1);
app.use(securityHeaders);
app.use(cors(corsOptions()));
app.use(express.json({ limit: "2mb" }));
app.use("/api", apiOriginGuard);

const UPLOAD_ROOT = path.resolve(process.env.UPLOADS_DIR ?? "./data/uploads");
app.use("/uploads", express.static(UPLOAD_ROOT, { maxAge: "1d" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, engine: "js" }));

app.use("/api", authRoutes);
app.use("/api", userRoutes);
app.use("/api", blogRoutes);
app.use("/api", microRoutes);
app.use("/api", courseRoutes);
app.use("/api", uploadRoutes);
app.use("/api", searchRoutes);
app.use("/api", chatRoutes);
app.use("/api", fileRoutes);
app.use("/api", storageRoutes);
app.use("/api", libraryRoutes);
app.use("/api", shopRoutes);
app.use("/api", workRoutes);
app.use("/api", aiRoutes);
app.use("/api", adminRoutes);

app.use("/api", (req, res) => res.status(404).json({ error: "api not found" }));
app.use((err, _req, res, _next) => {
  console.error("api error:", err?.message ?? err);
  res.status(500).json({ error: "internal error" });
});

const server = http.createServer(app);

async function bootstrapAdminFromEnv() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD?.trim();
  if (!email || !password) return;
  if (password.length < 12) {
    console.warn("admin bootstrap: ADMIN_PASSWORD too short (min 12), skipped");
    return;
  }
  const hasAdmin = get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (hasAdmin) return;

  const hash = await hashPassword(password);
  const id = uuidv4();
  run(
    `INSERT INTO users (id, email, password_hash, nickname, role, status, bio, wallpaper_url, avatar_url, created_at)
     VALUES (?, ?, ?, 'admin', 'admin', 'approved', '', '', '', ?)`,
    id,
    email,
    hash,
    nowIso(),
  );
  console.log("admin bootstrap: created first admin from ADMIN_EMAIL");
}

function purgeLegacyUnlimitedInvites() {
  try {
    run(
      "DELETE FROM invite_links WHERE max_uses >= 1000000 AND used_count = 0",
    );
  } catch {
    /* ignore */
  }
}

function backfillIdenticons() {
  const rows = all(
    "SELECT id, nickname FROM users WHERE avatar_url IS NULL OR avatar_url = ''",
  );
  for (const u of rows) {
    try {
      const url = saveIdenticon(u.nickname || u.id, u.id);
      run("UPDATE users SET avatar_url = ? WHERE id = ?", url, u.id);
    } catch {
      /* ignore */
    }
  }
}

/** загруженные аватары всегда растровые, поэтому .svg — только сгенерированные */
function refreshOutdatedIdenticons() {
  const rows = all(
    "SELECT id, nickname, avatar_url FROM users WHERE avatar_url LIKE '/uploads/avatars/%.svg'",
  );
  for (const u of rows) {
    if (isCurrentIdenticon(u.avatar_url)) continue;
    try {
      const url = saveIdenticon(u.nickname || u.id, u.id);
      run("UPDATE users SET avatar_url = ? WHERE id = ?", url, u.id);
      unlinkUploadUrl(u.avatar_url, ["avatars"]);
    } catch {
      /* ignore */
    }
  }
}

const port = Number(process.env.PORT ?? 3000);
server.listen(port, async () => {
  db.prepare("SELECT 1").get();
  try {
    await bootstrapAdminFromEnv();
  } catch (e) {
    console.warn("admin bootstrap warn:", e?.message ?? e);
  }
  try {
    backfillIdenticons();
    refreshOutdatedIdenticons();
  } catch (e) {
    console.warn("identicon seed warn:", e?.message ?? e);
  }
  try {
    purgeLegacyUnlimitedInvites();
  } catch (e) {
    console.warn("purge invites warn:", e?.message ?? e);
  }
  try {
    scheduleChatRetention();
  } catch (e) {
    console.warn("chat retention warn:", e?.message ?? e);
  }
  console.log(`JS backend listening on http://localhost:${port}`);
});
