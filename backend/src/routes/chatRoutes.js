import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import { all, get, nowIso, run } from "../db.js";
import { authRequired } from "../auth.js";
import { assertChatOutgoing } from "../utils/contentLimits.js";
import { optimizeUploadedFile } from "../utils/imageOptimize.js";
import { verifyRasterImage } from "../utils/mimeVerify.js";
import { unlinkUploadUrl } from "../utils/uploadSafe.js";

const router = express.Router();
const MAX_BODY = 4000;

function ensureChatSchema() {
  try {
    const cols = new Set(all("PRAGMA table_info(chat_threads)").map((c) => c.name));
    if (cols.size && !cols.has("kind")) {
      run("ALTER TABLE chat_threads ADD COLUMN kind TEXT NOT NULL DEFAULT 'dm'");
    }
    if (cols.size && !cols.has("title")) {
      run("ALTER TABLE chat_threads ADD COLUMN title TEXT NOT NULL DEFAULT ''");
    }
    if (cols.size && !cols.has("owner_id")) {
      run("ALTER TABLE chat_threads ADD COLUMN owner_id TEXT");
    }
    if (cols.size && !cols.has("avatar_url")) {
      run("ALTER TABLE chat_threads ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''");
    }
    run(`
      CREATE TABLE IF NOT EXISTS chat_thread_members (
        thread_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        joined_at TEXT NOT NULL,
        last_read_at TEXT,
        PRIMARY KEY (thread_id, user_id),
        FOREIGN KEY (thread_id) REFERENCES chat_threads(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_chat_thread_members_user ON chat_thread_members(user_id);
    `);
  } catch (e) {
    console.warn("chat schema ensure:", e?.message ?? e);
  }
}

