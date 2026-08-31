import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import { all, db, get, nowIso, run } from "../db.js";
import { authRequired, bumpTokenVersion, hashPassword } from "../auth.js";
import { logAdminAction } from "../utils/adminAudit.js";
import { passwordPolicyError } from "../utils/passwordPolicy.js";
import { unlinkUploadUrl, UPLOAD_ROOT } from "../utils/uploadSafe.js";
import { awardAchievement } from "../utils/achievements.js";
import { saveIdenticon } from "../utils/identicon.js";
import { limitsFromAdminBody, limitsToJson, parseContentLimits } from "../utils/contentLimits.js";
import { optimizeUploadedFile } from "../utils/imageOptimize.js";
import { finalizeBlogPublish } from "../utils/blogPublish.js";
import { ensureUserFollowsAdmins } from "../utils/adminFollow.js";
import { nicknameError } from "../utils/nickname.js";
import { isAdmin, isPanelStaff } from "../utils/roles.js";

const router = express.Router();

function panelStaff(req, res, next) {
  if (!isPanelStaff(req.user.role)) return res.status(403).json({ error: "forbidden" });
  next();
}

function adminOnly(req, res, next) {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: "forbidden" });
  next();
}

router.use(authRequired, panelStaff);

const PRIVATE_FILES_ROOT = path.resolve(process.env.PRIVATE_FILES_DIR ?? "./data/private-files");
const LIBRARY_ROOT = path.resolve(process.env.LIBRARY_DIR ?? "./data/library");
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
fs.mkdirSync(path.join(UPLOAD_ROOT, "avatars"), { recursive: true });

const adminAvatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_ROOT, "avatars")),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || ".bin").toLowerCase();
      cb(null, `${req.params.id}-${uuidv4().replace(/-/g, "")}${ext}`);
    },
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIMES.has(file.mimetype)) cb(null, true);
    else cb(new Error("only jpeg, png, gif, webp"));
  },
});

function uploadSingle(upload, field) {
  return (req, res, next) => {
    upload.single(field)(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message ?? "upload error" });
      next();
    });
  };
}

router.get("/admin/pending", adminOnly, (_req, res) => {
  const rows = all(
    "SELECT id, email, nickname, role, created_at FROM users WHERE status = 'pending' ORDER BY created_at",
  );
  return res.json(rows);
});

router.get("/admin/users", adminOnly, (_req, res) => {
  const rows = all(
    `SELECT id, email, nickname, role, status, created_at, bio, avatar_url, coins
     FROM users ORDER BY created_at DESC`,
  );
  return res.json(
    rows.map((r) => ({
      ...r,
      coins: Math.max(0, Math.floor(Number(r.coins ?? 0))),
    })),
  );
});

router.get("/admin/users/:id", adminOnly, (req, res) => {
  const row = get(
    `SELECT id, email, nickname, role, status, bio, full_name, website_url, readme_md,
            social_links_json, avatar_url, nickname_change_count, created_at, content_limits_json, coins
     FROM users WHERE id = ?`,
    req.params.id,
  );
  if (!row) return res.status(404).json({ error: "not found" });
  let social_links = [];
  try {
    social_links = JSON.parse(row.social_links_json ?? "[]");
    if (!Array.isArray(social_links)) social_links = [];
  } catch {
    social_links = [];
  }
  return res.json({
    id: row.id,
    email: row.email,
    nickname: row.nickname,
    role: row.role,
    status: row.status,
    bio: row.bio ?? "",
    full_name: row.full_name ?? "",
    website_url: row.website_url ?? "",
    readme_md: row.readme_md ?? "",
    social_links,
    avatar_url: row.avatar_url ?? "",
    nickname_change_count: Number(row.nickname_change_count ?? 0),
    created_at: row.created_at ?? "",
    coins: Math.max(0, Math.floor(Number(row.coins ?? 0))),
    publish_limits: parseContentLimits(row.content_limits_json ?? "{}"),
  });
});

