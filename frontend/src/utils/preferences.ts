import { isLightTheme, normalizeThemeId, type ThemeId } from "./themes";

export type UserPreferences = {
  theme_preference?: string;
  language_preference?: string;
  font_preference?: string;
};

export function applyUserPreferences(prefs: UserPreferences) {
  const root = document.documentElement;
  const theme = normalizeThemeId(prefs.theme_preference);
  const lang = prefs.language_preference || "ru";
  const scaleKey = prefs.font_preference || "normal";

  root.setAttribute("data-theme", theme);
  root.lang = lang;
  root.style.colorScheme = isLightTheme(theme) ? "light" : "dark";

  const scale =
    scaleKey === "compact" ? "0.94" : scaleKey === "large" ? "1.08" : "1";
  root.style.setProperty("--app-font-scale", scale);

  root.removeAttribute("data-ui-font");
  root.removeAttribute("data-ui-radius");
  root.style.removeProperty("--text");
  root.style.removeProperty("--accent");
}

export type { ThemeId };
