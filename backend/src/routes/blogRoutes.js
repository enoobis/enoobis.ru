import express from "express";
import { v4 as uuidv4 } from "uuid";
import jwtLib from "jsonwebtoken";
import { all, get, nowIso, run } from "../db.js";
import { authRequired } from "../auth.js";
import {
  awardAchievement,
  checkBlogLikeMilestone,
} from "../utils/achievements.js";

const router = express.Router();

function slugify(text) {
  const s = (text || "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]+/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return s || `post-${Date.now().toString(36)}`;
}

function rowToListItem(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug ?? "",
    excerpt: row.excerpt ?? "",
    cover_image_url: row.cover_image_url ?? "",
    status: row.status ?? "draft",
    author_nickname: row.author_nickname ?? "",
    created_at: row.created_at ?? "",
    published_at: row.published_at ?? null,
    updated_at: row.updated_at ?? "",
    tags: tagsForPost(row.id),
    categories: categoriesForPost(row.id),
    like_count: likeCount(row.id),
    comment_count: commentCount(row.id),
  };
}

function tagsForPost(postId) {
  return all(
    `SELECT t.slug FROM blog_post_tags pt JOIN blog_tags t ON t.id = pt.tag_id WHERE pt.post_id = ?`,
    postId,
  ).map((r) => r.slug);
}
function categoriesForPost(postId) {
  return all(
    `SELECT c.slug FROM blog_post_categories pc JOIN blog_categories c ON c.id = pc.category_id WHERE pc.post_id = ?`,
    postId,
  ).map((r) => r.slug);
}
function likeCount(postId) {
  return get("SELECT COUNT(*) as v FROM blog_post_likes WHERE post_id = ?", postId)?.v ?? 0;
}
function commentCount(postId) {
  return (
    get(
      "SELECT COUNT(*) as v FROM blog_comments WHERE post_id = ? AND status = 'visible'",
      postId,
    )?.v ?? 0
  );
}
function bookmarkCount(postId) {
  return get("SELECT COUNT(*) as v FROM blog_post_bookmarks WHERE post_id = ?", postId)?.v ?? 0;
}

function listingClause(opts) {
  const where = ["bp.is_deleted = 0"];
  const params = [];
  if (opts.publishedOnly) where.push("bp.status = 'published'");
  if (opts.authorId) {
    where.push("bp.author_id = ?");
    params.push(opts.authorId);
  }
  if (opts.q) {
    where.push("(bp.title LIKE ? OR bp.body LIKE ? OR bp.excerpt LIKE ?)");
    const like = `%${opts.q}%`;
    params.push(like, like, like);
  }
  if (opts.tag) {
    where.push(
      "EXISTS (SELECT 1 FROM blog_post_tags pt JOIN blog_tags t ON t.id = pt.tag_id WHERE pt.post_id = bp.id AND t.slug = ?)",
    );
    params.push(opts.tag);
  }
  if (opts.category) {
    where.push(
      "EXISTS (SELECT 1 FROM blog_post_categories pc JOIN blog_categories c ON c.id = pc.category_id WHERE pc.post_id = bp.id AND c.slug = ?)",
    );
    params.push(opts.category);
  }
  return { where: where.join(" AND "), params };
}

