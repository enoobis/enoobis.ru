import express from "express";
import { run, get, all, nowIso, db } from "../db.js";
import { authRequired } from "../auth.js";
import { SHOP_KINDS } from "../utils/shopPresets.js";
import { attachCategoriesToItems, listShopCategories } from "../utils/shopCategories.js";
import { regenerateUserAvatar } from "../utils/profileCosmetics.js";
import { enrichShopItems, getShopStorageStats } from "../utils/shopStorage.js";
import { isPanelStaff } from "../utils/roles.js";

const router = express.Router();

const DEFAULT_LIST_KINDS = ["avatar", "frame", "wallpaper", "cover"];
const SHOP_PAGE_SIZE_DEFAULT = 24;
const SHOP_PAGE_SIZE_MAX = 48;

const IMAGE_KINDS_SQL = "('avatar','frame','wallpaper','cover')";

function ownedIdsForUser(userId) {
  return new Set(
    all("SELECT item_id FROM user_owned_shop_items WHERE user_id = ?", userId).map((r) => r.item_id),
  );
}

/** @param {string[]} kinds */
function listItemsQuery(kinds) {
  const placeholders = kinds.map(() => "?").join(", ");
  return all(
    `SELECT si.id, si.kind, si.name, si.url, si.price, si.is_animated, si.created_at, si.stock_limit,
      si.preset_value,
      (SELECT COUNT(*) FROM user_owned_shop_items uoi WHERE uoi.item_id = si.id) AS sold_count
     FROM shop_items si
     WHERE si.kind IN (${placeholders}) ORDER BY si.created_at DESC`,
    ...kinds,
  );
}

function listItemsWithSize(kinds) {
  return enrichShopItems(listItemsQuery(kinds));
}

/** @param {string[]} kinds @param {string} role */
function listItemsForUser(kinds, role) {
  const rows = isPanelStaff(role) ? listItemsWithSize(kinds) : listItemsQuery(kinds);
  return attachCategoriesToItems(rows);
}

/** @param {number} status @param {string} code */
function shopBuyError(status, code) {
  const e = /** @type {Error & { status: number; code: string }} */ (new Error(code));
  e.status = status;
  e.code = code;
  return e;
}

/** @param {string} userId @param {string} itemId @param {boolean} avatarOnly */
function buyShopItemCore(userId, itemId, avatarOnly) {
  const item = get(
    avatarOnly
      ? "SELECT id, kind, name, url, price, stock_limit, preset_value FROM shop_items WHERE id = ? AND kind = 'avatar'"
      : "SELECT id, kind, name, url, price, stock_limit, preset_value FROM shop_items WHERE id = ?",
    itemId,
  );
  if (!item) throw shopBuyError(404, "not_found");
  if (!avatarOnly && !SHOP_KINDS.has(item.kind)) throw shopBuyError(400, "bad_kind");

  const already = get("SELECT 1 FROM user_owned_shop_items WHERE user_id = ? AND item_id = ?", userId, item.id);
  if (already) throw shopBuyError(400, "already_owned");

  const soldRow = get("SELECT COUNT(*) as c FROM user_owned_shop_items WHERE item_id = ?", item.id);
  const sold = Math.max(0, Math.floor(Number(soldRow?.c ?? 0)));
  const limit = item.stock_limit == null ? null : Math.max(0, Math.floor(Number(item.stock_limit)));
  if (limit != null && limit > 0 && sold >= limit) throw shopBuyError(400, "sold_out");

  const user = get("SELECT coins FROM users WHERE id = ?", userId);
  const coins = Math.max(0, Math.floor(Number(user?.coins ?? 0)));
  if (coins < item.price) throw shopBuyError(400, "not_enough");

  const paid = run(
    "UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?",
    item.price,
    userId,
    item.price,
  );
  if (!paid.changes) throw shopBuyError(400, "not_enough");
  run(
    "INSERT INTO user_owned_shop_items (user_id, item_id, acquired_at) VALUES (?, ?, ?)",
    userId,
    item.id,
    nowIso(),
  );
  const after = get("SELECT coins FROM users WHERE id = ?", userId);
  return { ok: true, coins: Math.max(0, Math.floor(Number(after?.coins ?? 0))) };
}

