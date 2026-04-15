export type UserPreferences = {
  theme_preference?: string;
  language_preference?: string;
  font_preference?: string;
};

export function applyUserPreferences(prefs: UserPreferences) {
  const root = document.documentElement;
  const theme = prefs.theme_preference || "black";
  const lang = prefs.language_preference || "ru";
  const font = prefs.font_preference || "normal";

  root.setAttribute("data-theme", theme);
  root.lang = lang;

  const scale =
    font === "compact" ? "0.94" : font === "large" ? "1.08" : "1";
  root.style.setProperty("--app-font-scale", scale);
}