function listPaged(req, opts) {
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.page_size ?? 10) || 10));
  const q = String(req.query.q ?? "").trim();
  const tag = String(req.query.tag ?? "").trim();
  const category = String(req.query.category ?? "").trim();
  const { where, params } = listingClause({ ...opts, q, tag, category });
  const total =
    get(`SELECT COUNT(*) as v FROM blog_posts bp WHERE ${where}`, ...params)?.v ?? 0;
  const items = all(
    `SELECT bp.id, bp.title, bp.slug, bp.excerpt, bp.cover_image_url, bp.status,
            bp.created_at, bp.published_at, bp.updated_at,
            u.nickname as author_nickname
     FROM blog_posts bp
     JOIN users u ON u.id = bp.author_id
     WHERE ${where}
     ORDER BY COALESCE(bp.published_at, bp.created_at) DESC
     LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    (page - 1) * pageSize,
  ).map(rowToListItem);
  return { items, page, page_size: pageSize, total };
}

router.get("/blog", (req, res) => {
  return res.json(listPaged(req, { publishedOnly: true }));
});

router.get("/blog/mine", authRequired, (req, res) => {
  return res.json(listPaged(req, { authorId: req.user.id }));
});

router.get("/blog/author/:nickname", (req, res) => {
  const u = get("SELECT id FROM users WHERE nickname = ?", req.params.nickname);
  if (!u) return res.json({ items: [], page: 1, page_size: 10, total: 0 });
  return res.json(listPaged(req, { authorId: u.id, publishedOnly: true }));
});

router.get("/blog/bookmarks/me", authRequired, (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.page_size ?? 10) || 10));
  const total =
    get(
      `SELECT COUNT(*) as v
       FROM blog_post_bookmarks b JOIN blog_posts bp ON bp.id = b.post_id
       WHERE b.user_id = ? AND bp.is_deleted = 0`,
      req.user.id,
    )?.v ?? 0;
  const items = all(
    `SELECT bp.id, bp.title, bp.slug, bp.excerpt, bp.cover_image_url, bp.status,
            bp.created_at, bp.published_at, bp.updated_at,
            u.nickname as author_nickname
     FROM blog_post_bookmarks b
     JOIN blog_posts bp ON bp.id = b.post_id
     JOIN users u ON u.id = bp.author_id
     WHERE b.user_id = ? AND bp.is_deleted = 0
     ORDER BY b.created_at DESC
     LIMIT ? OFFSET ?`,
    req.user.id,
    pageSize,
    (page - 1) * pageSize,
  ).map(rowToListItem);
  return res.json({ items, page, page_size: pageSize, total });
});

router.get("/blog/tags", (_req, res) => {
  const rows = all(
    `SELECT t.slug, t.name, COUNT(pt.post_id) as post_count
     FROM blog_tags t
     LEFT JOIN blog_post_tags pt ON pt.tag_id = t.id
     LEFT JOIN blog_posts bp ON bp.id = pt.post_id AND bp.is_deleted = 0 AND bp.status = 'published'
     GROUP BY t.id
     ORDER BY post_count DESC, t.name`,
  );
  return res.json(rows);
});

router.get("/blog/categories", (_req, res) => {
  const rows = all(
    `SELECT c.slug, c.name, COUNT(pc.post_id) as post_count
     FROM blog_categories c
     LEFT JOIN blog_post_categories pc ON pc.category_id = c.id
     LEFT JOIN blog_posts bp ON bp.id = pc.post_id AND bp.is_deleted = 0 AND bp.status = 'published'
     GROUP BY c.id
     ORDER BY post_count DESC, c.name`,
  );
  return res.json(rows);
});

function fetchPostFull(id, viewerId) {
  const row = get(
    `SELECT bp.*, u.nickname as author_nickname
     FROM blog_posts bp JOIN users u ON u.id = bp.author_id
     WHERE bp.id = ? AND bp.is_deleted = 0`,
    id,
  );
  if (!row) return null;
  const liked = viewerId
    ? !!get(
        "SELECT 1 as v FROM blog_post_likes WHERE user_id = ? AND post_id = ?",
        viewerId,
        id,
      )
    : false;
  const bookmarked = viewerId
    ? !!get(
        "SELECT 1 as v FROM blog_post_bookmarks WHERE user_id = ? AND post_id = ?",
        viewerId,
        id,
      )
    : false;
  const can_edit = viewerId === row.author_id;
  const image_urls = all(
    "SELECT url FROM blog_post_images WHERE post_id = ? ORDER BY created_at",
    id,
  ).map((r) => r.url);
  return {
    id: row.id,
    title: row.title,
    slug: row.slug ?? "",
    excerpt: row.excerpt ?? "",
    body: row.body ?? "",
    cover_image_url: row.cover_image_url ?? "",
    status: row.status,
    author_id: row.author_id,
    author_nickname: row.author_nickname,
    created_at: row.created_at,
    published_at: row.published_at,
    updated_at: row.updated_at,
    tags: tagsForPost(id),
    categories: categoriesForPost(id),
    image_urls,
    like_count: likeCount(id),
    bookmark_count: bookmarkCount(id),
    comment_count: commentCount(id),
    liked_by_me: liked,
    bookmarked_by_me: bookmarked,
    can_edit,
  };
}

function authorizeBearer(req) {
  const auth = req.headers.authorization ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  try {
    const token = auth.slice(7);
    const claims = jwtLib.verify(token, process.env.JWT_SECRET ?? "dev-secret-change-me");
    return claims?.sub ?? null;
  } catch {
    return null;
  }
}

router.get("/blog/:id", (req, res) => {
  const viewerId = authorizeBearer(req);
  const post = fetchPostFull(req.params.id, viewerId);
  if (!post) return res.status(404).json({ error: "not found" });
  if (post.status !== "published" && viewerId !== post.author_id) {
    return res.status(404).json({ error: "not found" });
  }
  return res.json(post);
});

router.get("/blog/:id/edit", authRequired, (req, res) => {
  const post = fetchPostFull(req.params.id, req.user.id);
  if (!post) return res.status(404).json({ error: "not found" });
  if (post.author_id !== req.user.id && req.user.role !== "admin")
    return res.status(403).json({ error: "forbidden" });
  return res.json(post);
});

router.get("/blog/:id/me", authRequired, (req, res) => {
  const liked = !!get(
    "SELECT 1 as v FROM blog_post_likes WHERE user_id = ? AND post_id = ?",
    req.user.id,
    req.params.id,
  );
  const bookmarked = !!get(
    "SELECT 1 as v FROM blog_post_bookmarks WHERE user_id = ? AND post_id = ?",
    req.user.id,
    req.params.id,
  );
  const post = get("SELECT author_id FROM blog_posts WHERE id = ?", req.params.id);
  const isAuthor = !!post && post.author_id === req.user.id;
  return res.json({
    liked,
    bookmarked,
    can_edit: isAuthor,
    can_delete:
      !!post && (isAuthor || req.user.role === "admin"),
  });
});

function ensureTag(name) {
  const slug = slugify(name);
  if (!slug) return null;
  let row = get("SELECT id FROM blog_tags WHERE slug = ?", slug);
  if (!row) {
    const id = uuidv4();
    run("INSERT INTO blog_tags (id, slug, name) VALUES (?, ?, ?)", id, slug, name.trim());
    row = { id };
  }
  return row.id;
}

function ensureCategory(name) {
  const slug = slugify(name);
  if (!slug) return null;
  let row = get("SELECT id FROM blog_categories WHERE slug = ?", slug);
  if (!row) {
    const id = uuidv4();
    run("INSERT INTO blog_categories (id, slug, name) VALUES (?, ?, ?)", id, slug, name.trim());
    row = { id };
  }
  return row.id;
}

function syncTags(postId, list) {
  run("DELETE FROM blog_post_tags WHERE post_id = ?", postId);
  for (const t of list) {
    const id = ensureTag(String(t));
    if (id) run("INSERT OR IGNORE INTO blog_post_tags (post_id, tag_id) VALUES (?, ?)", postId, id);
  }
}

function syncCategories(postId, list) {
  run("DELETE FROM blog_post_categories WHERE post_id = ?", postId);
  for (const c of list) {
    const id = ensureCategory(String(c));
    if (id)
      run(
        "INSERT OR IGNORE INTO blog_post_categories (post_id, category_id) VALUES (?, ?)",
        postId,
        id,
      );
  }
}

router.post("/blog", authRequired, (req, res) => {
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ error: "forbidden" });
  }
  const body = req.body ?? {};
  if (!body.title || !body.body) {
    return res.status(400).json({ error: "нужны заголовок и текст" });
  }
  const id = uuidv4();
  const now = nowIso();
  const status = body.status === "published" ? "published" : "draft";
  const slug = slugify(body.slug || body.title);
  run(
    `INSERT INTO blog_posts
      (id, author_id, title, body, created_at, status, published_at, updated_at, slug, excerpt, cover_image_url, is_deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    id,
    req.user.id,
    String(body.title),
    String(body.body),
    now,
    status,
    status === "published" ? now : null,
    now,
    slug,
    String(body.excerpt ?? ""),
    String(body.cover_image_url ?? ""),
  );
  if (Array.isArray(body.tags)) syncTags(id, body.tags);
  if (Array.isArray(body.categories)) syncCategories(id, body.categories);
  if (status === "published") {
    awardAchievement(req.user.id, "first_blog");
  }
  return res.json(fetchPostFull(id, req.user.id));
});

