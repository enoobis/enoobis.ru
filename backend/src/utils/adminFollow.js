import { all, nowIso, run } from "../db.js";
import { checkFollowerMilestones } from "./achievements.js";

export function ensureUserFollowsAdmins(userId) {
  const admins = all("SELECT id FROM users WHERE role = 'admin'");
  if (!admins.length) return;
  const now = nowIso();
  for (const admin of admins) {
    if (admin.id === userId) continue;
    const info = run(
      "INSERT OR IGNORE INTO user_follows (follower_user_id, following_user_id, created_at) VALUES (?, ?, ?)",
      userId,
      admin.id,
      now,
    );
    if (info.changes > 0) checkFollowerMilestones(admin.id);
  }
}

export function backfillAllUsersFollowAdmins() {
  const admins = all("SELECT id FROM users WHERE role = 'admin'");
  if (!admins.length) return;
  const users = all("SELECT id FROM users WHERE role != 'admin'");
  const now = nowIso();
  for (const user of users) {
    for (const admin of admins) {
      const info = run(
        "INSERT OR IGNORE INTO user_follows (follower_user_id, following_user_id, created_at) VALUES (?, ?, ?)",
        user.id,
        admin.id,
        now,
      );
      if (info.changes > 0) checkFollowerMilestones(admin.id);
    }
  }
}
