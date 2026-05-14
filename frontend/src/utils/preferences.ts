export type UserPreferences = {
  theme_preference?: string;
  language_preference?: string;
  font_preference?: string;
  ui_font_slug?: string;
  ui_ink_hex?: string;
  ui_accent_hex?: string;
  ui_radius_slug?: string;
};

export function applyUserPreferences(prefs: UserPreferences) {
  const root = document.documentElement;
  const theme = prefs.theme_preference || "black";
  const lang = prefs.language_preference || "ru";
  const scaleKey = prefs.font_preference || "normal";

  root.setAttribute("data-theme", theme);
  root.lang = lang;

  const scale =
    scaleKey === "compact" ? "0.94" : scaleKey === "large" ? "1.08" : "1";
  root.style.setProperty("--app-font-scale", scale);

  const uiFont = prefs.ui_font_slug || "outfit";
  if (uiFont !== "outfit") root.setAttribute("data-ui-font", uiFont);
  else root.removeAttribute("data-ui-font");

  const ink = (prefs.ui_ink_hex || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(ink)) {
    root.style.setProperty("--text", ink.toLowerCase());
  } else {
    root.style.removeProperty("--text");
  }

  const acc = (prefs.ui_accent_hex || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(acc)) {
    root.style.setProperty("--accent", acc.toLowerCase());
  } else {
    root.style.removeProperty("--accent");
  }

  const rad = prefs.ui_radius_slug || "default";
  if (rad !== "default") root.setAttribute("data-ui-radius", rad);
  else root.removeAttribute("data-ui-radius");
}
