import { get } from "../db.js";

/** @typedef {{ ban_until: string | null, ban_forever: boolean, max_per_period: number | null, period: string, min_interval_seconds: number | null }} ChannelLimits */

const PERIODS = new Set(["day", "month", "year", "all"]);

function emptyChannel() {
  return {
    ban_until: null,
    ban_forever: false,
    max_per_period: null,
    period: "day",
    min_interval_seconds: null,
  };
}

/** @param {unknown} c */
function normalizeChannel(c) {
  const base = emptyChannel();
  if (!c || typeof c !== "object") return base;
  const o = /** @type {Record<string, unknown>} */ (c);
  if (o.ban_forever === true) {
    base.ban_forever = true;
    base.ban_until = null;
  } else if (typeof o.ban_until === "string" && o.ban_until.trim()) {
    base.ban_until = o.ban_until.trim();
    base.ban_forever = false;
  }
  if (o.max_per_period != null && o.max_per_period !== "") {
    const n = Number(o.max_per_period);
    if (Number.isFinite(n) && n >= 1) base.max_per_period = Math.floor(n);
  }
  if (typeof o.period === "string" && PERIODS.has(o.period)) base.period = o.period;
  if (o.min_interval_seconds != null && o.min_interval_seconds !== "") {
    const n = Number(o.min_interval_seconds);
    if (Number.isFinite(n) && n >= 60) base.min_interval_seconds = Math.floor(n);
  }
  return base;
}

export function parseContentLimits(jsonStr) {
  let raw = {};
  try {
    raw = JSON.parse(String(jsonStr ?? "{}"));
  } catch {
    raw = {};
  }
  if (!raw || typeof raw !== "object") raw = {};
  const r = /** @type {Record<string, unknown>} */ (raw);
  return {
    blog: normalizeChannel(r.blog),
    micro: normalizeChannel(r.micro),
    blog_comment: normalizeChannel(r.blog_comment),
    chat: normalizeChannel(r.chat),
  };
}

