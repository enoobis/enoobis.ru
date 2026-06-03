import { all, db, get, run } from "../db.js";
import { unlinkUploadUrl } from "./uploadSafe.js";
const RETENTION_DAYS = Math.max(1, Number(process.env.CHAT_RETENTION_DAYS ?? 7));
const PURGE_INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.CHAT_PURGE_INTERVAL_MS ?? 24 * 60 * 60 * 1000),
);

function cutoffIso() {
  return new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function unlinkChatImage(imageUrl) {
  const url = imageUrl && String(imageUrl);
  if (!url || !url.startsWith("/uploads/chat/")) return;
  unlinkUploadUrl(url, ["chat"]);
}

export function purgeExpiredChatMessages() {
  const cutoff = cutoffIso();
  const stale = all(
    "SELECT id, thread_id, image_url FROM chat_messages WHERE created_at < ?",
    cutoff,
  );
  if (!stale.length) return { deleted: 0, threads: 0 };

  for (const m of stale) unlinkChatImage(m.image_url);

  const threadIds = [...new Set(stale.map((m) => m.thread_id))];

  const deleted = db.transaction(() => {
    run(
      `UPDATE chat_messages SET reply_to_id = NULL
       WHERE reply_to_id IN (SELECT id FROM chat_messages WHERE created_at < ?)`,
      cutoff,
    );
    const result = run("DELETE FROM chat_messages WHERE created_at < ?", cutoff);
    for (const tid of threadIds) {
      const last = get(
        "SELECT created_at FROM chat_messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT 1",
        tid,
      );
      run("UPDATE chat_threads SET last_message_at = ? WHERE id = ?", last?.created_at ?? null, tid);
    }
    return result.changes;
  })();

  console.log(`chat retention: removed ${deleted} message(s) older than ${RETENTION_DAYS}d`);
  return { deleted, threads: threadIds.length };
}

export function scheduleChatRetention() {
  const tick = () => {
    try {
      purgeExpiredChatMessages();
    } catch (e) {
      console.warn("chat retention warn:", e?.message ?? e);
    }
  };
  tick();
  const timer = setInterval(tick, PURGE_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
}