function asyncRoute(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

ensureChatSchema();

function userLimitsJson(userId) {
  return get("SELECT content_limits_json FROM users WHERE id = ?", userId)?.content_limits_json ?? "{}";
}

function guardChatOutgoing(req, res) {
  const a = assertChatOutgoing(req.user.id, userLimitsJson(req.user.id));
  if (!a.ok) {
    res.status(403).json({ error: a.error });
    return false;
  }
  return true;
}

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

const MAX_GROUP_TITLE = 80;
const MAX_GROUP_MEMBERS = 50;

function getThread(id) {
  return get(
    "SELECT id, user_a_id, user_b_id, last_message_at, kind, title, owner_id, avatar_url FROM chat_threads WHERE id = ?",
    id,
  );
}

function unlinkGroupAvatar(url) {
  const u = url && String(url);
  if (u && u.startsWith("/uploads/chat/")) unlinkUploadUrl(u, ["chat"]);
}

function isMember(thread, userId) {
  if (thread.kind === "group") {
    return !!get(
      "SELECT 1 FROM chat_thread_members WHERE thread_id = ? AND user_id = ?",
      thread.id,
      userId,
    );
  }
  return thread.user_a_id === userId || thread.user_b_id === userId;
}

function groupMemberCount(threadId) {
  return get("SELECT COUNT(*) AS v FROM chat_thread_members WHERE thread_id = ?", threadId)?.v ?? 0;
}

function groupMembers(threadId) {
  return all(
    `SELECT u.id, u.nickname, u.avatar_url
     FROM chat_thread_members m JOIN users u ON u.id = m.user_id
     WHERE m.thread_id = ? ORDER BY m.joined_at`,
    threadId,
  ).map((u) => ({ id: u.id, nickname: u.nickname, avatar_url: u.avatar_url ?? "" }));
}

function pairKey(a, b) {
  return a < b ? [a, b] : [b, a];
}

function ensureThread(meId, otherId) {
  const [a, b] = pairKey(meId, otherId);
  let row = get(
    "SELECT id, user_a_id, user_b_id, last_message_at, kind FROM chat_threads WHERE user_a_id = ? AND user_b_id = ? AND kind = 'dm'",
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
  return getThread(id);
}

function otherUser(thread, meId) {
  const otherId = thread.user_a_id === meId ? thread.user_b_id : thread.user_a_id;
  const u = get(
    "SELECT id, nickname, avatar_url FROM users WHERE id = ?",
    otherId,
  );
  if (!u) return null;
  return {
    id: u.id,
    nickname: u.nickname,
    avatar_url: u.avatar_url ?? "",
  };
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

function messageRowDto(r, meId) {
  const reply_to = r.r_id
    ? {
        id: r.r_id,
        from_me: r.r_sender_id === meId,
        body: r.r_body ?? "",
        image_url: (r.r_image_url && String(r.r_image_url)) || "",
        sender_nickname: r.r_sender_nickname ?? "",
      }
    : null;
  return {
    id: r.id,
    from_me: r.sender_id === meId,
    body: r.body,
    image_url: r.image_url || "",
    created_at: r.created_at,
    edited_at: r.edited_at ?? null,
    read: !!r.read_at,
    reply_to,
    sender_nickname: r.sender_nickname ?? "",
    sender_avatar: r.sender_avatar ?? "",
  };
}

function groupUnread(threadId, meId) {
  const mem = get(
    "SELECT last_read_at FROM chat_thread_members WHERE thread_id = ? AND user_id = ?",
    threadId,
    meId,
  );
  return (
    get(
      "SELECT COUNT(*) AS v FROM chat_messages WHERE thread_id = ? AND sender_id != ? AND created_at > ?",
      threadId,
      meId,
      mem?.last_read_at ?? "",
    )?.v ?? 0
  );
}

function groupDto(row, meId) {
  const last = lastMessageOf(row.id);
  return {
    id: row.id,
    kind: "group",
    title: row.title ?? "",
    owner_id: row.owner_id ?? "",
    member_count: groupMemberCount(row.id),
    other_nickname: row.title ?? "",
    other_avatar: row.avatar_url ?? "",
    last_body: previewOf(last),
    last_from_me: last ? last.sender_id === meId : false,
    last_at: last?.created_at ?? row.last_message_at ?? null,
    unread: groupUnread(row.id, meId),
  };
}

function threadDto(row, meId) {
  if (row.kind === "group") return groupDto(row, meId);
  const other = otherUser(row, meId);
  const last = lastMessageOf(row.id);
  return {
    id: row.id,
    kind: "dm",
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
    `SELECT id, user_a_id, user_b_id, last_message_at, kind, title, owner_id, avatar_url
     FROM chat_threads t
     WHERE (
         t.kind = 'dm'
         AND (t.user_a_id = ? OR t.user_b_id = ?)
         AND NOT EXISTS (
           SELECT 1 FROM chat_thread_hidden h
           WHERE h.thread_id = t.id AND h.user_id = ?
         )
       )
       OR EXISTS (
         SELECT 1 FROM chat_thread_members m
         WHERE m.thread_id = t.id AND m.user_id = ?
       )
     ORDER BY COALESCE(last_message_at, created_at) DESC`,
    req.user.id,
    req.user.id,
    req.user.id,
    req.user.id,
  );
  res.json({ items: rows.map((r) => threadDto(r, req.user.id)) });
});

router.get("/chats/unread-count", authRequired, (req, res) => {
  const dm =
    get(
      `SELECT COUNT(*) as v FROM chat_messages m
       JOIN chat_threads t ON t.id = m.thread_id
       WHERE m.read_at IS NULL
         AND m.sender_id != ?
         AND t.kind = 'dm'
         AND (t.user_a_id = ? OR t.user_b_id = ?)`,
      req.user.id,
      req.user.id,
      req.user.id,
    )?.v ?? 0;
  const grp =
    get(
      `SELECT COUNT(*) as v FROM chat_messages m
       JOIN chat_thread_members mem ON mem.thread_id = m.thread_id
       WHERE mem.user_id = ?
         AND m.sender_id != ?
         AND m.created_at > COALESCE(mem.last_read_at, '')`,
      req.user.id,
      req.user.id,
    )?.v ?? 0;
  res.json({ unread: dm + grp });
});

router.post("/chats/group", authRequired, (req, res) => {
  try {
    if (!guardChatOutgoing(req, res)) return;
    const title = String(req.body?.title ?? "").trim();
    if (!title) return res.status(400).json({ error: "нужно название" });
    if (title.length > MAX_GROUP_TITLE) return res.status(400).json({ error: "название слишком длинное" });
    const avatarUrl = String(req.body?.avatar_url ?? "").trim();
    if (avatarUrl && !avatarUrl.startsWith("/uploads/chat/")) {
      return res.status(400).json({ error: "bad avatar" });
    }
    const rawNicks = Array.isArray(req.body?.members) ? req.body.members : [];
    const id = uuidv4();
    const now = nowIso();
    const ownerId = req.user.id;
    run(
      "INSERT INTO chat_threads (id, user_a_id, user_b_id, created_at, kind, title, owner_id, avatar_url) VALUES (?, ?, ?, ?, 'group', ?, ?, ?)",
      id,
      ownerId,
      ownerId,
      now,
      title,
      ownerId,
      avatarUrl,
    );
    run(
      "INSERT INTO chat_thread_members (thread_id, user_id, joined_at) VALUES (?, ?, ?)",
      id,
      ownerId,
      now,
    );
    const missing = [];
    for (const raw of rawNicks.slice(0, MAX_GROUP_MEMBERS)) {
      const nick = String(raw).trim();
      if (!nick) continue;
      const u = get("SELECT id FROM users WHERE nickname = ?", nick);
      if (!u) {
        missing.push(nick);
        continue;
      }
      if (u.id === ownerId) continue;
      run(
        "INSERT OR IGNORE INTO chat_thread_members (thread_id, user_id, joined_at) VALUES (?, ?, ?)",
        id,
        u.id,
        now,
      );
    }
    const row = getThread(id);
    if (!row) return res.status(500).json({ error: "create failed" });
    res.status(201).json({ ...groupDto(row, req.user.id), missing });
  } catch (e) {
    console.error("POST /chats/group:", e?.message ?? e);
    res.status(500).json({ error: "internal error" });
  }
});

router.post(
  "/chats/group-avatar",
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
  asyncRoute(async (req, res) => {
    try {
      if (!guardChatOutgoing(req, res)) {
        if (req.file?.path) {
          try {
            fs.unlinkSync(req.file.path);
          } catch {}
        }
        return;
      }
      if (!req.file) return res.status(400).json({ error: "no file" });
      const probe = await verifyRasterImage(req.file.path);
      if (!probe.ok) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          /* ignore */
        }
        return res.status(400).json({ error: "invalid image" });
      }
      const r = await optimizeUploadedFile(req.file.path, "chat");
      if (r.ok) req.file.filename = r.filename;
      res.json({ url: `/uploads/chat/${req.file.filename}` });
    } catch (e) {
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
      }
      throw e;
    }
  }),
);

