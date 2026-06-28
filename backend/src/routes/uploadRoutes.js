import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import { nowIso, run, get } from "../db.js";
import { authRequired } from "../auth.js";
import { canBlogAndStorage, isAdmin, isPanelStaff } from "../utils/roles.js";
import { isRasterImageMimetype, optimizeUploadedFile } from "../utils/imageOptimize.js";
import { SHOP_KINDS } from "../utils/shopPresets.js";
import {
  attachCategoriesToItems,
  createShopCategory,
  deleteShopCategory,
  listShopCategories,
  parseCategoryIdsInput,
  setItemCategories,
  updateShopCategory,
} from "../utils/shopCategories.js";
import { detachShopItemFromUsers } from "../utils/profileCosmetics.js";
import {
  verifyLectureFile,
  verifyMp4Video,
  verifyRasterImage,
  verifyWebmVideo,
} from "../utils/mimeVerify.js";
import { assertSafeUploadExtension } from "../utils/security.js";
import { unlinkUploadUrl, UPLOAD_ROOT } from "../utils/uploadSafe.js";

const router = express.Router();

const SUBDIRS = [
  "avatars",
  "blog",
  "course-lectures",
  "course-icons",
  "wallpapers",
  "shop-avatars",
  "shop-items",
];
for (const d of SUBDIRS) fs.mkdirSync(path.join(UPLOAD_ROOT, d), { recursive: true });

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function imageFileFilter(_req, file, cb) {
  if (IMAGE_MIMES.has(file.mimetype)) cb(null, true);
  else cb(new Error("only jpeg, png, gif, webp"));
}

function uploadSingle(upload, field) {
  return (req, res, next) => {
    upload.single(field)(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message ?? "upload error" });
      next();
    });
  };
}

function makeStorage(subdir) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_ROOT, subdir)),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || ".bin").toLowerCase();
      cb(null, `${req.user?.id ?? "anon"}-${uuidv4().replace(/-/g, "")}${ext}`);
    },
  });
}

const avatarUpload = multer({
  storage: makeStorage("avatars"),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});
const blogUpload = multer({
  storage: makeStorage("blog"),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});
const LECTURE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "video/mp4",
  "video/webm",
]);

function lectureFileFilter(_req, file, cb) {
  if (LECTURE_MIMES.has(file.mimetype)) cb(null, true);
  else cb(new Error("only images, pdf, mp4, webm"));
}

function canManageCourse(user, courseId) {
  return canEditCourseIcon(user, courseId);
}

const lectureUpload = multer({
  storage: makeStorage("course-lectures"),
  limits: { fileSize: 32 * 1024 * 1024 },
  fileFilter: lectureFileFilter,
});
const courseIconUpload = multer({
  storage: makeStorage("course-icons"),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

function canEditCourseIcon(user, courseId) {
  const c = get("SELECT teacher_id FROM courses WHERE id = ?", courseId);
  if (!c) return false;
  if (user.role === "admin") return true;
  if (c.teacher_id === user.id) return true;
  return !!get(
    "SELECT 1 as v FROM course_co_teachers WHERE course_id = ? AND user_id = ?",
    courseId,
    user.id,
  );
}

function unlinkCourseIconUrl(url) {
  if (!url || !url.startsWith("/uploads/course-icons/")) return;
  unlinkUploadUrl(url, ["course-icons"]);
}

router.post("/me/avatar", authRequired, uploadSingle(avatarUpload, "file"), async (req, res) => {
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
  if (isRasterImageMimetype(req.file.mimetype)) {
    const r = await optimizeUploadedFile(req.file.path, "avatar");
    if (r.ok) req.file.filename = r.filename;
  }
  const url = `/uploads/avatars/${req.file.filename}`;
  run("UPDATE users SET avatar_url = ? WHERE id = ?", url, req.user.id);
  return res.json({ avatar_url: url });
});

router.post("/blog/upload-image", authRequired, uploadSingle(blogUpload, "file"), async (req, res) => {
  if (!canBlogAndStorage(req.user.role)) return res.status(403).json({ error: "forbidden" });
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
  if (isRasterImageMimetype(req.file.mimetype)) {
    const r = await optimizeUploadedFile(req.file.path, "blog");
    if (r.ok) req.file.filename = r.filename;
  }
  const url = `/uploads/blog/${req.file.filename}`;
  const postId = req.body?.post_id ? String(req.body.post_id).trim() : "";
  if (postId) {
    const post = get("SELECT id, author_id FROM blog_posts WHERE id = ?", postId);
    if (
      post &&
      (post.author_id === req.user.id || req.user.role === "admin")
    ) {
      run(
        "INSERT INTO blog_post_images (id, post_id, uploader_user_id, url, created_at) VALUES (?, ?, ?, ?, ?)",
        uuidv4(),
        postId,
        req.user.id,
        url,
        nowIso(),
      );
    }
  }
  return res.json({ url });
});

router.post(
  "/courses/:id/icon",
  authRequired,
  (req, res, next) => {
    const courseId = String(req.params.id ?? "").trim();
    if (!courseId) return res.status(400).json({ error: "invalid course" });
    if (!canEditCourseIcon(req.user, courseId)) {
      return res.status(403).json({ error: "forbidden" });
    }
    courseIconUpload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message ?? "upload error" });
      next();
    });
  },
  async (req, res) => {
    const courseId = String(req.params.id ?? "").trim();
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
    if (isRasterImageMimetype(req.file.mimetype)) {
      const r = await optimizeUploadedFile(req.file.path, "course_icon");
      if (r.ok) req.file.filename = r.filename;
    }
    const url = `/uploads/course-icons/${req.file.filename}`;
    const prev = get("SELECT icon_url FROM courses WHERE id = ?", courseId);
    if (!prev) return res.status(404).json({ error: "not found" });
    unlinkCourseIconUrl(prev.icon_url);
    run("UPDATE courses SET icon_url = ? WHERE id = ?", url, courseId);
    return res.json({ icon_url: url });
  },
);