const ADMIN_COIN_DELTA_MIN = -100_000;
const ADMIN_COIN_DELTA_MAX = 100_000;

router.post("/admin/users/:id/coins", adminOnly, (req, res) => {
  const id = req.params.id;
  const target = get("SELECT id FROM users WHERE id = ?", id);
  if (!target) return res.status(404).json({ error: "not found" });
  const n = Number(req.body?.amount);
  if (
    !Number.isFinite(n) ||
    !Number.isInteger(n) ||
    n === 0 ||
    n < ADMIN_COIN_DELTA_MIN ||
    n > ADMIN_COIN_DELTA_MAX
  ) {
    return res.status(400).json({ error: "bad amount" });
  }
  run("UPDATE users SET coins = MAX(0, coins + ?) WHERE id = ?", n, id);
  const after = get("SELECT coins FROM users WHERE id = ?", id);
  const coins = Math.max(0, Math.floor(Number(after?.coins ?? 0)));
  logAdminAction(req.user.id, "user_coins", id, { amount: n });
  return res.json({ ok: true, coins });
});

router.get("/admin/users/:id/invites", adminOnly, (req, res) => {
  const target = get("SELECT id FROM users WHERE id = ?", req.params.id);
  if (!target) return res.status(404).json({ error: "not found" });
  const rows = all(
    `SELECT id, code, target_role, max_uses, used_count, created_at
     FROM invite_links WHERE owner_user_id = ? ORDER BY created_at DESC`,
    req.params.id,
  );
  return res.json(
    rows.map((r) => ({
      ...r,
      remaining: Math.max(0, (r.max_uses ?? 0) - (r.used_count ?? 0)),
    })),
  );
});

router.delete("/admin/users/:userId/invites/:inviteId", adminOnly, (req, res) => {
  const row = get(
    "SELECT id FROM invite_links WHERE id = ? AND owner_user_id = ?",
    req.params.inviteId,
    req.params.userId,
  );
  if (!row) return res.status(404).json({ error: "not found" });
  run("DELETE FROM invite_links WHERE id = ?", req.params.inviteId);
  return res.json({ ok: true });
});

router.patch("/admin/users/:id/profile", adminOnly, async (req, res) => {
  const id = req.params.id;
  const target = get("SELECT id, nickname FROM users WHERE id = ?", id);
  if (!target) return res.status(404).json({ error: "not found" });
  const body = req.body ?? {};
  try {
    if (body.nickname !== undefined) {
      const nn = String(body.nickname).trim();
      const nickErr = nicknameError(nn);
      if (nickErr) {
        return res.status(400).json({ error: nickErr });
      }
      const taken = get(
        "SELECT 1 as v FROM users WHERE LOWER(nickname) = LOWER(?) AND id <> ?",
        nn,
        id,
      );
      if (taken) return res.status(400).json({ error: "ник занят" });
      run("UPDATE users SET nickname = ? WHERE id = ?", nn, id);
    }
    if (body.full_name !== undefined) {
      run("UPDATE users SET full_name = ? WHERE id = ?", String(body.full_name ?? "").slice(0, 240), id);
    }
    if (body.website_url !== undefined) {
      run("UPDATE users SET website_url = ? WHERE id = ?", String(body.website_url ?? "").slice(0, 2000), id);
    }
    if (body.bio !== undefined) {
      const bio = String(body.bio);
      if (bio.length > 4000) return res.status(400).json({ error: "bio too long" });
      run("UPDATE users SET bio = ? WHERE id = ?", bio, id);
    }
    if (body.readme_md !== undefined) {
      const readme = String(body.readme_md);
      if (readme.length > 4000) return res.status(400).json({ error: "readme too long" });
      run("UPDATE users SET readme_md = ? WHERE id = ?", readme, id);
    }
    if (body.social_links !== undefined) {
      if (!Array.isArray(body.social_links)) {
        return res.status(400).json({ error: "social_links must be array" });
      }
      const cleaned = body.social_links.slice(0, 12).map((x) => ({
        name: String(x?.name ?? "").slice(0, 64),
        url: String(x?.url ?? "").slice(0, 512),
      }));
      run("UPDATE users SET social_links_json = ? WHERE id = ?", JSON.stringify(cleaned), id);
    }
    if (body.avatar_url !== undefined) {
      const nickRow = get("SELECT nickname FROM users WHERE id = ?", id);
      const nick = nickRow?.nickname ?? target.nickname ?? target.id;
      const v = body.avatar_url;
      if (v === null || v === "") {
        const url = saveIdenticon(nick, id);
        run("UPDATE users SET avatar_url = ? WHERE id = ?", url, id);
      } else {
        run("UPDATE users SET avatar_url = ? WHERE id = ?", String(v), id);
      }
    }
    if (body.new_password !== undefined && String(body.new_password).length > 0) {
      const pw = String(body.new_password);
      const policyErr = passwordPolicyError(pw);
      if (policyErr) return res.status(400).json({ error: policyErr });
      const hash = await hashPassword(pw);
      run("UPDATE users SET password_hash = ? WHERE id = ?", hash, id);
      bumpTokenVersion(id);
      logAdminAction(req.user.id, "user_password", id);
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "internal error" });
  }
});