/** @param {string} period */
export function periodStartIso(period, now = new Date()) {
  const d = new Date(now.getTime());
  if (period === "all") return "1970-01-01T00:00:00.000Z";
  if (period === "day") {
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (period === "month") {
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (period === "year") {
    d.setUTCMonth(0, 1);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  }
  return "1970-01-01T00:00:00.000Z";
}

/** @param {ChannelLimits} ch */
function banBlocks(ch) {
  if (ch.ban_forever) return { blocks: true, until: null };
  if (ch.ban_until) {
    const until = new Date(ch.ban_until);
    if (until > new Date()) return { blocks: true, until: ch.ban_until };
  }
  return { blocks: false, until: null };
}

function fmtUntil(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return iso;
  }
}

/** @param {string} period */
function periodRu(period) {
  if (period === "day") return "день";
  if (period === "month") return "месяц";
  if (period === "year") return "год";
  if (period === "all") return "всё время";
  return "период";
}

/**
 * @param {ReturnType<typeof parseContentLimits>} limits
 */
export function buildModerationNotices(limits) {
  const labels = {
    blog: "блог",
    micro: "микро",
    blog_comment: "комментарии в блоге",
    chat: "личные сообщения",
  };
  const out = [];
  for (const key of /** @type {const} */ (["blog", "micro", "blog_comment", "chat"])) {
    const ch = limits[key];
    const label = labels[key];
    const b = banBlocks(ch);
    if (b.blocks) {
      if (ch.ban_forever) {
        out.push(`${label}: бессрочное ограничение модерации.`);
      } else {
        out.push(`${label}: ограничение до ${fmtUntil(b.until)}.`);
      }
    }
    if (ch.max_per_period != null) {
      const unit =
        key === "micro"
          ? "постов"
          : key === "blog"
            ? "публикаций"
            : key === "blog_comment"
              ? "комментариев"
              : "сообщений";
      out.push(`${label}: не более ${ch.max_per_period} ${unit} за ${periodRu(ch.period)}.`);
    }
    if (ch.min_interval_seconds != null) {
      const h = ch.min_interval_seconds / 3600;
      const hrs = Number.isInteger(h) ? String(h) : (ch.min_interval_seconds / 3600).toFixed(1).replace(/\.0$/, "");
      out.push(`${label}: интервал не меньше ${hrs} ч.`);
    }
  }
  return out;
}

/** @param {string} userId @param {ChannelLimits} ch @param {"blog"|"micro"|"blog_comment"|"chat"} kind */
function assertChannel(userId, ch, kind) {
  const b = banBlocks(ch);
  if (b.blocks) {
    if (ch.ban_forever) {
      return {
        ok: false,
        error:
          kind === "chat"
            ? "отправка сообщений запрещена по ограничению модерации."
            : "публикация запрещена по ограничению модерации.",
      };
    }
    return {
      ok: false,
      error:
        kind === "chat"
          ? `отправка сообщений запрещена до ${fmtUntil(b.until)}.`
          : `публикация запрещена до ${fmtUntil(b.until)}.`,
    };
  }
  if (ch.max_per_period != null) {
    const start = periodStartIso(ch.period);
    let cnt = 0;
    if (kind === "blog") {
      cnt =
        get(
          `SELECT COUNT(*) as v FROM blog_posts
           WHERE author_id = ? AND status IN ('published', 'pending') AND is_deleted = 0
             AND datetime(COALESCE(published_at, updated_at, created_at)) >= datetime(?)`,
          userId,
          start,
        )?.v ?? 0;
    } else if (kind === "micro") {
      cnt =
        get(
          `SELECT COUNT(*) as v FROM microposts
           WHERE author_id = ? AND is_deleted = 0
             AND datetime(created_at) >= datetime(?)`,
          userId,
          start,
        )?.v ?? 0;
    } else if (kind === "blog_comment") {
      cnt =
        get(
          `SELECT COUNT(*) as v FROM blog_comments
           WHERE user_id = ? AND status = 'visible'
             AND datetime(created_at) >= datetime(?)`,
          userId,
          start,
        )?.v ?? 0;
    } else {
      cnt =
        get(
          `SELECT COUNT(*) as v FROM chat_messages
           WHERE sender_id = ? AND datetime(created_at) >= datetime(?)`,
          userId,
          start,
        )?.v ?? 0;
    }
    if (cnt >= ch.max_per_period) {
      return {
        ok: false,
        error:
          kind === "chat"
            ? `достигнут лимит сообщений за ${periodRu(ch.period)}.`
            : `достигнут лимит публикаций за ${periodRu(ch.period)}.`,
      };
    }
  }
  if (ch.min_interval_seconds != null) {
    let lastT = null;
    if (kind === "blog") {
      lastT = get(
        `SELECT COALESCE(published_at, updated_at, created_at) as t FROM blog_posts
         WHERE author_id = ? AND status IN ('published', 'pending') AND is_deleted = 0
         ORDER BY datetime(COALESCE(published_at, updated_at, created_at)) DESC LIMIT 1`,
        userId,
      )?.t;
    } else if (kind === "micro") {
      lastT = get(
        `SELECT created_at as t FROM microposts
         WHERE author_id = ? AND is_deleted = 0
         ORDER BY datetime(created_at) DESC LIMIT 1`,
        userId,
      )?.t;
    } else if (kind === "blog_comment") {
      lastT = get(
        `SELECT created_at as t FROM blog_comments
         WHERE user_id = ? AND status = 'visible'
         ORDER BY datetime(created_at) DESC LIMIT 1`,
        userId,
      )?.t;
    } else {
      lastT = get(
        `SELECT created_at as t FROM chat_messages
         WHERE sender_id = ?
         ORDER BY datetime(created_at) DESC LIMIT 1`,
        userId,
      )?.t;
    }
    if (lastT) {
      const delta = (Date.now() - new Date(lastT).getTime()) / 1000;
      if (delta < ch.min_interval_seconds) {
        const wait = Math.ceil(ch.min_interval_seconds - delta);
        const m = Math.ceil(wait / 60);
        return { ok: false, error: `слишком часто. подожди ещё ${m} мин.` };
      }
    }
  }
  return { ok: true };
}

/** @param {string} jsonFromDb */
export function assertBlogPublish(userId, jsonFromDb) {
  const limits = parseContentLimits(jsonFromDb);
  return assertChannel(userId, limits.blog, "blog");
}

export function assertMicroPublish(userId, jsonFromDb) {
  const limits = parseContentLimits(jsonFromDb);
  return assertChannel(userId, limits.micro, "micro");
}

export function assertBlogComment(userId, jsonFromDb) {
  const limits = parseContentLimits(jsonFromDb);
  return assertChannel(userId, limits.blog_comment, "blog_comment");
}

export function assertChatOutgoing(userId, jsonFromDb) {
  const limits = parseContentLimits(jsonFromDb);
  return assertChannel(userId, limits.chat, "chat");
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} [existingJson]
 */
export function limitsFromAdminBody(body, existingJson = "{}") {
  const base = parseContentLimits(existingJson);
  const out = {
    blog: { ...base.blog },
    micro: { ...base.micro },
    blog_comment: { ...base.blog_comment },
    chat: { ...base.chat },
  };
  for (const key of ["blog", "micro", "blog_comment", "chat"]) {
    const raw = body?.[key];
    if (raw === undefined) continue;
    if (!raw || typeof raw !== "object") {
      out[key] = emptyChannel();
      continue;
    }
    const o = /** @type {Record<string, unknown>} */ (raw);
    const ch = emptyChannel();
    if (o.ban_forever === true) {
      ch.ban_forever = true;
    } else if (typeof o.ban_until === "string" && o.ban_until.trim()) {
      const t = new Date(o.ban_until.trim());
      if (!Number.isNaN(t.getTime()) && t > new Date()) {
        ch.ban_until = t.toISOString();
      }
    }
    const max = o.max_per_period;
    if (max != null && max !== "" && Number(max) > 0) {
      ch.max_per_period = Math.floor(Number(max));
      const p = String(o.period ?? "day");
      ch.period = PERIODS.has(p) ? p : "day";
    }
    const h = o.min_interval_hours;
    if (h != null && h !== "" && Number(h) > 0) {
      ch.min_interval_seconds = Math.max(60, Math.round(Number(h) * 3600));
    }
    out[key] = ch;
  }
  return out;
}

export function limitsToJson(limits) {
  return JSON.stringify(limits);
}