function handleShopBuyError(res, err) {
  const e = /** @type {{ status?: number; code?: string; message?: string }} */ (err);
  if (e.status && e.code) {
    const map = {
      not_found: "not found",
      bad_kind: "bad kind",
      already_owned: "already owned",
      sold_out: "распродано",
      not_enough: "not enough coins",
      bad_item: "bad item",
    };
    return res.status(e.status).json({ error: map[e.code] ?? e.code });
  }
  return null;
}

function cosmeticRow(userId) {
  return get(
    `SELECT avatar_url, wallpaper_url, avatar_frame_url, profile_cover_url
     FROM users WHERE id = ?`,
    userId,
  );
}

router.get("/shop/categories", authRequired, (_req, res) => {
  return res.json(listShopCategories());
});

router.get("/shop/storage", authRequired, (req, res) => {
  if (!isPanelStaff(req.user.role)) return res.status(403).json({ error: "forbidden" });
  return res.json(getShopStorageStats());
});

router.get("/shop/items", authRequired, (req, res) => {
  const raw = String(req.query.kind ?? "").trim();
  const catFilter = String(req.query.category ?? "").trim();
  const pageRaw = req.query.page;
  const paginated = pageRaw !== undefined && pageRaw !== "";
  /** @type {string[]} */
  let kinds;
  if (raw && SHOP_KINDS.has(raw)) {
    kinds = [raw];
  } else {
    kinds = DEFAULT_LIST_KINDS;
  }
  let items = listItemsForUser(kinds, req.user.role);
  if (catFilter) {
    items = items.filter((i) => i.categories.some((c) => c.id === catFilter));
  }
  const owned = ownedIdsForUser(req.user.id);
  const withOwned = items.map((i) => ({ ...i, owned: owned.has(i.id) }));

  if (!paginated) {
    return res.json(withOwned);
  }

  const page = Math.max(1, Number(pageRaw) || 1);
  const pageSize = Math.min(
    SHOP_PAGE_SIZE_MAX,
    Math.max(1, Number(req.query.page_size ?? SHOP_PAGE_SIZE_DEFAULT) || SHOP_PAGE_SIZE_DEFAULT),
  );
  const available = withOwned.filter((i) => !i.owned);
  const total = available.length;
  const slice = available.slice((page - 1) * pageSize, page * pageSize);
  return res.json({ items: slice, page, page_size: pageSize, total });
});

router.get("/shop/avatars", authRequired, (req, res) => {
  const items = listItemsForUser(["avatar"], req.user.role);
  const owned = ownedIdsForUser(req.user.id);
  return res.json(items.map((i) => ({ ...i, owned: owned.has(i.id) })));
});

router.get("/shop/my-items", authRequired, (req, res) => {
  const rows = all(
    `SELECT si.id, si.kind, si.name, si.url, si.price, si.is_animated, si.preset_value, uoi.acquired_at
     FROM user_owned_shop_items uoi
     JOIN shop_items si ON si.id = uoi.item_id
     WHERE uoi.user_id = ? AND si.kind IN ${IMAGE_KINDS_SQL}
     ORDER BY uoi.acquired_at DESC`,
    req.user.id,
  );
  return res.json(attachCategoriesToItems(rows));
});

router.get("/shop/my-avatars", authRequired, (req, res) => {
  const rows = all(
    `SELECT si.id, si.name, si.url, si.price, si.is_animated, uoi.acquired_at
     FROM user_owned_shop_items uoi
     JOIN shop_items si ON si.id = uoi.item_id
     WHERE uoi.user_id = ? AND si.kind = 'avatar'
     ORDER BY uoi.acquired_at DESC`,
    req.user.id,
  );
  return res.json(rows);
});

router.post("/shop/items/:id/buy", authRequired, (req, res) => {
  try {
    const out = db.transaction(() => buyShopItemCore(req.user.id, req.params.id, false))();
    return res.json(out);
  } catch (err) {
    const r = handleShopBuyError(res, err);
    if (r) return r;
    throw err;
  }
});

router.post("/shop/avatars/:id/buy", authRequired, (req, res) => {
  try {
    const out = db.transaction(() => buyShopItemCore(req.user.id, req.params.id, true))();
    return res.json(out);
  } catch (err) {
    const r = handleShopBuyError(res, err);
    if (r) return r;
    throw err;
  }
});