router.patch("/admin/users/:id/publish-limits", adminOnly, (req, res) => {
  const id = req.params.id;
  const target = get("SELECT id, content_limits_json FROM users WHERE id = ?", id);
  if (!target) return res.status(404).json({ error: "not found" });
  const next = limitsFromAdminBody(req.body ?? {}, target.content_limits_json ?? "{}");
  run("UPDATE users SET content_limits_json = ? WHERE id = ?", limitsToJson(next), id);
  return res.json({ ok: true, publish_limits: next });
});

router.post(
  "/admin/users/:id/avatar",
  adminOnly,
  uploadSingle(adminAvatarUpload, "file"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "no file" });
    const target = get("SELECT id FROM users WHERE id = ?", req.params.id);
    if (!target) return res.status(404).json({ error: "not found" });
    const r = await optimizeUploadedFile(req.file.path, "avatar");
    if (r.ok) req.file.filename = r.filename;
    const url = `/uploads/avatars/${req.file.filename}`;
    run("UPDATE users SET avatar_url = ? WHERE id = ?", url, req.params.id);
    return res.json({ avatar_url: url });
  },
);

router.post("/admin/users/:id/approve", (req, res) => {
  run("UPDATE users SET status = 'approved' WHERE id = ?", req.params.id);
  ensureUserFollowsAdmins(req.params.id);
  return res.json({ ok: true });
});

router.post("/admin/users/:id/reject", (req, res) => {
  run("UPDATE users SET status = 'rejected' WHERE id = ?", req.params.id);
  return res.json({ ok: true });
});

router.post("/admin/users/:id/role", adminOnly, (req, res) => {
  const role = String(req.body?.role ?? "");
  if (!["student", "teacher", "master", "moderator", "admin"].includes(role)) {
    return res.status(400).json({ error: "bad role" });
  }
  run("UPDATE users SET role = ? WHERE id = ?", role, req.params.id);
  logAdminAction(req.user.id, "user_role", req.params.id, { role });
  if (role === "teacher" || role === "master" || role === "admin") {
    awardAchievement(req.params.id, "mentor");
  }
  return res.json({ ok: true });
});

