import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { db, get, nowIso, run } from "./db.js";
import { hashPassword } from "./auth.js";
import { v4 as uuidv4 } from "uuid";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import blogRoutes from "./routes/blogRoutes.js";
import courseRoutes from "./routes/courseRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const UPLOAD_ROOT = path.resolve(process.env.UPLOADS_DIR ?? "./data/uploads");
app.use("/uploads", express.static(UPLOAD_ROOT, { maxAge: "1d" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, engine: "js" }));

app.use("/api", authRoutes);
app.use("/api", userRoutes);
app.use("/api", blogRoutes);
app.use("/api", courseRoutes);
app.use("/api", uploadRoutes);
app.use("/api", adminRoutes);

app.use("/api", (req, res) => res.status(404).json({ error: "api not found" }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal error" });
});

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

const port = Number(process.env.PORT ?? 3000);
app.listen(port, async () => {
  db.prepare("SELECT 1").get();
  try {
    await ensureAdminAccount();
  } catch (e) {
    console.warn("admin seed warn:", e?.message ?? e);
  }
  console.log(`JS backend listening on http://localhost:${port}`);
});
