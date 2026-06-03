import { isLightTheme, normalizeThemeId, type ThemeId } from "./themes";

export type UserPreferences = {
  theme_preference?: string;
  language_preference?: string;
  font_preference?: string;
};

const LS_VIEWER_PREFS = "enoobis_viewer_prefs";

let viewerPrefs: UserPreferences = {};
let profileThemeActive = false;

function persistViewerPrefs() {
  try {
    localStorage.setItem(LS_VIEWER_PREFS, JSON.stringify(viewerPrefs));
  } catch {
    /* ignore */
  }
}

/** до vue: тема/шрифт из localStorage, без скачка при /api/me */
export function bootstrapStoredViewerPreferences() {
  try {
    const raw = localStorage.getItem(LS_VIEWER_PREFS);
    if (!raw) return;
    const stored = JSON.parse(raw) as UserPreferences;
    viewerPrefs = { ...viewerPrefs, ...stored };
    applyUserPreferences(viewerPrefs);
  } catch {
    /* ignore */
  }
}

export function isProfileThemeRoute(path: string): boolean {
  return /^\/u\/[^/]+(\/follows)?$/.test(path);
}

function applyThemeToDocument(theme: ThemeId) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = isLightTheme(theme) ? "light" : "dark";
}

export function applyUserPreferences(prefs: UserPreferences) {
  const root = document.documentElement;
  const theme = normalizeThemeId(prefs.theme_preference);
  const lang = prefs.language_preference || "ru";
  const scaleKey = prefs.font_preference || "normal";

  applyThemeToDocument(theme);
  root.lang = lang;

  const scale =
    scaleKey === "compact" ? "0.94" : scaleKey === "large" ? "1.08" : "1";
  root.style.setProperty("--app-font-scale", scale);

  root.removeAttribute("data-ui-font");
  root.removeAttribute("data-ui-radius");
  root.style.removeProperty("--text");
  root.style.removeProperty("--accent");
}

/** сохраняет настройки зрителя; на странице чужого профиля dom не трогает */
export function rememberViewerPreferences(prefs: UserPreferences) {
  viewerPrefs = { ...viewerPrefs, ...prefs };
  persistViewerPrefs();
  if (!profileThemeActive) {
    applyUserPreferences(viewerPrefs);
  }
}

/** явно применяет настройки зрителя (настройки, смена темы в /me/edit) */
export function setViewerPreferences(prefs: UserPreferences) {
  viewerPrefs = { ...viewerPrefs, ...prefs };
  profileThemeActive = false;
  persistViewerPrefs();
  applyUserPreferences(viewerPrefs);
}

/** тема владельца профиля — только data-theme, язык и шрифт зрителя не меняются */
export function applyProfileOwnerTheme(themePreference?: string | null) {
  profileThemeActive = true;
  applyThemeToDocument(normalizeThemeId(themePreference));
}

export function clearProfileOwnerTheme() {
  if (!profileThemeActive) return;
  profileThemeActive = false;
  applyUserPreferences(viewerPrefs);
}

export type { ThemeId };