router.post("/chats/:id/members", authRequired, (req, res) => {
  const thread = getThread(req.params.id);
  if (!thread || thread.kind !== "group") return res.status(404).json({ error: "not found" });
  if (!isMember(thread, req.user.id)) return res.status(403).json({ error: "forbidden" });
  if (groupMemberCount(thread.id) >= MAX_GROUP_MEMBERS) {
    return res.status(400).json({ error: "слишком много участников" });
  }
  const nick = String(req.body?.nickname ?? "").trim();
  const u = get("SELECT id FROM users WHERE nickname = ?", nick);
  if (!u) return res.status(404).json({ error: "пользователь не найден" });
  run(
    "INSERT OR IGNORE INTO chat_thread_members (thread_id, user_id, joined_at) VALUES (?, ?, ?)",
    thread.id,
    u.id,
    nowIso(),
  );
  res.json({ ok: true, member_count: groupMemberCount(thread.id) });
});

router.get("/chats/:id/members", authRequired, (req, res) => {
  const thread = getThread(req.params.id);
  if (!thread || thread.kind !== "group") return res.status(404).json({ error: "not found" });
  if (!isMember(thread, req.user.id)) return res.status(403).json({ error: "forbidden" });
  res.json({
    title: thread.title ?? "",
    owner_id: thread.owner_id ?? "",
    avatar_url: thread.avatar_url ?? "",
    members: groupMembers(thread.id),
  });
});

