import { nowIso, run } from "../db.js";
import { v4 as uuidv4 } from "uuid";

/**
 * @param {string} adminId
 * @param {string} action
 * @param {string} [targetId]
 * @param {Record<string, unknown>} [detail]
 */
export function logAdminAction(adminId, action, targetId = "", detail = {}) {
  try {
    run(
      `INSERT INTO admin_audit_log (id, admin_id, action, target_id, detail_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      uuidv4(),
      adminId,
      String(action).slice(0, 64),
      String(targetId ?? "").slice(0, 36),
      JSON.stringify(detail),
      nowIso(),
    );
  } catch {
    /* ignore */
  }
}