function purgeUserCourses(userId) {
  const owned = all("SELECT id FROM courses WHERE teacher_id = ?", userId);
  for (const c of owned) {
    const lecAttachUrls = all(
      `SELECT url FROM course_lecture_attachments WHERE lecture_id IN
       (SELECT id FROM course_lectures WHERE course_id = ?)`,
      c.id,
    );
    for (const row of lecAttachUrls) unlinkUploadUrl(row.url);

    const subAttachUrls = all(
      `SELECT sa.url FROM course_submission_attachments sa
       JOIN course_assignment_submissions s ON s.id = sa.submission_id
       JOIN course_assignments a ON a.id = s.assignment_id
       WHERE a.course_id = ?`,
      c.id,
    );
    for (const row of subAttachUrls) unlinkUploadUrl(row.url);

    const lectures = all("SELECT id FROM course_lectures WHERE course_id = ?", c.id);
    for (const l of lectures) {
      run("DELETE FROM course_lecture_attachments WHERE lecture_id = ?", l.id);
    }
    run(
      "DELETE FROM course_submission_attachments WHERE submission_id IN (SELECT s.id FROM course_assignment_submissions s JOIN course_assignments a ON a.id = s.assignment_id WHERE a.course_id = ?)",
      c.id,
    );
    run(
      "DELETE FROM course_assignment_submissions WHERE assignment_id IN (SELECT id FROM course_assignments WHERE course_id = ?)",
      c.id,
    );
    run("DELETE FROM course_assignments WHERE course_id = ?", c.id);
    run("DELETE FROM course_lectures WHERE course_id = ?", c.id);
    run(
      "DELETE FROM course_stream_comments WHERE post_id IN (SELECT id FROM course_stream_posts WHERE course_id = ?)",
      c.id,
    );
    run("DELETE FROM course_stream_posts WHERE course_id = ?", c.id);
    run("DELETE FROM course_students WHERE course_id = ?", c.id);
    run("DELETE FROM course_co_teachers WHERE course_id = ?", c.id);
    run("DELETE FROM user_favorite_courses WHERE course_id = ?", c.id);
    const iconRow = get("SELECT icon_url FROM courses WHERE id = ?", c.id);
    unlinkUploadUrl(iconRow?.icon_url ?? "");
    run("DELETE FROM courses WHERE id = ?", c.id);
  }
}

function purgeUserBlogAndMicro(userId) {
  const postIds = all("SELECT id FROM blog_posts WHERE author_id = ?", userId).map((r) => r.id);

  const covers = all(
    "SELECT cover_image_url FROM blog_posts WHERE author_id = ? AND COALESCE(cover_image_url, '') <> ''",
    userId,
  );
  for (const row of covers) unlinkUploadUrl(row.cover_image_url);

  if (postIds.length) {
    const ph = postIds.map(() => "?").join(",");
    const blogImgUrls = all(`SELECT url FROM blog_post_images WHERE post_id IN (${ph})`, ...postIds);
    for (const row of blogImgUrls) unlinkUploadUrl(row.url);

    run(`DELETE FROM blog_reports WHERE target_post_id IN (${ph})`, ...postIds);
    run(`DELETE FROM blog_comments WHERE post_id IN (${ph})`, ...postIds);
    run(`DELETE FROM blog_post_likes WHERE post_id IN (${ph})`, ...postIds);
    run(`DELETE FROM blog_post_bookmarks WHERE post_id IN (${ph})`, ...postIds);
    run(`DELETE FROM blog_post_tags WHERE post_id IN (${ph})`, ...postIds);
    run(`DELETE FROM blog_post_categories WHERE post_id IN (${ph})`, ...postIds);
    run(`DELETE FROM blog_post_images WHERE post_id IN (${ph})`, ...postIds);
  }

  const commentIds = all("SELECT id FROM blog_comments WHERE user_id = ?", userId).map((r) => r.id);
  if (commentIds.length) {
    const ch = commentIds.map(() => "?").join(",");
    run(`DELETE FROM blog_reports WHERE target_comment_id IN (${ch})`, ...commentIds);
    run(`DELETE FROM blog_comments WHERE id IN (${ch})`, ...commentIds);
  }

  run(
    "DELETE FROM blog_reports WHERE reporter_user_id = ? OR resolved_by = ?",
    userId,
    userId,
  );
  run("DELETE FROM blog_post_likes WHERE user_id = ?", userId);
  run("DELETE FROM blog_post_bookmarks WHERE user_id = ?", userId);
  run("DELETE FROM blog_posts WHERE author_id = ?", userId);
}

