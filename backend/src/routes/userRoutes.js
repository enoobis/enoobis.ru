import express from "express";
import { v4 as uuidv4 } from "uuid";
import { all, get, nowIso, run } from "../db.js";
import {
  authRequired,
  bumpTokenVersion,
  hashPassword,
  mintToken,
  optionalUserId,
  verifyPassword,
} from "../auth.js";
import { passwordPolicyError } from "../utils/passwordPolicy.js";
import {
  listAchievementsForUser,
  checkFollowerMilestones,
} from "../utils/achievements.js";
import { buildModerationNotices, parseContentLimits } from "../utils/contentLimits.js";
import { regenerateUserAvatar, sanitizeUserCosmetics } from "../utils/profileCosmetics.js";
import { isValidNickname } from "../utils/nickname.js";
import { isStaffRole } from "../utils/roles.js";
import {
  guestMayViewProfile,
  guestProfileAccessError,
} from "../utils/profileGuestAccess.js";
function viewerId(req) {
  return optionalUserId(req);
}

const router = express.Router();

function buildMe(row) {
  if (!row) return null;
  const favIds = all(
    "SELECT course_id FROM user_favorite_courses WHERE user_id = ?",
    row.id,
  ).map((r) => r.course_id);
  let socialLinks = [];
  try {
    socialLinks = JSON.parse(row.social_links_json ?? "[]");
    if (!Array.isArray(socialLinks)) socialLinks = [];
  } catch {
    socialLinks = [];
  }
  return {
    id: row.id,
    email: row.email,
    nickname: row.nickname,
    role: row.role,
    status: row.status,
    bio: row.bio ?? "",
    wallpaper_url: row.wallpaper_url ?? "",
    avatar_url: row.avatar_url ?? "",
    avatar_frame_url: row.avatar_frame_url ?? "",
    profile_cover_url: row.profile_cover_url ?? "",
    profile_wallpaper_style: normalizeProfileWallpaperStyle(row.profile_wallpaper_style),
    theme_preference: row.theme_preference ?? "black",
    language_preference: row.language_preference ?? "ru",
    font_preference: row.font_preference ?? "normal",
    full_name: row.full_name ?? "",
    website_url: row.website_url ?? "",
    social_links: socialLinks,
    birthday: row.birthday ?? "",
    country: row.country ?? "",
    readme_md: row.readme_md ?? "",
    created_at: row.created_at ?? "",
    favorite_course_ids: favIds,
    nickname_change_count: Number(row.nickname_change_count ?? 0),
    pinned_post_id: row.pinned_post_id ?? null,
    pinned_post_type: row.pinned_post_type ?? "",
    moderation_notices: buildModerationNotices(parseContentLimits(row.content_limits_json ?? "{}")),
    coins: Math.max(0, Math.floor(Number(row.coins ?? 0))),
    ui_font_slug: "outfit",
    ui_ink_hex: "",
    ui_accent_hex: "",
    ui_radius_slug: "default",
  };
}

const MAX_NICK_CHANGES = 3;

const PASSIVE_COIN_EVERY_MS = 10 * 60 * 1000;
const PASSIVE_COIN_AMOUNT = 5;
/** больше этого времени активности за календарный день (utc) → 7 дней без пассивных монет */
const DAILY_ONLINE_CAP_SEC = 16 * 3600;
const PENALTY_DAYS = 7;

