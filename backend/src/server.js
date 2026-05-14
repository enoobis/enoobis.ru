import "dotenv/config";
import http from "node:http";
import express from "express";
import cors from "cors";
import path from "node:path";
import { all, db, get, nowIso, run } from "./db.js";
import { hashPassword } from "./auth.js";
import { v4 as uuidv4 } from "uuid";
import { saveIdenticon } from "./utils/identicon.js";
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

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

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
app.use("/api", adminRoutes);

app.use("/api", (req, res) => res.status(404).json({ error: "api not found" }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal error" });
});

const server = http.createServer(app);

async function ensureAdminAccount() {
  const adminEmail = "REDACTED";
  const password = "REDACTED";
  const hash = await hashPassword(password);
  const existing = get("SELECT id FROM users WHERE email = ?", adminEmail);
  if (existing) {
    run(
      "UPDATE users SET password_hash = ?, role = 'admin', status = 'approved' WHERE id = ?",
      hash,
      existing.id,
    );
    return;
  }
  const anyAdmin = get("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1");
  if (anyAdmin) {
    run("UPDATE users SET email = ?, password_hash = ?, status = 'approved' WHERE id = ?",
      adminEmail, hash, anyAdmin.id);
    return;
  }
  const id = uuidv4();
  run(
    `INSERT INTO users (id, email, password_hash, nickname, role, status, bio, wallpaper_url, avatar_url, created_at)
     VALUES (?, ?, ?, 'enoobis_admin', 'admin', 'approved', 'Системный администратор', '', '', ?)`,
    id,
    adminEmail,
    hash,
    nowIso(),
  );
}

function purgeLegacyUnlimitedInvites() {
  try {
    run(
      "DELETE FROM invite_links WHERE max_uses >= 1000000 AND used_count = 0",
    );
  } catch {}
}

function backfillIdenticons() {
  const rows = all(
    "SELECT id, nickname FROM users WHERE avatar_url IS NULL OR avatar_url = ''",
  );
  for (const u of rows) {
    try {
      const url = saveIdenticon(u.nickname || u.id, u.id);
      run("UPDATE users SET avatar_url = ? WHERE id = ?", url, u.id);
    } catch {}
  }
}

const port = Number(process.env.PORT ?? 3000);
server.listen(port, async () => {
  db.prepare("SELECT 1").get();
  try {
    await ensureAdminAccount();
  } catch (e) {
    console.warn("admin seed warn:", e?.message ?? e);
  }
  try {
    backfillIdenticons();
  } catch (e) {
    console.warn("identicon seed warn:", e?.message ?? e);
  }
  try {
    purgeLegacyUnlimitedInvites();
  } catch (e) {
    console.warn("purge invites warn:", e?.message ?? e);
  }
  console.log(`JS backend listening on http://localhost:${port}`);
});