router.delete("/chats/:id/members/:userId", authRequired, (req, res) => {
  const thread = getThread(req.params.id);
  if (!thread || thread.kind !== "group") return res.status(404).json({ error: "not found" });
  if (!isMember(thread, req.user.id)) return res.status(403).json({ error: "forbidden" });
  const targetId = req.params.userId;
  const meId = req.user.id;
  if (targetId !== meId && thread.owner_id !== meId) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (targetId !== meId && targetId === thread.owner_id) {
    return res.status(403).json({ error: "нельзя удалить создателя" });
  }
  if (!get("SELECT 1 FROM chat_thread_members WHERE thread_id = ? AND user_id = ?", thread.id, targetId)) {
    return res.status(404).json({ error: "not found" });
  }
  run("DELETE FROM chat_thread_members WHERE thread_id = ? AND user_id = ?", thread.id, targetId);
  if (!groupMemberCount(thread.id)) {
    const msgs = all("SELECT image_url FROM chat_messages WHERE thread_id = ?", thread.id);
    for (const m of msgs) {
      const url = m.image_url && String(m.image_url);
      if (url && url.startsWith("/uploads/chat/")) {
        unlinkUploadUrl(url, ["chat"]);
      }
    }
    run("DELETE FROM chat_messages WHERE thread_id = ?", thread.id);
    unlinkGroupAvatar(thread.avatar_url);
    run("DELETE FROM chat_threads WHERE id = ?", thread.id);
    return res.json({ ok: true, members: [], removed: true });
  }
  res.json({ ok: true, members: groupMembers(thread.id), removed: false });
});

router.post("/chats/with/:nickname", authRequired, (req, res) => {
  if (!guardChatOutgoing(req, res)) return;
  const other = get(
    "SELECT id FROM users WHERE nickname = ?",
    req.params.nickname,
  );
  if (!other) return res.status(404).json({ error: "user not found" });
  if (other.id === req.user.id) return res.status(400).json({ error: "cannot chat with yourself" });
  const thread = ensureThread(req.user.id, other.id);
  run("DELETE FROM chat_thread_hidden WHERE user_id = ? AND thread_id = ?", req.user.id, thread.id);
  res.json(threadDto(thread, req.user.id));
});

router.get("/chats/:id/messages", authRequired, (req, res) => {
  const thread = getThread(req.params.id);
  if (!thread) return res.status(404).json({ error: "not found" });
  if (!isMember(thread, req.user.id)) {
    return res.status(403).json({ error: "forbidden" });
  }
  const after = req.query.after ? String(req.query.after) : null;
  const sel = `m.id, m.sender_id, m.body, m.image_url, m.read_at, m.created_at, m.edited_at, m.reply_to_id,
     su.nickname as sender_nickname, su.avatar_url as sender_avatar,
     r.id as r_id, r.sender_id as r_sender_id, r.body as r_body, r.image_url as r_image_url,
     ru.nickname as r_sender_nickname`;
  const joins = `FROM chat_messages m
         LEFT JOIN users su ON su.id = m.sender_id
         LEFT JOIN chat_messages r ON r.id = m.reply_to_id
         LEFT JOIN users ru ON ru.id = r.sender_id`;
  const rows = after
    ? all(
        `SELECT ${sel}
         ${joins}
         WHERE m.thread_id = ? AND m.created_at > ?
         ORDER BY m.created_at`,
        req.params.id,
        after,
      )
    : all(
        `SELECT ${sel}
         ${joins}
         WHERE m.thread_id = ?
         ORDER BY m.created_at DESC LIMIT 200`,
        req.params.id,
      );
  const ordered = after ? rows : rows.reverse();
  if (thread.kind === "group") {
    return res.json({
      items: ordered.map((r) => messageRowDto(r, req.user.id)),
      other: null,
      group: {
        title: thread.title ?? "",
        owner_id: thread.owner_id ?? "",
        avatar_url: thread.avatar_url ?? "",
        members: groupMembers(thread.id),
      },
    });
  }
  const other = otherUser(thread, req.user.id);
  res.json({
    items: ordered.map((r) => messageRowDto(r, req.user.id)),
    other: other
      ? {
          id: other.id,
          nickname: other.nickname,
          avatar_url: other.avatar_url,
        }
      : null,
  });
});