function purgeUserMicroposts(userId) {
  const microImages = all(
    "SELECT image_url FROM microposts WHERE author_id = ? AND COALESCE(image_url, '') <> ''",
    userId,
  );
  for (const row of microImages) unlinkUploadUrl(row.image_url);

  run(
    "UPDATE users SET pinned_post_id = NULL, pinned_post_type = '' WHERE pinned_post_id IN (SELECT id FROM microposts WHERE author_id = ?)",
    userId,
  );
  run(
    "UPDATE microposts SET parent_id = NULL WHERE parent_id IN (SELECT id FROM microposts WHERE author_id = ?)",
    userId,
  );
  const authorPostIds = all("SELECT id FROM microposts WHERE author_id = ?", userId).map((r) => r.id);
  if (authorPostIds.length) {
    const ph = authorPostIds.map(() => "?").join(",");
    run(`DELETE FROM micropost_likes WHERE micropost_id IN (${ph}) OR user_id = ?`, ...authorPostIds, userId);
    run(
      `DELETE FROM micropost_bookmarks WHERE micropost_id IN (${ph}) OR user_id = ?`,
      ...authorPostIds,
      userId,
    );
  } else {
    run("DELETE FROM micropost_likes WHERE user_id = ?", userId);
    run("DELETE FROM micropost_bookmarks WHERE user_id = ?", userId);
  }
  run("DELETE FROM microposts WHERE author_id = ?", userId);
}