router.delete("/courses/:id/icon", authRequired, (req, res) => {
  const courseId = String(req.params.id ?? "").trim();
  if (!courseId) return res.status(400).json({ error: "invalid course" });
  if (!canEditCourseIcon(req.user, courseId)) {
    return res.status(403).json({ error: "forbidden" });
  }
  const prev = get("SELECT icon_url FROM courses WHERE id = ?", courseId);
  if (!prev) return res.status(404).json({ error: "not found" });
  unlinkCourseIconUrl(prev.icon_url);
  run("UPDATE courses SET icon_url = '' WHERE id = ?", courseId);
  return res.json({ icon_url: "" });
});

router.post(
  "/courses/:id/lectures/upload",
  authRequired,
  (req, res, next) => {
    const courseId = String(req.params.id ?? "").trim();
    if (!courseId) return res.status(400).json({ error: "invalid course" });
    if (!canManageCourse(req.user, courseId)) {
      return res.status(403).json({ error: "forbidden" });
    }
    lectureUpload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message ?? "upload error" });
      next();
    });
  },
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "no file" });
    try {
      assertSafeUploadExtension(req.file.originalname);
    } catch {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
      return res.status(400).json({ error: "blocked file type" });
    }
    const valid = await verifyLectureFile(req.file.path, req.file.mimetype || "");
    if (!valid) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
      return res.status(400).json({ error: "invalid file" });
    }
    if (isRasterImageMimetype(req.file.mimetype)) {
      const r = await optimizeUploadedFile(req.file.path, "lecture");
      if (r.ok) req.file.filename = r.filename;
    }
    const url = `/uploads/course-lectures/${req.file.filename}`;
    return res.json({ url, file_name: req.file.originalname });
  },
);

const SHOP_MIMES = new Set([...IMAGE_MIMES, "video/mp4", "video/webm"]);
const SHOP_IMAGE_MAX = 6 * 1024 * 1024;
const SHOP_VIDEO_MAX = 10 * 1024 * 1024;

function isShopWallpaperVideoMime(mime) {
  return mime === "video/mp4" || mime === "video/webm";
}

function shopFileFilter(_req, file, cb) {
  if (SHOP_MIMES.has(file.mimetype)) cb(null, true);
  else cb(new Error("only jpeg, png, gif, webp, mp4, webm"));
}

const shopItemUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_ROOT, "shop-items")),
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || ".bin").toLowerCase();
      cb(null, `shop-${uuidv4().replace(/-/g, "")}${ext}`);
    },
  }),
  limits: { fileSize: SHOP_VIDEO_MAX },
  fileFilter: shopFileFilter,
});

