import fs from "node:fs";
import { all } from "../db.js";
import { safeResolveUploadUrl } from "./uploadSafe.js";

const SHOP_UPLOAD_SUBDIRS = ["shop-items", "shop-avatars"];

export const SHOP_STORAGE_QUOTA_BYTES = 2 * 1024 * 1024 * 1024;

const KINDS = ["avatar", "frame", "wallpaper", "cover"];

/**
 * @param {string | null | undefined} url
 */
export function fileSizeForShopUrl(url) {
  const abs = safeResolveUploadUrl(String(url ?? ""), SHOP_UPLOAD_SUBDIRS);
  if (!abs) return 0;
  try {
    const st = fs.statSync(abs);
    return st.isFile() ? st.size : 0;
  } catch {
    return 0;
  }
}

/** @param {Record<string, unknown>} row */
export function enrichShopItem(row) {
  return {
    ...row,
    size_bytes: fileSizeForShopUrl(/** @type {string} */ (row.url)),
  };
}

/** @param {Record<string, unknown>[]} rows */
export function enrichShopItems(rows) {
  return rows.map(enrichShopItem);
}

export function getShopStorageStats() {
  const rows = all("SELECT kind, url FROM shop_items WHERE url != '' AND url IS NOT NULL");
  /** @type {Record<string, number>} */
  const by_kind = Object.fromEntries(KINDS.map((k) => [k, 0]));
  /** @type {Record<string, number>} */
  const counts = Object.fromEntries(KINDS.map((k) => [k, 0]));
  const seen = new Set();
  let storage_bytes_used = 0;

  for (const row of rows) {
    const kind = String(row.kind ?? "");
    if (counts[kind] !== undefined) counts[kind] += 1;

    const url = String(row.url ?? "");
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const size = fileSizeForShopUrl(url);
    storage_bytes_used += size;
    if (by_kind[kind] !== undefined) by_kind[kind] += size;
  }

  return {
    storage_bytes_used,
    quota_bytes: SHOP_STORAGE_QUOTA_BYTES,
    by_kind,
    counts,
    item_count: rows.length,
  };
}