/** @param {{ kind: string; url: string }} item */
function applyEquip(userId, item) {
  if (item.kind === "avatar") {
    run("UPDATE users SET avatar_url = ? WHERE id = ?", item.url, userId);
    return null;
  }
  if (item.kind === "frame") {
    run("UPDATE users SET avatar_frame_url = ? WHERE id = ?", item.url, userId);
    return null;
  }
  if (item.kind === "wallpaper") {
    run("UPDATE users SET wallpaper_url = ? WHERE id = ?", item.url, userId);
    return null;
  }
  if (item.kind === "cover") {
    run("UPDATE users SET profile_cover_url = ? WHERE id = ?", item.url, userId);
    return null;
  }
  return "bad kind";
}

function equipPayload(row) {
  return {
    ok: true,
    avatar_url: row?.avatar_url ?? "",
    wallpaper_url: row?.wallpaper_url ?? "",
    avatar_frame_url: row?.avatar_frame_url ?? "",
    profile_cover_url: row?.profile_cover_url ?? "",
    ui_font_slug: "outfit",
    ui_ink_hex: "",
    ui_accent_hex: "",
    ui_radius_slug: "default",
  };
}

router.post("/shop/items/:id/equip", authRequired, (req, res) => {
  const item = get(
    "SELECT id, kind, url, preset_value FROM shop_items WHERE id = ?",
    req.params.id,
  );
  if (!item) return res.status(404).json({ error: "not found" });
  if (!SHOP_KINDS.has(item.kind)) return res.status(400).json({ error: "bad kind" });

  const owned = get("SELECT 1 FROM user_owned_shop_items WHERE user_id = ? AND item_id = ?", req.user.id, item.id);
  if (!owned) return res.status(403).json({ error: "not owned" });

  const applyErr = applyEquip(req.user.id, item);
  if (applyErr) return res.status(400).json({ error: applyErr });
  const row = cosmeticRow(req.user.id);
  return res.json(equipPayload(row));
});

router.post("/shop/avatars/:id/equip", authRequired, (req, res) => {
  const item = get(
    "SELECT id, kind, url, preset_value FROM shop_items WHERE id = ? AND kind = 'avatar'",
    req.params.id,
  );
  if (!item) return res.status(404).json({ error: "not found" });
  const owned = get("SELECT 1 FROM user_owned_shop_items WHERE user_id = ? AND item_id = ?", req.user.id, item.id);
  if (!owned) return res.status(403).json({ error: "not owned" });
  const applyErr = applyEquip(req.user.id, item);
  if (applyErr) return res.status(400).json({ error: applyErr });
  const row = cosmeticRow(req.user.id);
  return res.json(equipPayload(row));
});

/* удалить из инвентаря: предмет снимается, если надет; вернуть можно только новой покупкой */
router.delete("/shop/my-items/:id", authRequired, (req, res) => {
  const item = get("SELECT id, kind, url FROM shop_items WHERE id = ?", req.params.id);
  if (!item) return res.status(404).json({ error: "not found" });
  const owned = get(
    "SELECT 1 FROM user_owned_shop_items WHERE user_id = ? AND item_id = ?",
    req.user.id,
    item.id,
  );
  if (!owned) return res.status(404).json({ error: "not owned" });

  const me = get(
    "SELECT nickname, avatar_url, wallpaper_url, avatar_frame_url, profile_cover_url FROM users WHERE id = ?",
    req.user.id,
  );
  if (item.kind === "avatar" && me?.avatar_url === item.url) {
    regenerateUserAvatar(req.user.id, me.nickname ?? req.user.id);
  } else if (item.kind === "frame" && me?.avatar_frame_url === item.url) {
    run("UPDATE users SET avatar_frame_url = '' WHERE id = ?", req.user.id);
  } else if (item.kind === "wallpaper" && me?.wallpaper_url === item.url) {
    run("UPDATE users SET wallpaper_url = '' WHERE id = ?", req.user.id);
  } else if (item.kind === "cover" && me?.profile_cover_url === item.url) {
    run("UPDATE users SET profile_cover_url = '' WHERE id = ?", req.user.id);
  }

  run(
    "DELETE FROM user_owned_shop_items WHERE user_id = ? AND item_id = ?",
    req.user.id,
    item.id,
  );
  const row = cosmeticRow(req.user.id);
  return res.json(equipPayload(row));
});

export default router;