router.delete("/chats/:id/messages", authRequired, (req, res) => {
  const thread = getThread(req.params.id);
  if (!thread) return res.status(404).json({ error: "not found" });
  if (!isMember(thread, req.user.id)) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (thread.kind === "group" && thread.owner_id !== req.user.id) {
    return res.status(403).json({ error: "только создатель группы" });
  }
  const msgs = all("SELECT image_url FROM chat_messages WHERE thread_id = ?", thread.id);
  for (const m of msgs) {
    const url = m.image_url && String(m.image_url);
    if (url && url.startsWith("/uploads/chat/")) {
      unlinkUploadUrl(url, ["chat"]);
    }
  }
  run("DELETE FROM chat_messages WHERE thread_id = ?", thread.id);
  run("UPDATE chat_threads SET last_message_at = NULL WHERE id = ?", thread.id);
  res.json({ ok: true });
});

router.delete("/chats/:id", authRequired, (req, res) => {
  const thread = getThread(req.params.id);
  if (!thread) return res.status(404).json({ error: "not found" });
  if (!isMember(thread, req.user.id)) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (thread.kind === "group") {
    run(
      "DELETE FROM chat_thread_members WHERE thread_id = ? AND user_id = ?",
      thread.id,
      req.user.id,
    );
    if (!groupMemberCount(thread.id)) {
      const msgs = all("SELECT image_url FROM chat_messages WHERE thread_id = ?", thread.id);
      for (const m of msgs) {
        const url = m.image_url && String(m.image_url);
        if (url && url.startsWith("/uploads/chat/")) {
          unlinkUploadUrl(url, ["chat"]);
        }
      }
      run("DELETE FROM chat_messages WHERE thread_id = ?", thread.id);
      unlinkGroupAvatar(thread.avatar_url);
      run("DELETE FROM chat_threads WHERE id = ?", thread.id);
    }
    return res.json({ ok: true });
  }
  run("INSERT OR IGNORE INTO chat_thread_hidden (user_id, thread_id) VALUES (?, ?)", req.user.id, thread.id);
  res.json({ ok: true });
});

router.get("/chats/:id/outgoing-read", authRequired, (req, res) => {
  const thread = getThread(req.params.id);
  if (!thread) return res.status(404).json({ error: "not found" });
  if (!isMember(thread, req.user.id)) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (thread.kind === "group") return res.json({ items: [] });
  const rows = all(
    "SELECT id, read_at FROM chat_messages WHERE thread_id = ? AND sender_id = ?",
    req.params.id,
    req.user.id,
  );
  res.json({
    items: rows.map((r) => ({ id: r.id, read: !!r.read_at })),
  });
});

