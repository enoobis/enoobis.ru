/** @type {Set<string>} */
export const SHOP_KINDS = new Set([
  "avatar",
  "frame",
  "wallpaper",
  "cover",
  "font",
  "ink",
  "accent",
  "radius",
]);

/** @type {Set<string>} */
export const PRESET_SHOP_KINDS = new Set(["font", "ink", "accent", "radius"]);

/** @type {Set<string>} */
const FONT_SLUGS = new Set(["outfit", "system", "serif", "mono", "readable", "dm"]);

/** @type {Set<string>} */
const RADIUS_SLUGS = new Set(["default", "soft", "sharp"]);

/** @param {unknown} v */
export function normalizeHexColor(v) {
  const s = String(v ?? "").trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) return null;
  return s.toLowerCase();
}

/** @param {unknown} v */
export function normalizeFontSlug(v) {
  const s = String(v ?? "").trim();
  if (!FONT_SLUGS.has(s)) return null;
  return s;
}

/** @param {unknown} v */
export function normalizeRadiusSlug(v) {
  const s = String(v ?? "").trim();
  if (!RADIUS_SLUGS.has(s)) return null;
  return s;
}

/**
 * @param {string} kind
 * @param {unknown} preset
 */
export function validatePresetForKind(kind, preset) {
  if (kind === "font") return normalizeFontSlug(preset);
  if (kind === "ink" || kind === "accent") return normalizeHexColor(preset);
  if (kind === "radius") return normalizeRadiusSlug(preset);
  return null;
}