function deleteUserFully(userId) {
  db.exec("BEGIN");
  try {
    const result = _deleteUserFullyBody(userId);
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
function _deleteUserFullyBody(userId) {
  const userRow = get("SELECT avatar_url FROM users WHERE id = ?", userId);
  const avatarUrl = userRow?.avatar_url ?? "";

  purgeUserCourses(userId);

  const studentSubAttach = all(
    `SELECT sa.url FROM course_submission_attachments sa
     JOIN course_assignment_submissions s ON s.id = sa.submission_id
     WHERE s.student_id = ?`,
    userId,
  );
  for (const row of studentSubAttach) unlinkUploadUrl(row.url);
  run(
    "DELETE FROM course_submission_attachments WHERE submission_id IN (SELECT id FROM course_assignment_submissions WHERE student_id = ?)",
    userId,
  );

  run("DELETE FROM course_assignment_submissions WHERE student_id = ?", userId);
  run("DELETE FROM course_students WHERE student_id = ?", userId);
  run("DELETE FROM course_co_teachers WHERE user_id = ?", userId);
  run("DELETE FROM user_favorite_courses WHERE user_id = ?", userId);

  purgeUserBlogAndMicro(userId);
  purgeUserMicroposts(userId);

  run(
    "DELETE FROM chat_thread_hidden WHERE user_id = ? OR thread_id IN (SELECT id FROM chat_threads WHERE user_a_id = ? OR user_b_id = ?)",
    userId,
    userId,
    userId,
  );
  run(
    "DELETE FROM chat_messages WHERE thread_id IN (SELECT id FROM chat_threads WHERE user_a_id = ? OR user_b_id = ?)",
    userId,
    userId,
  );
  run("DELETE FROM chat_threads WHERE user_a_id = ? OR user_b_id = ?", userId, userId);

  run(
    "DELETE FROM user_follows WHERE follower_user_id = ? OR following_user_id = ?",
    userId,
    userId,
  );

  run("DELETE FROM invite_links WHERE owner_user_id = ?", userId);

  run("DELETE FROM inbox_notifications WHERE user_id = ? OR actor_id = ?", userId, userId);
  run("DELETE FROM user_achievements WHERE user_id = ?", userId);
  run("DELETE FROM user_daily_activity WHERE user_id = ?", userId);

  const fileRows = all("SELECT storage_path FROM user_files WHERE owner_id = ?", userId);
  const bookRows = all("SELECT storage_path, cover_url FROM library_books WHERE uploaded_by = ?", userId);

  run("DELETE FROM user_files WHERE owner_id = ?", userId);
  run("DELETE FROM user_notes WHERE owner_id = ?", userId);
  run("DELETE FROM share_links WHERE owner_id = ?", userId);
  run("DELETE FROM library_books WHERE uploaded_by = ?", userId);

  run("DELETE FROM user_privacy_settings WHERE user_id = ?", userId);
  run("DELETE FROM user_notification_settings WHERE user_id = ?", userId);

  run("DELETE FROM users WHERE id = ?", userId);
  return { fileRows, bookRows, avatarUrl };
}

function removeDeletedUserFiles(fileRows, bookRows, avatarUrl) {
  if (avatarUrl) unlinkUploadUrl(String(avatarUrl));
  for (const f of fileRows) {
    try {
      const abs = path.join(PRIVATE_FILES_ROOT, f.storage_path);
      if (abs.startsWith(PRIVATE_FILES_ROOT)) fs.unlinkSync(abs);
    } catch {
      /* ignore */
    }
  }
  for (const b of bookRows) {
    try {
      const abs = path.join(LIBRARY_ROOT, b.storage_path);
      if (abs.startsWith(LIBRARY_ROOT)) fs.unlinkSync(abs);
    } catch {
      /* ignore */
    }
    if (b.cover_url) unlinkUploadUrl(String(b.cover_url), ["library-covers"]);
  }
}

router.delete("/admin/users/:id", adminOnly, (req, res) => {
  const id = req.params.id;
  if (id === req.user.id) {
    return res.status(400).json({ error: "нельзя удалить самого себя" });
  }
  const u = get("SELECT id, role FROM users WHERE id = ?", id);
  if (!u) return res.status(404).json({ error: "не найдено" });
  if (u.role === "admin" || u.role === "moderator") {
    return res.status(400).json({ error: "нельзя удалить админа или модератора" });
  }
  try {
    const { fileRows, bookRows, avatarUrl } = deleteUserFully(id);
    removeDeletedUserFiles(fileRows, bookRows, avatarUrl);
    logAdminAction(req.user.id, "user_delete", id);
    return res.json({ ok: true });
  } catch (e) {
    if (process.env.NODE_ENV !== "production") console.error("admin delete user", e);
    return res.status(500).json({ error: "internal error" });
  }
});

router.post("/admin/users/:id/invites", adminOnly, (req, res) => {
  const count = Math.max(1, Math.min(50, Number(req.body?.count ?? 1) | 0));
  const targetRole = ["teacher", "student"].includes(req.body?.target_role) ? req.body.target_role : "student";
  const created = [];
  for (let i = 0; i < count; i++) {
    const id = uuidv4();
    const code = uuidv4().replace(/-/g, "");
    run(
      `INSERT INTO invite_links (id, code, owner_user_id, max_uses, used_count, created_at, target_role)
       VALUES (?, ?, ?, 1, 0, ?, ?)`,
      id,
      code,
      req.params.id,
      nowIso(),
      targetRole,
    );
    created.push(code);
  }
  return res.json({ ok: true, created });
});

function enrichBlogReportRow(r) {
  const reporter = get("SELECT nickname FROM users WHERE id = ?", r.reporter_user_id);
  const out = {
    ...r,
    reporter_nickname: reporter?.nickname ?? "",
    related_post_id: r.target_post_id,
    post_title: null,
    post_author_nickname: null,
    comment_preview: null,
    comment_author_nickname: null,
  };
  if (r.target_type === "post" && r.target_post_id) {
    const p = get(
      `SELECT p.title, u.nickname AS author_nickname FROM blog_posts p
       JOIN users u ON u.id = p.author_id WHERE p.id = ?`,
      r.target_post_id,
    );
    if (p) {
      out.post_title = p.title;
      out.post_author_nickname = p.author_nickname;
    }
    return out;
  }
  if (r.target_type === "comment" && r.target_comment_id) {
    const c = get(
      `SELECT c.body, c.post_id, u.nickname AS author_nickname
       FROM blog_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
      r.target_comment_id,
    );
    if (c) {
      const raw = String(c.body).replace(/\s+/g, " ").trim();
      out.comment_preview = raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
      out.comment_author_nickname = c.author_nickname;
      out.related_post_id = c.post_id;
    }
    const pid = out.related_post_id;
    if (pid) {
      const p = get(
        `SELECT p.title, u.nickname AS author_nickname FROM blog_posts p
         JOIN users u ON u.id = p.author_id WHERE p.id = ?`,
        pid,
      );
      if (p) {
        out.post_title = p.title;
        out.post_author_nickname = p.author_nickname;
      }
    }
  }
  return out;
}

router.get("/admin/blog/reports", (_req, res) => {
  const rows = all("SELECT * FROM blog_reports ORDER BY created_at DESC");
  return res.json(rows.map(enrichBlogReportRow));
});

router.delete("/admin/blog/reports/:id", (req, res) => {
  const info = run("DELETE FROM blog_reports WHERE id = ?", req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "not found" });
  return res.json({ ok: true });
});

router.post("/admin/blog/reports/:id/resolve", (req, res) => {
  const status = ["resolved", "dismissed"].includes(req.body?.status) ? req.body.status : "resolved";
  run(
    "UPDATE blog_reports SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?",
    status,
    nowIso(),
    req.user.id,
    req.params.id,
  );
  return res.json({ ok: true });
});

router.post("/admin/blog/posts/:id/hide", (req, res) => {
  run("UPDATE blog_posts SET status = 'archived' WHERE id = ?", req.params.id);
  return res.json({ ok: true });
});

router.get("/admin/blog/pending", (_req, res) => {
  const rows = all(
    `SELECT bp.id, bp.title, bp.slug, bp.excerpt, bp.cover_image_url, bp.status,
            bp.created_at, bp.published_at, bp.updated_at,
            u.nickname as author_nickname
     FROM blog_posts bp
     JOIN users u ON u.id = bp.author_id
     WHERE bp.is_deleted = 0 AND bp.status IN ('pending', 'recalled')
     ORDER BY bp.updated_at DESC`,
  );
  return res.json(
    rows.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug ?? "",
      excerpt: row.excerpt ?? "",
      cover_image_url: row.cover_image_url ?? "",
      status: row.status,
      author_nickname: row.author_nickname ?? "",
      created_at: row.created_at ?? "",
      published_at: row.published_at ?? null,
      updated_at: row.updated_at ?? "",
    })),
  );
});

router.post("/admin/blog/posts/:id/approve", (req, res) => {
  const row = get(
    "SELECT author_id, status FROM blog_posts WHERE id = ? AND is_deleted = 0",
    req.params.id,
  );
  if (!row) return res.status(404).json({ error: "not found" });
  if (row.status !== "pending" && row.status !== "recalled") {
    return res.status(400).json({ error: "not pending" });
  }
  finalizeBlogPublish(req.params.id, row.author_id);
  return res.json({ ok: true, status: "published" });
});

router.post("/admin/blog/comments/:id/hide", (req, res) => {
  run("UPDATE blog_comments SET status = 'hidden' WHERE id = ?", req.params.id);
  return res.json({ ok: true });
});

router.post("/admin/blog/comments/:id/restore", (req, res) => {
  run("UPDATE blog_comments SET status = 'visible' WHERE id = ?", req.params.id);
  return res.json({ ok: true });
});

export default router;