router.post("/chats/:id/messages", authRequired, (req, res) => {
  const thread = getThread(req.params.id);
  if (!thread) return res.status(404).json({ error: "not found" });
  if (!isMember(thread, req.user.id)) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (!guardChatOutgoing(req, res)) return;
  const body = String(req.body?.body ?? "").trim();
  const imageUrl = String(req.body?.image_url ?? "").trim();
  if (!body && !imageUrl) return res.status(400).json({ error: "empty" });
  if (body.length > MAX_BODY) return res.status(400).json({ error: "too long" });
  const replyTo = req.body?.reply_to ? String(req.body.reply_to).trim() : "";
  if (replyTo) {
    const parent = get(
      "SELECT id, thread_id FROM chat_messages WHERE id = ?",
      replyTo,
    );
    if (!parent || parent.thread_id !== thread.id) {
      return res.status(400).json({ error: "bad reply" });
    }
  }
  const id = uuidv4();
  const now = nowIso();
  run(
    "INSERT INTO chat_messages (id, thread_id, sender_id, body, image_url, created_at, reply_to_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    id,
    thread.id,
    req.user.id,
    body,
    imageUrl,
    now,
    replyTo || null,
  );
  run("UPDATE chat_threads SET last_message_at = ? WHERE id = ?", now, thread.id);
  let replyPayload = null;
  if (replyTo) {
    const pr = get(
      "SELECT id, sender_id, body, image_url FROM chat_messages WHERE id = ?",
      replyTo,
    );
    if (pr) {
      replyPayload = {
        id: pr.id,
        from_me: pr.sender_id === req.user.id,
        body: pr.body ?? "",
        image_url: pr.image_url || "",
      };
    }
  }
  res.status(201).json({
    id,
    from_me: true,
    body,
    image_url: imageUrl,
    created_at: now,
    read: false,
    reply_to: replyPayload,
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
  asyncRoute(async (req, res) => {
    const thread = getThread(req.params.id);
    if (!thread) {
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
      }
      return res.status(404).json({ error: "not found" });
    }
    if (!isMember(thread, req.user.id)) {
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
      }
      return res.status(403).json({ error: "forbidden" });
    }
    if (!guardChatOutgoing(req, res)) {
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
      }
      return;
    }
    if (!req.file) return res.status(400).json({ error: "no file" });
    const probe = await verifyRasterImage(req.file.path);
    if (!probe.ok) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
      return res.status(400).json({ error: "invalid image" });
    }
    const r = await optimizeUploadedFile(req.file.path, "chat");
    if (r.ok) req.file.filename = r.filename;
    const url = `/uploads/chat/${req.file.filename}`;
    res.json({ url });
  }),
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
  if (!guardChatOutgoing(req, res)) return;
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
    `SELECT m.id, m.sender_id, m.body, m.image_url, m.read_at, m.created_at, m.edited_at, m.reply_to_id,
     r.id as r_id, r.sender_id as r_sender_id, r.body as r_body, r.image_url as r_image_url
     FROM chat_messages m
     LEFT JOIN chat_messages r ON r.id = m.reply_to_id
     WHERE m.id = ?`,
    msg.id,
  );
  res.json(messageRowDto(fresh, req.user.id));
});

router.delete("/chats/messages/:id", authRequired, (req, res) => {
  const msg = get(
    "SELECT id, thread_id, sender_id, image_url FROM chat_messages WHERE id = ?",
    req.params.id,
  );
  if (!msg) return res.status(404).json({ error: "not found" });
  const thread = getThread(msg.thread_id);
  if (!thread || !isMember(thread, req.user.id)) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (
    thread.kind === "group" &&
    msg.sender_id !== req.user.id &&
    thread.owner_id !== req.user.id
  ) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (msg.image_url && msg.image_url.startsWith("/uploads/chat/")) {
    unlinkUploadUrl(msg.image_url, ["chat"]);
  }
  run("UPDATE chat_messages SET reply_to_id = NULL WHERE reply_to_id = ?", msg.id);
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
  const thread = getThread(req.params.id);
  if (!thread) return res.status(404).json({ error: "not found" });
  if (!isMember(thread, req.user.id)) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (thread.kind === "group") {
    run(
      "UPDATE chat_thread_members SET last_read_at = ? WHERE thread_id = ? AND user_id = ?",
      nowIso(),
      thread.id,
      req.user.id,
    );
    return res.json({ ok: true });
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