router.post("/admin/shop/items", authRequired, (req, res, next) => {
  if (!isPanelStaff(req.user.role)) return res.status(403).json({ error: "forbidden" });
  shopItemUpload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message ?? "upload error" });
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  const kind = String(req.body?.kind ?? "avatar").trim();
  if (!SHOP_KINDS.has(kind)) return res.status(400).json({ error: "bad kind" });
  if (kind === "special" && !isAdmin(req.user.role)) return res.status(403).json({ error: "forbidden" });
  const isVideo = isShopWallpaperVideoMime(req.file.mimetype);
  if (isVideo) {
    if (kind !== "wallpaper") {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
      return res.status(400).json({ error: "video only for wallpaper" });
    }
    if (req.file.size > SHOP_VIDEO_MAX) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
      return res.status(400).json({ error: "video max 10mb" });
    }
    const validVideo =
      req.file.mimetype === "video/mp4"
        ? verifyMp4Video(req.file.path)
        : verifyWebmVideo(req.file.path);
    if (!validVideo) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
      return res.status(400).json({ error: "invalid video" });
    }
  } else {
    if (req.file.size > SHOP_IMAGE_MAX) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
      return res.status(400).json({ error: "image max 6mb" });
    }
    const probe = await verifyRasterImage(req.file.path);
    if (!probe.ok) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
      return res.status(400).json({ error: "invalid image" });
    }
  }
  const name = String(req.body?.name ?? "").trim() || req.file.originalname;
  const categoryIds = parseCategoryIdsInput(req.body);
  const price = Math.max(0, parseInt(req.body?.price ?? "0", 10) || 0);
  const rawStock = req.body?.stock_limit;
  /** @type {number | null} */
  let stockLimit = null;
  if (rawStock !== undefined && rawStock !== null && String(rawStock).trim() !== "") {
    const n = parseInt(String(rawStock), 10);
    if (!Number.isFinite(n) || n < 1) return res.status(400).json({ error: "bad stock_limit" });
    stockLimit = n;
  }
  let isAnimated = req.file.mimetype === "image/gif" || isVideo ? 1 : 0;
  let presetKey = "avatar";
  if (kind === "frame") presetKey = "shop_frame";
  else if (kind === "wallpaper") presetKey = "shop_wallpaper";
  else if (kind === "special") presetKey = "shop_special";
  if (!isVideo && isRasterImageMimetype(req.file.mimetype) && req.file.mimetype !== "image/gif") {
    const r = await optimizeUploadedFile(req.file.path, /** @type {"avatar"|"shop_frame"|"shop_wallpaper"|"shop_special"} */ (presetKey));
    if (r.ok) req.file.filename = r.filename;
    if (kind === "frame" && r.animated) isAnimated = 1;
  }
  const url = `/uploads/shop-items/${req.file.filename}`;
  const id = uuidv4();
  run(
    `INSERT INTO shop_items (id, kind, name, url, price, is_animated, stock_limit, preset_value, added_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    id,
    kind,
    name,
    url,
    price,
    isAnimated,
    stockLimit,
    req.user.id,
    nowIso(),
  );
  setItemCategories(id, categoryIds);
  const item = attachCategoriesToItems([
    {
      id,
      kind,
      name,
      url,
      price,
      is_animated: isAnimated,
      stock_limit: stockLimit,
      sold_count: 0,
    },
  ])[0];
  return res.json({ ok: true, ...item });
});

router.get("/admin/shop/categories", authRequired, (req, res) => {
  if (!isPanelStaff(req.user.role)) return res.status(403).json({ error: "forbidden" });
  return res.json(listShopCategories());
});

router.post("/admin/shop/categories", authRequired, (req, res) => {
  if (!isPanelStaff(req.user.role)) return res.status(403).json({ error: "forbidden" });
  try {
    const row = createShopCategory(req.body?.id, req.body?.name);
    return res.json(row);
  } catch (e) {
    return res.status(400).json({ error: e.message ?? "error" });
  }
});

router.patch("/admin/shop/categories/:id", authRequired, (req, res) => {
  if (!isPanelStaff(req.user.role)) return res.status(403).json({ error: "forbidden" });
  try {
    const row = updateShopCategory(req.params.id, req.body?.name);
    if (!row) return res.status(404).json({ error: "not found" });
    return res.json(row);
  } catch (e) {
    return res.status(400).json({ error: e.message ?? "error" });
  }
});

router.delete("/admin/shop/categories/:id", authRequired, (req, res) => {
  if (!isPanelStaff(req.user.role)) return res.status(403).json({ error: "forbidden" });
  deleteShopCategory(req.params.id);
  return res.json({ ok: true });
});

router.patch("/admin/shop/items/:id", authRequired, (req, res) => {
  if (!isPanelStaff(req.user.role)) return res.status(403).json({ error: "forbidden" });
  const row = get("SELECT id, kind FROM shop_items WHERE id = ?", req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  const nextKind =
    req.body?.kind !== undefined ? String(req.body.kind).trim() : String(row.kind ?? "");
  if ((row.kind === "special" || nextKind === "special") && !isAdmin(req.user.role)) {
    return res.status(403).json({ error: "forbidden" });
  }
  const sets = [];
  const params = [];
  if (req.body?.kind !== undefined) {
    const kind = String(req.body.kind).trim();
    if (!SHOP_KINDS.has(kind)) return res.status(400).json({ error: "bad kind" });
    sets.push("kind = ?");
    params.push(kind);
  }
  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) return res.status(400).json({ error: "нужно название" });
    sets.push("name = ?");
    params.push(name);
  }
  if (req.body?.price !== undefined) {
    const price = Math.max(0, Math.floor(Number(req.body.price) || 0));
    sets.push("price = ?");
    params.push(price);
  }
  if (req.body?.stock_limit !== undefined) {
    if (req.body.stock_limit === null || req.body.stock_limit === "") {
      sets.push("stock_limit = ?");
      params.push(null);
    } else {
      const lim = Math.floor(Number(req.body.stock_limit));
      if (!Number.isFinite(lim) || lim < 1) {
        return res.status(400).json({ error: "тираж: целое от 1" });
      }
      const soldRow = get(
        "SELECT COUNT(*) as c FROM user_owned_shop_items WHERE item_id = ?",
        req.params.id,
      );
      const sold = Math.max(0, Math.floor(Number(soldRow?.c ?? 0)));
      if (sold > lim) {
        return res.status(400).json({ error: "тираж меньше уже проданного" });
      }
      sets.push("stock_limit = ?");
      params.push(lim);
    }
  }
  const categoryIds = req.body?.categories !== undefined ? parseCategoryIdsInput(req.body) : null;

  if (!sets.length && categoryIds === null) {
    return res.status(400).json({ error: "nothing to update" });
  }
  if (sets.length) {
    params.push(req.params.id);
    run(`UPDATE shop_items SET ${sets.join(", ")} WHERE id = ?`, ...params);
  }
  if (categoryIds !== null) setItemCategories(req.params.id, categoryIds);

  const item = get(
    "SELECT id, kind, name, url, price, is_animated, stock_limit, preset_value FROM shop_items WHERE id = ?",
    req.params.id,
  );
  if (!item) return res.status(404).json({ error: "not found" });
  const soldRow = get("SELECT COUNT(*) as c FROM user_owned_shop_items WHERE item_id = ?", req.params.id);
  const full = attachCategoriesToItems([{ ...item, sold_count: soldRow?.c ?? 0 }])[0];
  return res.json({ ok: true, item: full });
});

router.delete("/admin/shop/items/:id", authRequired, (req, res) => {
  if (!isPanelStaff(req.user.role)) return res.status(403).json({ error: "forbidden" });
  const row = get("SELECT kind, url FROM shop_items WHERE id = ?", req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  if (row.kind === "special" && !isAdmin(req.user.role)) return res.status(403).json({ error: "forbidden" });
  detachShopItemFromUsers(row.kind, row.url);
  run("DELETE FROM user_owned_shop_items WHERE item_id = ?", req.params.id);
  run("DELETE FROM shop_item_categories WHERE item_id = ?", req.params.id);
  if (row.url?.startsWith("/uploads/shop-items/") || row.url?.startsWith("/uploads/shop-avatars/")) {
    try {
      unlinkUploadUrl(row.url, ["shop-items"]);
    } catch {
      /* ignore */
    }
  }
  run("DELETE FROM shop_items WHERE id = ?", req.params.id);
  return res.json({ ok: true });
});

export default router;