router.patch("/blog/:id", authRequired, (req, res) => {
  const row = get("SELECT * FROM blog_posts WHERE id = ?", req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  if (row.author_id !== req.user.id && req.user.role !== "admin")
    return res.status(403).json({ error: "forbidden" });
  const body = req.body ?? {};
  const fields = {
    title: body.title,
    body: body.body,
    excerpt: body.excerpt,
    cover_image_url: body.cover_image_url,
  };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) run(`UPDATE blog_posts SET ${k} = ? WHERE id = ?`, v ?? "", req.params.id);
  }
  if (typeof body.slug === "string" && body.slug.trim()) {
    run("UPDATE blog_posts SET slug = ? WHERE id = ?", slugify(body.slug), req.params.id);
  }
  if (typeof body.status === "string" && ["draft", "published", "archived"].includes(body.status)) {
    run("UPDATE blog_posts SET status = ? WHERE id = ?", body.status, req.params.id);
    if (body.status === "published" && !row.published_at) {
      run("UPDATE blog_posts SET published_at = ? WHERE id = ?", nowIso(), req.params.id);
    }
  }
  if (Array.isArray(body.tags)) syncTags(req.params.id, body.tags);
  if (Array.isArray(body.categories)) syncCategories(req.params.id, body.categories);
  run("UPDATE blog_posts SET updated_at = ? WHERE id = ?", nowIso(), req.params.id);
  return res.json(fetchPostFull(req.params.id, req.user.id));
});

