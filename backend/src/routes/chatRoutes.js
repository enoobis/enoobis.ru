import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import { all, get, nowIso, run } from "../db.js";
import { authRequired } from "../auth.js";

const router = express.Router();
const MAX_BODY = 4000;

const UPLOAD_ROOT = path.resolve(process.env.UPLOADS_DIR ?? "./data/uploads");
const CHAT_DIR = path.join(UPLOAD_ROOT, "chat");
fs.mkdirSync(CHAT_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const chatUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, CHAT_DIR),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || ".bin").toLowerCase();
      cb(null, `${req.user?.id ?? "anon"}-${uuidv4().replace(/-/g, "")}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error("only images allowed"));
    }
    cb(null, true);
  },
});

function pairKey(a, b) {
  return a < b ? [a, b] : [b, a];
}

function ensureThread(meId, otherId) {
  const [a, b] = pairKey(meId, otherId);
  let row = get(
    "SELECT id, user_a_id, user_b_id, last_message_at FROM chat_threads WHERE user_a_id = ? AND user_b_id = ?",
    a,
    b,
  );
  if (row) return row;
  const id = uuidv4();
  run(
    "INSERT INTO chat_threads (id, user_a_id, user_b_id, created_at) VALUES (?, ?, ?, ?)",
    id,
    a,
    b,
    nowIso(),
  );
  return get(
    "SELECT id, user_a_id, user_b_id, last_message_at FROM chat_threads WHERE id = ?",
    id,
  );
}

function otherUser(thread, meId) {
  const otherId = thread.user_a_id === meId ? thread.user_b_id : thread.user_a_id;
  return get("SELECT id, nickname, avatar_url FROM users WHERE id = ?", otherId);
}

function unreadInThread(threadId, meId) {
  return (
    get(
      "SELECT COUNT(*) as v FROM chat_messages WHERE thread_id = ? AND sender_id != ? AND read_at IS NULL",
      threadId,
      meId,
    )?.v ?? 0
  );
}

function lastMessageOf(threadId) {
  return get(
    "SELECT id, sender_id, body, image_url, created_at FROM chat_messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT 1",
    threadId,
  );
}

function previewOf(msg) {
  if (!msg) return "";
  if (msg.body) return msg.body;
  if (msg.image_url) return "фото";
  return "";
}

function threadDto(row, meId) {
  const other = otherUser(row, meId);
  const last = lastMessageOf(row.id);
  return {
    id: row.id,
    other_nickname: other?.nickname ?? "",
    other_avatar: other?.avatar_url ?? "",
    last_body: previewOf(last),
    last_from_me: last ? last.sender_id === meId : false,
    last_at: last?.created_at ?? row.last_message_at ?? null,
    unread: unreadInThread(row.id, meId),
  };
}

router.get("/chats", authRequired, (req, res) => {
  const rows = all(
    `SELECT id, user_a_id, user_b_id, last_message_at
     FROM chat_threads
     WHERE user_a_id = ? OR user_b_id = ?
     ORDER BY COALESCE(last_message_at, created_at) DESC`,
    req.user.id,
    req.user.id,
  );
  res.json({ items: rows.map((r) => threadDto(r, req.user.id)) });
});

router.get("/chats/unread-count", authRequired, (req, res) => {
  const v =
    get(
      `SELECT COUNT(*) as v FROM chat_messages m
       JOIN chat_threads t ON t.id = m.thread_id
       WHERE m.read_at IS NULL
         AND m.sender_id != ?
         AND (t.user_a_id = ? OR t.user_b_id = ?)`,
      req.user.id,
      req.user.id,
      req.user.id,
    )?.v ?? 0;
  res.json({ unread: v });
});

router.post("/chats/with/:nickname", authRequired, (req, res) => {
  const other = get(
    "SELECT id FROM users WHERE nickname = ?",
    req.params.nickname,
  );
  if (!other) return res.status(404).json({ error: "user not found" });
  if (other.id === req.user.id) return res.status(400).json({ error: "cannot chat with yourself" });
  const thread = ensureThread(req.user.id, other.id);
  res.json(threadDto(thread, req.user.id));
});

router.get("/chats/:id/messages", authRequired, (req, res) => {
  const thread = get(
    "SELECT id, user_a_id, user_b_id FROM chat_threads WHERE id = ?",
    req.params.id,
  );
  if (!thread) return res.status(404).json({ error: "not found" });
  if (thread.user_a_id !== req.user.id && thread.user_b_id !== req.user.id) {
    return res.status(403).json({ error: "forbidden" });
  }
  const after = req.query.after ? String(req.query.after) : null;
  const rows = after
    ? all(
        "SELECT id, sender_id, body, image_url, read_at, created_at, edited_at FROM chat_messages WHERE thread_id = ? AND created_at > ? ORDER BY created_at",
        req.params.id,
        after,
      )
    : all(
        "SELECT id, sender_id, body, image_url, read_at, created_at, edited_at FROM chat_messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT 200",
        req.params.id,
      );
  const ordered = after ? rows : rows.reverse();
  res.json({
    items: ordered.map((r) => ({
      id: r.id,
      from_me: r.sender_id === req.user.id,
      body: r.body,
      image_url: r.image_url || "",
      created_at: r.created_at,
      edited_at: r.edited_at ?? null,
      read: !!r.read_at,
    })),
    other: otherUser(thread, req.user.id),
  });
});

router.post("/chats/:id/messages", authRequired, (req, res) => {
  const thread = get(
    "SELECT id, user_a_id, user_b_id FROM chat_threads WHERE id = ?",
    req.params.id,
  );
  if (!thread) return res.status(404).json({ error: "not found" });
  if (thread.user_a_id !== req.user.id && thread.user_b_id !== req.user.id) {
    return res.status(403).json({ error: "forbidden" });
  }
  const body = String(req.body?.body ?? "").trim();
  const imageUrl = String(req.body?.image_url ?? "").trim();
  if (!body && !imageUrl) return res.status(400).json({ error: "empty" });
  if (body.length > MAX_BODY) return res.status(400).json({ error: "too long" });
  const id = uuidv4();
  const now = nowIso();
  run(
    "INSERT INTO chat_messages (id, thread_id, sender_id, body, image_url, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    thread.id,
    req.user.id,
    body,
    imageUrl,
    now,
  );
  run("UPDATE chat_threads SET last_message_at = ? WHERE id = ?", now, thread.id);
  res.status(201).json({
    id,
    from_me: true,
    body,
    image_url: imageUrl,
    created_at: now,
    read: false,
  });
});

router.post(
  "/chats/:id/upload",
  authRequired,
  (req, res, next) => {
    chatUpload.single("file")(req, res, (err) => {
      if (err) {
        const msg = err?.message ?? "upload error";
        return res.status(400).json({ error: msg });
      }
      next();
    });
  },
  (req, res) => {
    const thread = get(
      "SELECT id, user_a_id, user_b_id FROM chat_threads WHERE id = ?",
      req.params.id,
    );
    if (!thread) {
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
      }
      return res.status(404).json({ error: "not found" });
    }
    if (thread.user_a_id !== req.user.id && thread.user_b_id !== req.user.id) {
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
      }
      return res.status(403).json({ error: "forbidden" });
    }
    if (!req.file) return res.status(400).json({ error: "no file" });
    const url = `/uploads/chat/${req.file.filename}`;
    res.json({ url });
  },
);

router.patch("/chats/messages/:id", authRequired, (req, res) => {
  const msg = get(
    "SELECT id, thread_id, sender_id, image_url FROM chat_messages WHERE id = ?",
    req.params.id,
  );
  if (!msg) return res.status(404).json({ error: "not found" });
  if (msg.sender_id !== req.user.id) {
    return res.status(403).json({ error: "forbidden" });
  }
  const body = String(req.body?.body ?? "").trim();
  if (!body && !msg.image_url) return res.status(400).json({ error: "empty" });
  if (body.length > MAX_BODY) return res.status(400).json({ error: "too long" });
  const now = nowIso();
  run(
    "UPDATE chat_messages SET body = ?, edited_at = ? WHERE id = ?",
    body,
    now,
    msg.id,
  );
  const fresh = get(
    "SELECT id, sender_id, body, image_url, read_at, created_at, edited_at FROM chat_messages WHERE id = ?",
    msg.id,
  );
  res.json({
    id: fresh.id,
    from_me: true,
    body: fresh.body,
    image_url: fresh.image_url || "",
    created_at: fresh.created_at,
    edited_at: fresh.edited_at ?? null,
    read: !!fresh.read_at,
  });
});

router.delete("/chats/messages/:id", authRequired, (req, res) => {
  const msg = get(
    "SELECT id, thread_id, sender_id, image_url FROM chat_messages WHERE id = ?",
    req.params.id,
  );
  if (!msg) return res.status(404).json({ error: "not found" });
  if (msg.sender_id !== req.user.id) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (msg.image_url && msg.image_url.startsWith("/uploads/chat/")) {
    const file = path.join(UPLOAD_ROOT, msg.image_url.replace(/^\/uploads\//, ""));
    try {
      fs.unlinkSync(file);
    } catch {
      // ignore missing file
    }
  }
  run("DELETE FROM chat_messages WHERE id = ?", msg.id);
  const last = lastMessageOf(msg.thread_id);
  run(
    "UPDATE chat_threads SET last_message_at = ? WHERE id = ?",
    last?.created_at ?? null,
    msg.thread_id,
  );
  res.json({ ok: true });
});

router.post("/chats/:id/read", authRequired, (req, res) => {
  const thread = get(
    "SELECT id, user_a_id, user_b_id FROM chat_threads WHERE id = ?",
    req.params.id,
  );
  if (!thread) return res.status(404).json({ error: "not found" });
  if (thread.user_a_id !== req.user.id && thread.user_b_id !== req.user.id) {
    return res.status(403).json({ error: "forbidden" });
  }
  run(
    "UPDATE chat_messages SET read_at = ? WHERE thread_id = ? AND sender_id != ? AND read_at IS NULL",
    nowIso(),
    thread.id,
    req.user.id,
  );
  res.json({ ok: true });
});

export default router;
