import { v4 as uuidv4 } from "uuid";
import { all, get, nowIso, run } from "../db.js";

export const DEFAULT_SHOP_CATEGORIES = [
  { id: "anime", name: "аниме", sort_order: 0 },
  { id: "memes", name: "мемы", sort_order: 1 },
  { id: "animals", name: "животные", sort_order: 2 },
  { id: "other", name: "другое", sort_order: 3 },
];

export function ensureShopCategoryTables() {
  run(`
    CREATE TABLE IF NOT EXISTS shop_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
  run(`
    CREATE TABLE IF NOT EXISTS shop_item_categories (
      item_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      PRIMARY KEY (item_id, category_id)
    );
  `);
  run(`CREATE INDEX IF NOT EXISTS idx_shop_item_categories_cat ON shop_item_categories(category_id)`);

  for (const c of DEFAULT_SHOP_CATEGORIES) {
    run(
      `INSERT OR IGNORE INTO shop_categories (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)`,
      c.id,
      c.name,
      c.sort_order,
      nowIso(),
    );
  }

  try {
    const legacy = all(
      `SELECT id, category FROM shop_items WHERE COALESCE(category, '') <> ''`,
    );
    for (const row of legacy) {
      const raw = String(row.category).trim().toLowerCase();
      if (!raw) continue;
      let catId = raw;
      if (!get("SELECT id FROM shop_categories WHERE id = ?", catId)) {
        const known = DEFAULT_SHOP_CATEGORIES.find((c) => c.id === catId || c.name === raw);
        if (known) catId = known.id;
        else {
          catId = `legacy-${uuidv4().slice(0, 8)}`;
          run(
            `INSERT OR IGNORE INTO shop_categories (id, name, sort_order, created_at) VALUES (?, ?, 99, ?)`,
            catId,
            raw,
            nowIso(),
          );
        }
      }
      run(
        `INSERT OR IGNORE INTO shop_item_categories (item_id, category_id) VALUES (?, ?)`,
        row.id,
        catId,
      );
    }
  } catch {
    // shop_items.category column may be absent on fresh DB
  }
}

export function listShopCategories() {
  ensureShopCategoryTables();
  return all(
    `SELECT id, name, sort_order FROM shop_categories ORDER BY sort_order ASC, name ASC`,
  );
}

export function normalizeCategorySlug(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);
}

export function parseCategoryIdsInput(body) {
  let raw = body?.categories;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = raw.split(",").map((s) => s.trim());
    }
  }
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const x of raw) {
    const id = normalizeCategorySlug(x);
    if (!id) continue;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export function categoriesForItem(itemId) {
  ensureShopCategoryTables();
  return all(
    `SELECT sc.id, sc.name
     FROM shop_item_categories sic
     JOIN shop_categories sc ON sc.id = sic.category_id
     WHERE sic.item_id = ?
     ORDER BY sc.sort_order ASC, sc.name ASC`,
    itemId,
  );
}

/** @param {string} itemId @param {string[]} categoryIds */
export function setItemCategories(itemId, categoryIds) {
  ensureShopCategoryTables();
  run("DELETE FROM shop_item_categories WHERE item_id = ?", itemId);
  for (const catId of categoryIds) {
    if (!get("SELECT id FROM shop_categories WHERE id = ?", catId)) continue;
    run(
      `INSERT OR IGNORE INTO shop_item_categories (item_id, category_id) VALUES (?, ?)`,
      itemId,
      catId,
    );
  }
}

/** @param {string[]} itemIds */
export function categoriesMapForItems(itemIds) {
  ensureShopCategoryTables();
  const map = new Map();
  if (!itemIds.length) return map;
  const placeholders = itemIds.map(() => "?").join(", ");
  const rows = all(
    `SELECT sic.item_id, sc.id, sc.name
     FROM shop_item_categories sic
     JOIN shop_categories sc ON sc.id = sic.category_id
     WHERE sic.item_id IN (${placeholders})
     ORDER BY sc.sort_order ASC, sc.name ASC`,
    ...itemIds,
  );
  for (const r of rows) {
    const list = map.get(r.item_id) ?? [];
    list.push({ id: r.id, name: r.name });
    map.set(r.item_id, list);
  }
  return map;
}

export function attachCategoriesToItems(items) {
  const ids = items.map((i) => i.id);
  const map = categoriesMapForItems(ids);
  return items.map((i) => ({
    ...i,
    categories: map.get(i.id) ?? [],
  }));
}

export function createShopCategory(id, name) {
  ensureShopCategoryTables();
  const slug = normalizeCategorySlug(id);
  const label = String(name ?? "").trim().toLowerCase();
  if (!slug) throw new Error("bad_id");
  if (!label) throw new Error("нужно название");
  if (get("SELECT id FROM shop_categories WHERE id = ?", slug)) {
    throw new Error("уже есть");
  }
  const maxSort =
    /** @type {{ m?: number }} */ (get("SELECT MAX(sort_order) as m FROM shop_categories"))?.m ?? -1;
  run(
    `INSERT INTO shop_categories (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)`,
    slug,
    label,
    maxSort + 1,
    nowIso(),
  );
  return get("SELECT id, name, sort_order FROM shop_categories WHERE id = ?", slug);
}

export function updateShopCategory(id, name) {
  ensureShopCategoryTables();
  const row = get("SELECT id FROM shop_categories WHERE id = ?", id);
  if (!row) return null;
  const label = String(name ?? "").trim().toLowerCase();
  if (!label) throw new Error("нужно название");
  run("UPDATE shop_categories SET name = ? WHERE id = ?", label, id);
  return get("SELECT id, name, sort_order FROM shop_categories WHERE id = ?", id);
}

export function deleteShopCategory(id) {
  ensureShopCategoryTables();
  run("DELETE FROM shop_item_categories WHERE category_id = ?", id);
  run("DELETE FROM shop_categories WHERE id = ?", id);
}
