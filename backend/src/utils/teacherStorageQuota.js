import path from "node:path";
import fs from "node:fs";
import { all, get, run } from "../db.js";
import { safePathUnder } from "./security.js";

export const TEACHER_QUOTA_BYTES = 30 * 1024 * 1024;

const FILES_ROOT = path.resolve(process.env.PRIVATE_FILES_DIR ?? "./data/private-files");

function deleteStoredFile(row) {
  const abs = safePathUnder(FILES_ROOT, row.storage_path);
  if (abs) {
    try {
      fs.unlinkSync(abs);
    } catch {
      /* ignore */
    }
  }
  run("DELETE FROM share_links WHERE target_type = 'file' AND target_id = ?", row.id);
  run("DELETE FROM user_files WHERE id = ?", row.id);
}

export function enforceTeacherStorageQuota(userId) {
  const user = get("SELECT role FROM users WHERE id = ?", userId);
  if (!user || (user.role !== "teacher" && user.role !== "master" && user.role !== "moderator")) return;

  const files = all(
    "SELECT id, storage_path, size_bytes FROM user_files WHERE owner_id = ?",
    userId,
  );
  if (!files.length) return;

  const toDelete = new Set();

  for (const f of files) {
    if (Number(f.size_bytes) > TEACHER_QUOTA_BYTES) {
      toDelete.add(f.id);
    }
  }

  let remaining = files.filter((f) => !toDelete.has(f.id));
  let used = remaining.reduce((sum, f) => sum + Number(f.size_bytes), 0);

  remaining.sort((a, b) => Number(b.size_bytes) - Number(a.size_bytes));
  for (const f of remaining) {
    if (used <= TEACHER_QUOTA_BYTES) break;
    toDelete.add(f.id);
    used -= Number(f.size_bytes);
  }

  for (const f of files) {
    if (toDelete.has(f.id)) deleteStoredFile(f);
  }
}

export function enforceAllTeachersStorageQuota() {
  const teachers = all("SELECT id FROM users WHERE role IN ('teacher', 'master', 'moderator')");
  for (const t of teachers) {
    enforceTeacherStorageQuota(t.id);
  }
}