function isoAddDays(isoStr, days) {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return nowIso();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

router.get("/me", authRequired, (req, res) => {
  const row = get(
    `SELECT id, email, nickname, role, status, bio, wallpaper_url, avatar_url, avatar_frame_url, profile_cover_url,
            profile_wallpaper_style, theme_preference, language_preference, font_preference, full_name, website_url,
            social_links_json, birthday, country, readme_md, created_at,
            nickname_change_count, pinned_post_id, pinned_post_type, content_limits_json, coins
     FROM users WHERE id = ?`,
    req.user.id,
  );
  if (!row) return res.status(404).json({ error: "not found" });
  const cosmetics = sanitizeUserCosmetics(row);
  const me = buildMe({ ...row, ...cosmetics });
  if (!me) return res.status(404).json({ error: "not found" });
  return res.json(me);
});

router.get("/me/nickname/check", authRequired, (req, res) => {
  const requested = String(req.query.nickname ?? "").trim().toLowerCase();
  if (!requested) return res.json({ available: false, reason: "пустой ник" });
  if (!isValidNickname(requested)) {
    return res.json({ available: false, reason: "от 3 до 24 символов: буквы, цифры, _ и ." });
  }
  const me = get("SELECT nickname FROM users WHERE id = ?", req.user.id);
  if (me?.nickname?.toLowerCase() === requested) {
    return res.json({ available: false, reason: "это текущий ник" });
  }
  const taken = get("SELECT 1 as v FROM users WHERE LOWER(nickname) = ?", requested);
  if (taken) return res.json({ available: false, reason: "ник занят" });
  return res.json({ available: true });
});

router.post("/me/nickname", authRequired, (req, res) => {
  const requested = String(req.body?.nickname ?? "").trim();
  if (!requested) return res.status(400).json({ error: "пустой ник" });
  if (!isValidNickname(requested)) {
    return res.status(400).json({ error: "от 3 до 24 символов: буквы, цифры, _ и ." });
  }
  const me = get(
    "SELECT id, nickname, nickname_change_count FROM users WHERE id = ?",
    req.user.id,
  );
  if (!me) return res.status(404).json({ error: "not found" });
  if (me.nickname.toLowerCase() === requested.toLowerCase()) {
    return res.status(400).json({ error: "это текущий ник" });
  }
  const used = Number(me.nickname_change_count ?? 0);
  if (used >= MAX_NICK_CHANGES) {
    return res.status(400).json({ error: "лимит смен ника исчерпан" });
  }
  const taken = get(
    "SELECT 1 as v FROM users WHERE LOWER(nickname) = ? AND id <> ?",
    requested.toLowerCase(),
    req.user.id,
  );
  if (taken) return res.status(400).json({ error: "ник занят" });
  run(
    "UPDATE users SET nickname = ?, nickname_change_count = nickname_change_count + 1 WHERE id = ?",
    requested,
    req.user.id,
  );
  return res.json({
    nickname: requested,
    changes_used: used + 1,
    changes_left: MAX_NICK_CHANGES - (used + 1),
  });
});

const ALLOWED_THEMES = new Set(["black", "white", "contrast", "contrast-white"]);
const ALLOWED_PROFILE_WALLPAPER_STYLES = new Set(["1", "2"]);

function normalizeThemePreference(raw) {
  const v = String(raw ?? "black").trim();
  if (v === "graphite") return "black";
  if (ALLOWED_THEMES.has(v)) return v;
  return null;
}

function normalizeProfileWallpaperStyle(raw) {
  const v = String(raw ?? "1").trim();
  if (ALLOWED_PROFILE_WALLPAPER_STYLES.has(v)) return v;
  return "1";
}

function ownsShopUrl(userId, url) {
  return !!get(
    `SELECT 1 FROM user_owned_shop_items uoi
     JOIN shop_items si ON si.id = uoi.item_id
     WHERE uoi.user_id = ? AND si.url = ?`,
    userId,
    url,
  );
}

function isOwnUpload(userId, url, allowedSubdirs) {
  const m = String(url).match(/^\/uploads\/([a-z0-9-]+)\/([^/]+)$/i);
  if (!m || !allowedSubdirs.includes(m[1])) return false;
  return m[2].startsWith(`${userId}-`);
}

const COSMETIC_UPLOAD_SUBDIRS = {
  avatar_url: ["avatars"],
  wallpaper_url: ["wallpapers"],
  avatar_frame_url: [],
  profile_cover_url: [],
};

function cosmeticUrlAllowed(userId, field, url) {
  if (ownsShopUrl(userId, url)) return true;
  return isOwnUpload(userId, url, COSMETIC_UPLOAD_SUBDIRS[field] ?? []);
}

router.patch("/me", authRequired, (req, res) => {
  const allowed = [
    "bio",
    "avatar_url",
    "wallpaper_url",
    "avatar_frame_url",
    "profile_cover_url",
    "profile_wallpaper_style",
    "theme_preference",
    "language_preference",
    "font_preference",
    "full_name",
    "website_url",
    "birthday",
    "country",
    "readme_md",
  ];
  const body = req.body ?? {};
  if (typeof body.readme_md === "string" && body.readme_md.length > 4000) {
    return res.status(400).json({ error: "readme_too_long" });
  }
  const STRING_LIMITS = {
    bio: 600,
    full_name: 120,
    website_url: 300,
    country: 80,
    birthday: 40,
  };
  for (const [field, max] of Object.entries(STRING_LIMITS)) {
    if (typeof body[field] === "string" && body[field].length > max) {
      return res.status(400).json({ error: `${field}_too_long` });
    }
  }
  if (body.theme_preference !== undefined) {
    const theme = normalizeThemePreference(body.theme_preference);
    if (!theme) return res.status(400).json({ error: "invalid_theme" });
    body.theme_preference = theme;
  }
  if (body.profile_wallpaper_style !== undefined) {
    body.profile_wallpaper_style = normalizeProfileWallpaperStyle(body.profile_wallpaper_style);
  }
  const COSMETIC_FIELDS = new Set([
    "avatar_url",
    "wallpaper_url",
    "avatar_frame_url",
    "profile_cover_url",
  ]);
  for (const field of allowed) {
    if (body[field] === undefined) continue;
    if (field === "avatar_url" && (body[field] === null || body[field] === "")) {
      const nick = get("SELECT nickname FROM users WHERE id = ?", req.user.id)?.nickname;
      regenerateUserAvatar(req.user.id, nick ?? req.user.id);
      continue;
    }
    if (COSMETIC_FIELDS.has(field) && body[field]) {
      if (!cosmeticUrlAllowed(req.user.id, field, String(body[field]))) {
        return res.status(403).json({ error: "cosmetic_not_owned" });
      }
    }
    run(`UPDATE users SET ${field} = ? WHERE id = ?`, body[field] ?? "", req.user.id);
  }
  if (Array.isArray(body.social_links)) {
    const links = body.social_links
      .slice(0, 12)
      .map((l) => (typeof l === "string" ? l.slice(0, 300) : l));
    run(
      "UPDATE users SET social_links_json = ? WHERE id = ?",
      JSON.stringify(links),
      req.user.id,
    );
  }
  if (Array.isArray(body.favorite_course_ids)) {
    run("DELETE FROM user_favorite_courses WHERE user_id = ?", req.user.id);
    const insert = run.bind(null, "INSERT OR IGNORE INTO user_favorite_courses (user_id, course_id) VALUES (?, ?)");
    for (const id of body.favorite_course_ids.slice(0, 24)) {
      try {
        insert(req.user.id, String(id));
      } catch {
        // ignore
      }
    }
  }
  return res.json({ ok: true });
});

router.post("/me/activity", authRequired, (req, res) => {
  const seconds = Math.max(0, Math.min(3600, Number(req.body?.seconds ?? 0) | 0));
  const userId = req.user.id;
  const day = new Date().toISOString().slice(0, 10);
  const now = nowIso();
  const nowMs = Date.now();

  let beforeSec = 0;
  if (seconds > 0) {
    const rowBefore = get(
      "SELECT seconds_spent FROM user_daily_activity WHERE user_id = ? AND day = ?",
      userId,
      day,
    );
    beforeSec = Number(rowBefore?.seconds_spent ?? 0);
    run(
      `INSERT INTO user_daily_activity (user_id, day, seconds_spent, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, day) DO UPDATE SET
         seconds_spent = seconds_spent + excluded.seconds_spent,
         updated_at = excluded.updated_at`,
      userId,
      day,
      seconds,
      now,
    );
  }

  if (seconds > 0) {
    const rowAfter = get(
      "SELECT seconds_spent FROM user_daily_activity WHERE user_id = ? AND day = ?",
      userId,
      day,
    );
    const afterSec = Number(rowAfter?.seconds_spent ?? beforeSec);
    if (afterSec > DAILY_ONLINE_CAP_SEC && beforeSec <= DAILY_ONLINE_CAP_SEC) {
      run(
        "UPDATE users SET coins_penalty_until = ? WHERE id = ?",
        isoAddDays(now, PENALTY_DAYS),
        userId,
      );
    }
  }

  let u = get(
    "SELECT coins, coins_penalty_until, last_passive_coin_at FROM users WHERE id = ?",
    userId,
  );
  if (u?.coins_penalty_until && new Date(u.coins_penalty_until) <= new Date(now)) {
    run("UPDATE users SET coins_penalty_until = NULL WHERE id = ?", userId);
    u = get(
      "SELECT coins, coins_penalty_until, last_passive_coin_at FROM users WHERE id = ?",
      userId,
    );
  }

  const penalized =
    !!u?.coins_penalty_until && new Date(u.coins_penalty_until) > new Date(now);

  if (!penalized && seconds > 0) {
    if (!u?.last_passive_coin_at) {
      run("UPDATE users SET last_passive_coin_at = ? WHERE id = ?", now, userId);
    } else {
      const lastMs = new Date(u.last_passive_coin_at).getTime();
      if (nowMs - lastMs >= PASSIVE_COIN_EVERY_MS) {
        run(
          "UPDATE users SET coins = coins + ?, last_passive_coin_at = ? WHERE id = ?",
          PASSIVE_COIN_AMOUNT,
          now,
          userId,
        );
      }
    }
  }

  const finalRow = get("SELECT coins FROM users WHERE id = ?", userId);
  const coins = Math.max(0, Math.floor(Number(finalRow?.coins ?? 0)));
  return res.json({ ok: true, coins });
});

router.get("/me/invites", authRequired, (req, res) => {
  const rows = all(
    `SELECT id, code, target_role, max_uses, used_count, created_at
     FROM invite_links
     WHERE owner_user_id = ?
     ORDER BY created_at DESC`,
    req.user.id,
  );
  return res.json(
    rows.map((r) => ({
      ...r,
      remaining: Math.max(0, (r.max_uses ?? 0) - (r.used_count ?? 0)),
    })),
  );
});

router.post("/me/invites", authRequired, (req, res) => {
  const me = get("SELECT role FROM users WHERE id = ?", req.user.id);
  if (!me || !isStaffRole(me.role)) {
    return res.status(403).json({ error: "недостаточно прав" });
  }
  const targetRole = req.body?.target_role === "teacher" ? "teacher" : "student";
  if (targetRole === "teacher" && me.role !== "admin") {
    return res.status(403).json({ error: "только админ может создавать инвайты для менторов" });
  }
  const maxUses = Math.max(1, Math.min(100, Number(req.body?.max_uses ?? 1) | 0));
  const id = uuidv4();
  const code = uuidv4().replace(/-/g, "");
  run(
    `INSERT INTO invite_links (id, code, owner_user_id, max_uses, used_count, created_at, target_role)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
    id,
    code,
    req.user.id,
    maxUses,
    nowIso(),
    targetRole,
  );
  return res.json({
    id,
    code,
    target_role: targetRole,
    max_uses: maxUses,
    used_count: 0,
    remaining: maxUses,
    created_at: nowIso(),
  });
});

router.delete("/me/invites/:id", authRequired, (req, res) => {
  const row = get(
    "SELECT id, owner_user_id, used_count FROM invite_links WHERE id = ?",
    req.params.id,
  );
  if (!row || row.owner_user_id !== req.user.id) {
    return res.status(404).json({ error: "не найдено" });
  }
  run("DELETE FROM invite_links WHERE id = ?", req.params.id);
  return res.json({ ok: true });
});

function ensurePrivacyRow(userId) {
  run(
    `INSERT OR IGNORE INTO user_privacy_settings
       (user_id, profile_visibility, activity_visibility, media_visibility, show_birthday, show_country, show_online_status, updated_at)
       VALUES (?, 'public', 'public', 'public', 1, 1, 0, ?)`,
    userId,
    nowIso(),
  );
}

function privacySettingsFor(userId) {
  ensurePrivacyRow(userId);
  const row = get(
    `SELECT profile_visibility, activity_visibility, media_visibility, show_birthday, show_country
     FROM user_privacy_settings WHERE user_id = ?`,
    userId,
  );
  return {
    profile_visibility: row?.profile_visibility ?? "public",
    activity_visibility: row?.activity_visibility ?? "public",
    media_visibility: row?.media_visibility ?? "public",
    show_birthday: !!row?.show_birthday,
    show_country: !!row?.show_country,
  };
}

function isFollower(viewerId, targetUserId) {
  if (!viewerId || !targetUserId || viewerId === targetUserId) return false;
  return !!get(
    "SELECT 1 as v FROM user_follows WHERE follower_user_id = ? AND following_user_id = ?",
    viewerId,
    targetUserId,
  );
}

function visibilityAllows(viewerId, targetUserId, visibility) {
  if (!targetUserId) return false;
  if (viewerId === targetUserId) return true;
  if (visibility === "public") return true;
  if (visibility === "private") return false;
  if (visibility === "followers") return isFollower(viewerId, targetUserId);
  return false;
}

router.get("/me/privacy", authRequired, (req, res) => {
  return res.json(privacySettingsFor(req.user.id));
});

router.patch("/me/privacy", authRequired, (req, res) => {
  ensurePrivacyRow(req.user.id);
  const body = req.body ?? {};
  const fields = {
    profile_visibility: body.profile_visibility,
    activity_visibility: body.activity_visibility,
    media_visibility: body.media_visibility,
    show_birthday: body.show_birthday,
    show_country: body.show_country,
  };
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (k.startsWith("show_")) {
      run(`UPDATE user_privacy_settings SET ${k} = ?, updated_at = ? WHERE user_id = ?`, v ? 1 : 0, nowIso(), req.user.id);
    } else if (typeof v === "string" && ["public", "followers", "private"].includes(v)) {
      run(`UPDATE user_privacy_settings SET ${k} = ?, updated_at = ? WHERE user_id = ?`, v, nowIso(), req.user.id);
    }
  }
  return res.json(privacySettingsFor(req.user.id));
});

function ensureNotificationsRow(userId) {
  run(
    `INSERT OR IGNORE INTO user_notification_settings
      (user_id, email_enabled, push_enabled, course_updates, assignment_deadlines, grades_released, new_followers, marketing_news, updated_at)
      VALUES (?, 1, 0, 1, 1, 1, 1, 0, ?)`,
    userId,
    nowIso(),
  );
}

router.get("/me/notifications", authRequired, (req, res) => {
  ensureNotificationsRow(req.user.id);
  const row = get(
    `SELECT email_enabled, push_enabled, course_updates, assignment_deadlines,
            grades_released, new_followers, marketing_news
     FROM user_notification_settings WHERE user_id = ?`,
    req.user.id,
  );
  return res.json({
    email_enabled: !!row?.email_enabled,
    push_enabled: !!row?.push_enabled,
    course_updates: !!row?.course_updates,
    assignment_deadlines: !!row?.assignment_deadlines,
    grades_released: !!row?.grades_released,
    new_followers: !!row?.new_followers,
    marketing_news: !!row?.marketing_news,
  });
});

router.patch("/me/notifications", authRequired, (req, res) => {
  ensureNotificationsRow(req.user.id);
  const body = req.body ?? {};
  const flags = [
    "email_enabled",
    "push_enabled",
    "course_updates",
    "assignment_deadlines",
    "grades_released",
    "new_followers",
    "marketing_news",
  ];
  for (const f of flags) {
    if (body[f] !== undefined) {
      run(`UPDATE user_notification_settings SET ${f} = ?, updated_at = ? WHERE user_id = ?`, body[f] ? 1 : 0, nowIso(), req.user.id);
    }
  }
  const updated = get(
    `SELECT email_enabled, push_enabled, course_updates, assignment_deadlines,
            grades_released, new_followers, marketing_news
     FROM user_notification_settings WHERE user_id = ?`,
    req.user.id,
  );
  return res.json({
    email_enabled: !!updated.email_enabled,
    push_enabled: !!updated.push_enabled,
    course_updates: !!updated.course_updates,
    assignment_deadlines: !!updated.assignment_deadlines,
    grades_released: !!updated.grades_released,
    new_followers: !!updated.new_followers,
    marketing_news: !!updated.marketing_news,
  });
});

router.post("/me/password", authRequired, async (req, res) => {
  const { current_password = "", new_password = "" } = req.body ?? {};
  const policyErr = passwordPolicyError(new_password);
  if (policyErr) return res.status(400).json({ error: policyErr });
  const row = get("SELECT password_hash FROM users WHERE id = ?", req.user.id);
  if (!row) return res.status(404).json({ error: "not found" });
  const ok = await verifyPassword(current_password, row.password_hash);
  if (!ok) return res.status(400).json({ error: "wrong_current_password" });
  const hash = await hashPassword(new_password);
  run("UPDATE users SET password_hash = ? WHERE id = ?", hash, req.user.id);
  bumpTokenVersion(req.user.id);
  const token = mintToken(req.user.id, req.user.role, 30);
  return res.json({ ok: true, token });
});

function gradeOverviewFor(userId) {
  const earned =
    get(
      `SELECT COALESCE(SUM(grade_points), 0) as v
       FROM course_assignment_submissions
       WHERE student_id = ? AND grade_points IS NOT NULL`,
      userId,
    )?.v ?? 0;
  const totalGraded =
    get(
      `SELECT COALESCE(SUM(a.max_points), 0) as v
       FROM course_assignment_submissions s
       JOIN course_assignments a ON a.id = s.assignment_id
       WHERE s.student_id = ? AND s.grade_points IS NOT NULL`,
      userId,
    )?.v ?? 0;
  const courseCount =
    get("SELECT COUNT(*) as v FROM course_students WHERE student_id = ?", userId)?.v ?? 0;
  const gradedCount =
    get(
      `SELECT COUNT(*) as v
       FROM course_assignment_submissions
       WHERE student_id = ? AND grade_points IS NOT NULL`,
      userId,
    )?.v ?? 0;
  return {
    courses_count: courseCount,
    assignments_graded: gradedCount,
    points_earned: earned,
    points_total: totalGraded,
    average_percent: totalGraded > 0 ? Math.round((earned / totalGraded) * 1000) / 10 : 0,
  };
}

function fetchPinnedPost(userId) {
  const u = get(
    "SELECT pinned_post_id, pinned_post_type FROM users WHERE id = ?",
    userId,
  );
  if (!u || !u.pinned_post_id || !u.pinned_post_type) return null;
  if (u.pinned_post_type === "micro") {
    const m = get(
      `SELECT m.id, m.body, m.image_url, m.created_at,
              au.nickname as author_nickname, au.avatar_url as author_avatar
       FROM microposts m JOIN users au ON au.id = m.author_id
       WHERE m.id = ? AND m.is_deleted = 0`,
      u.pinned_post_id,
    );
    if (!m) return null;
    return {
      type: "micro",
      id: m.id,
      body: m.body,
      image_url: m.image_url ?? "",
      author_nickname: m.author_nickname ?? "",
      author_avatar: m.author_avatar ?? "",
      created_at: m.created_at,
    };
  }
  if (u.pinned_post_type === "blog") {
    const b = get(
      `SELECT bp.id, bp.title, bp.excerpt, bp.created_at, bp.published_at,
              au.nickname as author_nickname
       FROM blog_posts bp JOIN users au ON au.id = bp.author_id
       WHERE bp.id = ? AND bp.is_deleted = 0 AND bp.status = 'published'`,
      u.pinned_post_id,
    );
    if (!b) return null;
    return {
      type: "blog",
      id: b.id,
      title: b.title,
      excerpt: b.excerpt ?? "",
      author_nickname: b.author_nickname ?? "",
      created_at: b.published_at ?? b.created_at,
    };
  }
  return null;
}

router.get("/leaderboard", authRequired, (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50) || 50));
  const rows = all(
    `SELECT id, nickname, avatar_url, coins
     FROM users
     WHERE status = 'approved'
     ORDER BY coins DESC, created_at ASC
     LIMIT ?`,
    limit,
  );
  return res.json(
    rows.map((r, i) => ({
      rank: i + 1,
      id: r.id,
      nickname: r.nickname,
      avatar_url: r.avatar_url ?? "",
      coins: Math.max(0, Math.floor(Number(r.coins ?? 0))),
    })),
  );
});

router.get("/profile/:nickname", (req, res) => {
  const viewer = viewerId(req);
  const p = get(
    `SELECT id, nickname, role, bio, wallpaper_url, avatar_url, avatar_frame_url, profile_cover_url,
            profile_wallpaper_style, theme_preference, language_preference, font_preference, full_name, website_url,
            social_links_json, birthday, country, readme_md, created_at, content_limits_json
     FROM users WHERE nickname = ?`,
    req.params.nickname,
  );
  if (!p) return res.status(404).json({ error: "not found" });
  if (!guestMayViewProfile(viewer, p.role)) {
    const err = guestProfileAccessError();
    return res.status(err.status).json({ error: err.error });
  }
  const privacy = privacySettingsFor(p.id);
  const isSelf = viewer === p.id;
  if (!isSelf && !visibilityAllows(viewer, p.id, privacy.profile_visibility)) {
    return res.status(404).json({ error: "not found" });
  }
  const cosmetics = sanitizeUserCosmetics(p);
  let socialLinks = [];
  try {
    socialLinks = JSON.parse(p.social_links_json ?? "[]");
    if (!Array.isArray(socialLinks)) socialLinks = [];
  } catch {
    socialLinks = [];
  }
  const favCourseIds = all(
    "SELECT course_id FROM user_favorite_courses WHERE user_id = ?",
    p.id,
  ).map((r) => r.course_id);
  const favorite_courses = [];
  for (const id of favCourseIds) {
    const c = get("SELECT id, title FROM courses WHERE id = ?", id);
    if (c) favorite_courses.push(c);
  }
  const achievements = listAchievementsForUser(p.id);
  const followers_count =
    get("SELECT COUNT(*) as v FROM user_follows WHERE following_user_id = ?", p.id)?.v ?? 0;
  const following_count =
    get("SELECT COUNT(*) as v FROM user_follows WHERE follower_user_id = ?", p.id)?.v ?? 0;

  return res.json({
    nickname: p.nickname,
    role: p.role,
    bio: p.bio ?? "",
    wallpaper_url: cosmetics.wallpaper_url,
    avatar_url: cosmetics.avatar_url,
    avatar_frame_url: cosmetics.avatar_frame_url,
    profile_cover_url: cosmetics.profile_cover_url,
    profile_wallpaper_style: normalizeProfileWallpaperStyle(p.profile_wallpaper_style),
    theme_preference: p.theme_preference ?? "black",
    language_preference: p.language_preference ?? "ru",
    font_preference: p.font_preference ?? "normal",
    full_name: p.full_name ?? "",
    website_url: p.website_url ?? "",
    social_links: socialLinks,
    birthday: isSelf || privacy.show_birthday ? (p.birthday ?? "") : "",
    country: isSelf || privacy.show_country ? (p.country ?? "") : "",
    readme_md: p.readme_md ?? "",
    created_at: p.created_at ?? "",
    favorite_courses,
    achievements,
    followers_count,
    following_count,
    grade_overview: gradeOverviewFor(p.id),
    pinned_post: fetchPinnedPost(p.id),
    moderation_notices: buildModerationNotices(parseContentLimits(p.content_limits_json ?? "{}")),
  });
});

router.post("/me/pin", authRequired, (req, res) => {
  const type = String(req.body?.type ?? "");
  const id = String(req.body?.id ?? "");
  if (!["micro", "blog"].includes(type) || !id) {
    return res.status(400).json({ error: "неверные параметры" });
  }
  if (type === "micro") {
    const row = get(
      "SELECT id, author_id FROM microposts WHERE id = ? AND is_deleted = 0",
      id,
    );
    if (!row) return res.status(404).json({ error: "не найдено" });
    if (row.author_id !== req.user.id) return res.status(403).json({ error: "не ваш пост" });
  } else {
    const row = get(
      "SELECT id, author_id, status FROM blog_posts WHERE id = ? AND is_deleted = 0",
      id,
    );
    if (!row) return res.status(404).json({ error: "не найдено" });
    if (row.author_id !== req.user.id) return res.status(403).json({ error: "не ваш пост" });
    if (row.status !== "published") return res.status(400).json({ error: "только опубликованные" });
  }
  run(
    "UPDATE users SET pinned_post_id = ?, pinned_post_type = ? WHERE id = ?",
    id,
    type,
    req.user.id,
  );
  res.json({ ok: true });
});

router.delete("/me/pin", authRequired, (req, res) => {
  run(
    "UPDATE users SET pinned_post_id = NULL, pinned_post_type = '' WHERE id = ?",
    req.user.id,
  );
  res.json({ ok: true });
});

router.get("/me/achievements", authRequired, (req, res) => {
  res.json({ items: listAchievementsForUser(req.user.id) });
});

router.get("/profile/:nickname/activity", (req, res) => {
  const viewer = viewerId(req);
  const p = get("SELECT id, role, created_at FROM users WHERE nickname = ?", req.params.nickname);
  if (!p) return res.status(404).json({ error: "not found" });
  if (!guestMayViewProfile(viewer, p.role)) {
    const err = guestProfileAccessError();
    return res.status(err.status).json({ error: err.error });
  }
  const privacy = privacySettingsFor(p.id);
  if (!visibilityAllows(viewer, p.id, privacy.activity_visibility)) {
    return res.status(403).json({ error: "forbidden" });
  }
  const year = Number(req.query.year) || new Date().getFullYear();
  const days = all(
    `SELECT day, seconds_spent FROM user_daily_activity
     WHERE user_id = ? AND substr(day, 1, 4) = ?
     ORDER BY day`,
    p.id,
    String(year),
  );
  const total = days.reduce((acc, d) => acc + (d.seconds_spent ?? 0), 0);
  const regYear = (p.created_at || "").slice(0, 4);
  return res.json({
    year,
    registration_year: Number(regYear) || year,
    current_year: new Date().getFullYear(),
    total_seconds: total,
    days,
  });
});

router.get("/profile/:nickname/following/me", authRequired, (req, res) => {
  const p = get("SELECT id FROM users WHERE nickname = ?", req.params.nickname);
  if (!p) return res.json({ following: false });
  const r = get(
    "SELECT 1 as v FROM user_follows WHERE follower_user_id = ? AND following_user_id = ?",
    req.user.id,
    p.id,
  );
  return res.json({ following: !!r });
});

router.post("/profile/:nickname/follow", authRequired, (req, res) => {
  const p = get("SELECT id FROM users WHERE nickname = ?", req.params.nickname);
  if (!p) return res.status(404).json({ error: "not found" });
  if (p.id === req.user.id) return res.status(400).json({ error: "cannot follow yourself" });
  run(
    "INSERT OR IGNORE INTO user_follows (follower_user_id, following_user_id, created_at) VALUES (?, ?, ?)",
    req.user.id,
    p.id,
    nowIso(),
  );
  checkFollowerMilestones(p.id);
  return res.json({ ok: true });
});

router.delete("/profile/:nickname/follow", authRequired, (req, res) => {
  const p = get("SELECT id FROM users WHERE nickname = ?", req.params.nickname);
  if (!p) return res.status(404).json({ error: "not found" });
  run(
    "DELETE FROM user_follows WHERE follower_user_id = ? AND following_user_id = ?",
    req.user.id,
    p.id,
  );
  return res.json({ ok: true });
});

function decorateFollows(rows, viewer) {
  if (!viewer) {
    return rows.map((r) => ({ ...r, is_following: false, is_me: false }));
  }
  const ids = rows.map((r) => r.id);
  const followingSet = new Set();
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const followed = all(
      `SELECT following_user_id FROM user_follows
       WHERE follower_user_id = ? AND following_user_id IN (${placeholders})`,
      viewer,
      ...ids,
    );
    for (const f of followed) followingSet.add(f.following_user_id);
  }
  return rows.map((r) => ({
    ...r,
    is_following: followingSet.has(r.id),
    is_me: r.id === viewer,
    full_name: r.full_name ?? "",
  }));
}

router.get("/profile/:nickname/followers", (req, res) => {
  const viewer = viewerId(req);
  const p = get("SELECT id, role FROM users WHERE nickname = ?", req.params.nickname);
  if (!p) return res.json([]);
  if (!guestMayViewProfile(viewer, p.role)) {
    const err = guestProfileAccessError();
    return res.status(err.status).json({ error: err.error });
  }
  const rows = all(
    `SELECT u.id, u.nickname, u.avatar_url, u.full_name
     FROM user_follows f
     JOIN users u ON u.id = f.follower_user_id
     WHERE f.following_user_id = ?
     ORDER BY f.created_at DESC`,
    p.id,
  );
  return res.json(decorateFollows(rows, viewerId(req)));
});

router.get("/profile/:nickname/following", (req, res) => {
  const viewer = viewerId(req);
  const p = get("SELECT id, role FROM users WHERE nickname = ?", req.params.nickname);
  if (!p) return res.json([]);
  if (!guestMayViewProfile(viewer, p.role)) {
    const err = guestProfileAccessError();
    return res.status(err.status).json({ error: err.error });
  }
  const rows = all(
    `SELECT u.id, u.nickname, u.avatar_url, u.full_name
     FROM user_follows f
     JOIN users u ON u.id = f.following_user_id
     WHERE f.follower_user_id = ?
     ORDER BY f.created_at DESC`,
    p.id,
  );
  return res.json(decorateFollows(rows, viewerId(req)));
});

export default router;