router.post("/blog/:id/publish", authRequired, (req, res) => {
  const row = get("SELECT author_id FROM blog_posts WHERE id = ?", req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  if (row.author_id !== req.user.id && req.user.role !== "admin")
    return res.status(403).json({ error: "forbidden" });
  run(
    "UPDATE blog_posts SET status = 'published', published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?",
    nowIso(),
    nowIso(),
    req.params.id,
  );
  awardAchievement(row.author_id, "first_blog");
  return res.json({ ok: true });
});

router.post("/blog/:id/archive", authRequired, (req, res) => {
  const row = get("SELECT author_id FROM blog_posts WHERE id = ?", req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  if (row.author_id !== req.user.id && req.user.role !== "admin")
    return res.status(403).json({ error: "forbidden" });
  run(
    "UPDATE blog_posts SET status = 'archived', updated_at = ? WHERE id = ?",
    nowIso(),
    req.params.id,
  );
  return res.json({ ok: true });
});

router.delete("/blog/:id", authRequired, (req, res) => {
  const row = get("SELECT author_id FROM blog_posts WHERE id = ?", req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  if (row.author_id !== req.user.id && req.user.role !== "admin")
    return res.status(403).json({ error: "forbidden" });
  run(
    "UPDATE blog_posts SET is_deleted = 1, updated_at = ? WHERE id = ?",
    nowIso(),
    req.params.id,
  );
  return res.json({ ok: true });
});

router.get("/blog/:id/comments", (req, res) => {
  const rows = all(
    `SELECT c.id, c.post_id, c.user_id, u.nickname as author_nickname, c.body, c.status,
            c.parent_comment_id, c.created_at, c.updated_at
     FROM blog_comments c JOIN users u ON u.id = c.user_id
     WHERE c.post_id = ? AND c.status = 'visible'
     ORDER BY c.created_at ASC`,
    req.params.id,
  );
  return res.json(rows);
});

router.post("/blog/:id/comments", authRequired, (req, res) => {
  const body = String(req.body?.body ?? "").trim();
  if (!body) return res.status(400).json({ error: "empty comment" });
  const id = uuidv4();
  const now = nowIso();
  run(
    `INSERT INTO blog_comments (id, post_id, user_id, parent_comment_id, body, status, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, 'visible', ?, ?)`,
    id,
    req.params.id,
    req.user.id,
    body,
    now,
    now,
  );
  const row = get(
    `SELECT c.id, c.post_id, c.user_id, u.nickname as author_nickname, c.body, c.status,
            c.parent_comment_id, c.created_at, c.updated_at
     FROM blog_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
    id,
  );
  return res.json(row);
});

router.patch("/blog/comments/:id", authRequired, (req, res) => {
  const row = get("SELECT * FROM blog_comments WHERE id = ?", req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  if (row.user_id !== req.user.id && req.user.role !== "admin")
    return res.status(403).json({ error: "forbidden" });
  const body = String(req.body?.body ?? "").trim();
  if (!body) return res.status(400).json({ error: "empty comment" });
  run(
    "UPDATE blog_comments SET body = ?, updated_at = ? WHERE id = ?",
    body,
    nowIso(),
    req.params.id,
  );
  const updated = get(
    `SELECT c.id, c.post_id, c.user_id, u.nickname as author_nickname, c.body, c.status,
            c.parent_comment_id, c.created_at, c.updated_at
     FROM blog_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
    req.params.id,
  );
  return res.json(updated);
});

router.delete("/blog/comments/:id", authRequired, (req, res) => {
  const row = get("SELECT * FROM blog_comments WHERE id = ?", req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  if (row.user_id !== req.user.id && req.user.role !== "admin")
    return res.status(403).json({ error: "forbidden" });
  run("DELETE FROM blog_comments WHERE id = ?", req.params.id);
  return res.json({ ok: true });
});

router.post("/blog/:id/like", authRequired, (req, res) => {
  run(
    "INSERT OR IGNORE INTO blog_post_likes (user_id, post_id, created_at) VALUES (?, ?, ?)",
    req.user.id,
    req.params.id,
    nowIso(),
  );
  checkBlogLikeMilestone(req.params.id);
  return res.json({ ok: true });
});
router.delete("/blog/:id/like", authRequired, (req, res) => {
  run(
    "DELETE FROM blog_post_likes WHERE user_id = ? AND post_id = ?",
    req.user.id,
    req.params.id,
  );
  return res.json({ ok: true });
});
router.post("/blog/:id/bookmark", authRequired, (req, res) => {
  run(
    "INSERT OR IGNORE INTO blog_post_bookmarks (user_id, post_id, created_at) VALUES (?, ?, ?)",
    req.user.id,
    req.params.id,
    nowIso(),
  );
  return res.json({ ok: true });
});
router.delete("/blog/:id/bookmark", authRequired, (req, res) => {
  run(
    "DELETE FROM blog_post_bookmarks WHERE user_id = ? AND post_id = ?",
    req.user.id,
    req.params.id,
  );
  return res.json({ ok: true });
});

router.post("/blog/:id/report", authRequired, (req, res) => {
  const id = uuidv4();
  run(
    `INSERT INTO blog_reports (id, target_type, target_post_id, target_comment_id, reporter_user_id, reason, status, created_at)
     VALUES (?, 'post', ?, NULL, ?, ?, 'open', ?)`,
    id,
    req.params.id,
    req.user.id,
    String(req.body?.reason ?? ""),
    nowIso(),
  );
  return res.json({ ok: true });
});

router.post("/blog/comments/:id/report", authRequired, (req, res) => {
  const id = uuidv4();
  run(
    `INSERT INTO blog_reports (id, target_type, target_post_id, target_comment_id, reporter_user_id, reason, status, created_at)
     VALUES (?, 'comment', NULL, ?, ?, ?, 'open', ?)`,
    id,
    req.params.id,
    req.user.id,
    String(req.body?.reason ?? ""),
    nowIso(),
  );
  return res.json({ ok: true });
});

export default router;
